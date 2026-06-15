<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet.markercluster';

function getMagColor(mag) {
  if (mag >= 7) return '#ff1744';
  if (mag >= 6) return '#ff6d00';
  if (mag >= 5) return '#ffd600';
  return '#00e676';
}

function getMagRadius(mag) {
  return Math.max(12, Math.min(48, mag * 6));
}

const MMI_DESCRIPTIONS = {
  1: 'Not felt', 2: 'Weak', 3: 'Weak', 4: 'Light',
  5: 'Moderate', 6: 'Strong', 7: 'Very strong', 8: 'Severe',
  9: 'Violent', 10: 'Extreme',
};

const MMI_COLORS = {
  1: '#ffffff', 2: '#dcdcdc', 3: '#c8c8c8', 4: '#b0b0b0',
  5: '#ffff00', 6: '#ffcc00', 7: '#ff9900', 8: '#ff6600',
  9: '#ff3300', 10: '#ff0000',
};

export default {
  name: 'MapView',
  props: {
    events: { type: Array, default: () => [] },
    selectedEventId: { type: String, default: null },
    watchZones: { type: Array, default: () => [] },
    shakemapContours: { type: Object, default: null },
    loading: Boolean,
    error: String,
    userLocation: { type: Object, default: null },
    userAccuracy: { type: Number, default: null },
    mapMinMagnitude: { type: Number, default: 2.0 },
    followLocation: { type: Boolean, default: true },
    soilType: { type: Number, default: 1.0 },
  },
  emits: ['select-event', 'zone-created', 'zone-deleted'],

  setup(props, { emit }) {
    const mapContainer = ref(null);
    let map = null;
    let eventClusterGroup = null;
    let shakemapLayerGroup = null;
    let zonesLayerGroup = null;
    let drawnItems = null;
    let drawControl = null;
    let isFlyingToSelected = false;
    let resizeObserver = null;
    let legendControl = null;
    let magnitudeLegendControl = null;
    let userMarker = null;
    let userAccuracyCircle = null;
    let seismogramAnimId = null;
    // Store the last rendered shakeMap contours so we can render on demand
    let pendingShakemapEventId = null;
    let shakemapDataCache = null;

    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

    function initMap() {
      if (!mapContainer.value) return;

      map = L.map(mapContainer.value, {
        center: [12.8797, 121.7740],
        zoom: 6,
        zoomControl: true,
        attributionControl: true,
        trackResize: false,
      });

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Use markerClusterGroup for event markers
      eventClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 16,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? 36 : count < 50 ? 44 : 52;
          return L.divIcon({
            html: `<div style="
              width:${size}px;height:${size}px;border-radius:50%;
              background:rgba(100,255,218,0.15);
              border:2px solid #64ffda;color:#64ffda;
              font-weight:700;font-size:${count < 10 ? 12 : 14}px;
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 0 8px rgba(100,255,218,0.3);
            ">${count}</div>`,
            className: 'cluster-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
      map.addLayer(eventClusterGroup);

      shakemapLayerGroup = L.featureGroup().addTo(map);
      zonesLayerGroup = L.featureGroup().addTo(map);

      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: '#64ffda', weight: 2, opacity: 0.8, fillOpacity: 0.15 },
          },
          polyline: false, rectangle: false, circle: false,
          circlemarker: false, marker: false,
        },
        edit: { featureGroup: drawnItems, remove: true },
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;
        if (event.layerType === 'polygon') {
          const latlngs = layer.getLatLngs()[0];
          const coordinates = latlngs.map((ll) => [ll.lng, ll.lat]);
          layer.setStyle({ color: '#64ffda', weight: 2, opacity: 0.8, fillOpacity: 0.15 });
          drawnItems.addLayer(layer);
          emit('zone-created', coordinates);
        }
      });

      map.on('click', () => {
        if (props.selectedEventId) emit('select-event', null);
        // Also clear ShakeMap when map background is clicked
        clearShakeMap();
      });

      // Listen for the custom 'show-shakemap' event dispatched from popup buttons
      document.addEventListener('show-shakemap', onShowShakeMap);

      setTimeout(() => map.invalidateSize(), 100);

      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          if (map) map.invalidateSize();
        });
        resizeObserver.observe(mapContainer.value);
      }
    }

    function clearShakeMap() {
      if (shakemapLayerGroup) {
        shakemapLayerGroup.clearLayers();
      }
      if (legendControl && map) {
        map.removeControl(legendControl);
        legendControl = null;
      }
      pendingShakemapEventId = null;
      shakemapDataCache = null;
    }

    /**
     * On-demand ShakeMap rendering: only render when user clicks "Show ShakeMap" button.
     * Generates contours using the provided generateApproximateShakeMap function on the event.
     */
    function onShowShakeMap(e) {
      const eventId = e.detail;
      if (!eventId) return;

      // Find the event in props
      const event = props.events.find((ev) => ev.id === eventId);
      if (!event) return;

      // Clear previous shakemap
      shakemapLayerGroup.clearLayers();
      if (legendControl && map) {
        map.removeControl(legendControl);
        legendControl = null;
      }

      // Generate the ShakeMap contours from the event data
      const eventData = {
        magnitude: event.magnitude,
        depth: event.depth,
        latitude: event.latitude,
        longitude: event.longitude,
        place: event.place,
      };
      generatedShakeMapForEvent(eventData);
    }

    /**
     * Generate and render ShakeMap contours for an event locally.
     * Uses the same formula as App.vue's generateApproximateShakeMap.
     */
    function generatedShakeMapForEvent(event) {
      const mag = event.magnitude || 0;
      const depth = event.depth || 10;
      const lat = event.latitude;
      const lng = event.longitude;
      const siteAmp = props.soilType || 1.0;

      if (!lat || !lng || mag < 4.5) return;

      const levels = [8, 7, 6, 5, 4, 3, 2].filter(mmi => mmi <= 1.5 * mag - 1);
      if (levels.length === 0) return;

      const mmiDesc = ['', 'Not felt', 'Weak', 'Weak', 'Light', 'Moderate', 'Strong', 'Very strong', 'Severe', 'Violent', 'Extreme'];
      const c = 1.8;
      const depthFactor = Math.min(1.2, 10 / (depth + 5));

      const features = [];

      for (const mmi of levels) {
        let radiusKm = Math.pow(10, (mag - Math.log10(mmi)) / c);
        radiusKm = Math.min(radiusKm, 400);
        if (radiusKm < 5) continue;
        radiusKm *= depthFactor;
        radiusKm *= Math.sqrt(siteAmp);

        const radiusM = radiusKm * 1000;
        const points = [];
        const segments = 32;

        for (let j = 0; j <= segments; j++) {
          const angle = (j / segments) * 2 * Math.PI;
          const dLat = (radiusM / 111320) * Math.cos(angle);
          const dLng = (radiusM / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
          points.push([lng + dLng, lat + dLat]);
        }

        const desc = mmiDesc[mmi] || '';
        features.push({
          type: 'Feature',
          properties: { MMI: mmi, label: `MMI ${mmi} – ${desc}` },
          geometry: { type: 'Polygon', coordinates: [points] },
        });
      }

      // Render the contour layer
      if (features.length === 0) return;

      const contourLayer = L.geoJSON({
        type: 'FeatureCollection',
        features,
      }, {
        style: getContourStyle,
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const mmiVal = feature.properties.MMI;
            const desc = mmiVal != null ? (MMI_DESCRIPTIONS[Math.round(mmiVal)] || 'Strong') : '';
            const label = mmiVal != null ? `MMI ${mmiVal} (${desc})` : 'Intensity contour';
            layer.bindTooltip(label, { sticky: true, className: 'shakemap-tooltip' });
          }
        },
      });

      shakemapLayerGroup.addLayer(contourLayer);

      // Fit bounds with padding
      if (contourLayer.getBounds().isValid()) {
        map.fitBounds(contourLayer.getBounds(), { padding: [50, 50], maxZoom: 10 });
      }

      // Add legend
      if (!legendControl) {
        legendControl = L.control({ position: 'bottomright' });
        legendControl.onAdd = shakemapLegend.onAdd;
        legendControl.addTo(map);
      }
    }

    function flyToLocation(lat, lng, zoom) {
      if (!map) return;
      isFlyingToSelected = true;
      map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 1 });
      map.once('moveend', () => { isFlyingToSelected = false; });
    }

    function createMagMarker(event, isSelected) {
      const mag = event.magnitude || 0;
      const color = getMagColor(mag);
      const radius = getMagRadius(mag);
      const size = radius * 2;
      const fontSize = Math.max(11, Math.min(16, radius * 0.55));

      return L.divIcon({
        className: 'mag-marker',
        html: `<div class="mag-marker-inner" style="
          width:${size}px; height:${size}px;
          background:${color};
          border:${isSelected ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.7)'};
          box-shadow:${isSelected ? '0 0 12px rgba(100,255,218,0.6)' : '0 0 4px rgba(0,0,0,0.5)'};
          font-size:${fontSize}px;
          line-height:${size}px;
        ">${mag.toFixed(1)}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      });
    }

    function renderSeismogram(canvas, event) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;
      const mag = event?.magnitude || 5;
      const distance = 100;

      const amplitude = Math.min(20, Math.max(5, mag * 2 - distance / 100));
      const pWaveFreq = 12;
      const sWaveFreq = 4;
      const duration = 5000;
      const pWaveDuration = 200;
      const startTime = performance.now();

      function draw() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(35,53,84,0.4)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 1.5;

        const numPoints = Math.floor(w / 2);
        for (let i = 0; i < numPoints; i++) {
          const time = (i / numPoints) * duration * progress;
          const t = time / 1000;
          const envelope = Math.exp(-t * 1.2);
          const pWave = (time < pWaveDuration)
            ? Math.sin(2 * Math.PI * pWaveFreq * t) * 0.8 * (1 - time / pWaveDuration)
            : 0;
          const sWave = (time >= pWaveDuration)
            ? Math.sin(2 * Math.PI * sWaveFreq * t) * envelope
            : 0;
          const signal = (pWave + sWave) * amplitude;
          const noise = (Math.random() - 0.5) * 0.5;
          const y = midY + signal + noise;
          const x = (i / numPoints) * w * progress;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = '#8892b0';
        ctx.font = '8px sans-serif';
        ctx.fillText('Simulated seismogram', 4, 10);

        if (progress < 1) {
          seismogramAnimId = requestAnimationFrame(draw);
        }
      }

      if (seismogramAnimId) cancelAnimationFrame(seismogramAnimId);
      seismogramAnimId = requestAnimationFrame(draw);
    }

    function renderEvents() {
      if (!eventClusterGroup) return;
      eventClusterGroup.clearLayers();
      if (!props.events || props.events.length === 0) return;

      const filtered = props.mapMinMagnitude > 2
        ? props.events.filter((e) => (e.magnitude || 0) >= props.mapMinMagnitude)
        : props.events;

      filtered.forEach((event) => {
        if (!event.latitude || !event.longitude) return;

        const isSelected = event.id === props.selectedEventId;
        const marker = L.marker([event.latitude, event.longitude], {
          icon: createMagMarker(event, isSelected),
          riseOnHover: true,
        });

        const timeStr = event.time ? new Date(event.time).toLocaleString() : 'Unknown';
        const color = getMagColor(event.magnitude);

        const popupContent = `
          <div class="quake-popup">
            <div class="popup-header" style="color:${color}; font-weight:bold; font-size:16px;">
              M${event.magnitude?.toFixed(1) || '?'}
            </div>
            <div class="popup-body">
              <p><strong>Location:</strong> ${event.place || 'Unknown'}</p>
              <p><strong>Time:</strong> ${timeStr}</p>
              <p><strong>Depth:</strong> ${event.depth?.toFixed(1) || '?'} km</p>
              ${event.mmi ? `<p><strong>MMI:</strong> ${event.mmi}</p>` : ''}
              ${event.felt ? `<p><strong>Felt reports:</strong> ${event.felt}</p>` : ''}
              ${event.source ? `<p><strong>Source:</strong> ${event.source}</p>` : ''}
            </div>
            <div class="seismogram-container">
              <canvas class="seismogram-canvas" width="276" height="60"></canvas>
            </div>
            <div class="popup-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
              <button class="popup-btn shake-btn" data-event-id="${event.id}">
                Show ShakeMap
              </button>
              <button class="popup-btn felt-btn-popup" data-event-id="${event.id}">
                I felt it
              </button>
              <button class="popup-btn timeline-btn" data-event-id="${event.id}">
                📊 Shaking Timeline
              </button>
              <button class="popup-btn share-image-btn" data-event-id="${event.id}">
                🖼 Share as image
              </button>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 320,
          className: 'quake-popup-container',
        });

        marker.on('popupopen', () => {
          setTimeout(() => {
            const popupEl = marker.getPopup()?.getElement();
            if (!popupEl) return;

            const canvas = popupEl.querySelector('.seismogram-canvas');
            if (canvas) renderSeismogram(canvas, event);

            const shareImgBtn = popupEl.querySelector('.share-image-btn');
            if (shareImgBtn) {
              shareImgBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                marker.closePopup();
                await shareEventAsImage(event);
              }, { once: true });
            }

            const handleClick = (e) => {
              const shakeBtn = e.target.closest('.shake-btn');
              const feltBtn = e.target.closest('.felt-btn-popup');
              const timelineBtn = e.target.closest('.timeline-btn');

              if (shakeBtn) {
                e.stopPropagation();
                const eventId = shakeBtn.dataset.eventId;
                emit('select-event', eventId);
                marker.closePopup();
                // On-demand ShakeMap: dispatch custom event
                document.dispatchEvent(new CustomEvent('show-shakemap', { detail: eventId }));
              } else if (feltBtn) {
                e.stopPropagation();
                emit('select-event', feltBtn.dataset.eventId);
                marker.closePopup();
                document.dispatchEvent(new CustomEvent('show-felt-dialog'));
              } else if (timelineBtn) {
                e.stopPropagation();
                marker.closePopup();
                document.dispatchEvent(new CustomEvent('open-shaking-timeline', { detail: timelineBtn.dataset.eventId }));
              }
            };

            popupEl.addEventListener('click', handleClick);
            marker.once('popupclose', () => {
              popupEl.removeEventListener('click', handleClick);
              if (seismogramAnimId) cancelAnimationFrame(seismogramAnimId);
            });
          }, 50);
        });

        marker.on('click', () => {
          emit('select-event', event.id);
        });

        eventClusterGroup.addLayer(marker);
      });

      // Fly to selected event, preserving current zoom level
      if (props.selectedEventId && !isFlyingToSelected) {
        const selEvent = props.events.find((e) => e.id === props.selectedEventId);
        if (selEvent && selEvent.latitude && selEvent.longitude) {
          isFlyingToSelected = true;
          const currentZoom = map.getZoom();
          map.flyTo([selEvent.latitude, selEvent.longitude], currentZoom, {
            duration: 0.8,
          });
          map.once('moveend', () => { isFlyingToSelected = false; });
        }
      }
    }

    async function shareEventAsImage(event) {
      try {
        const { toPng } = await import('html-to-image');
        const div = document.createElement('div');
        div.style.cssText = `
          width:400px; padding:24px; background:#1a1a2e; border-radius:12px;
          font-family:Inter,-apple-system,sans-serif; position:absolute; left:-9999px; top:0;
        `;
        div.innerHTML = `
          <div style="text-align:center; margin-bottom:16px;">
            <span style="font-size:11px; color:#64ffda; text-transform:uppercase; letter-spacing:2px;">Earthquake Alert System</span>
          </div>
          <div style="font-size:48px; font-weight:700; color:${getMagColor(event.magnitude)}; text-align:center;">
            M${event.magnitude?.toFixed(1) || '?'}
          </div>
          <div style="font-size:18px; color:#ccd6f6; text-align:center; margin:8px 0;">
            ${event.place || 'Unknown location'}
          </div>
          <div style="display:flex; justify-content:center; gap:24px; margin:16px 0; color:#8892b0; font-size:13px;">
            <div style="text-align:center;">
              <div style="font-size:11px; color:#8892b0;">Depth</div>
              <div style="font-weight:600; color:#ccd6f6;">${event.depth?.toFixed(1) || '?'} km</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:11px; color:#8892b0;">Time</div>
              <div style="font-weight:600; color:#ccd6f6;">${event.time ? new Date(event.time).toLocaleString() : 'Unknown'}</div>
            </div>
          </div>
          <div style="height:2px; background:linear-gradient(90deg, #64ffda, #ff6d00); margin:12px 0;"></div>
          <div style="text-align:center; font-size:10px; color:#8892b0;">
            Primary source: PHIVOLCS (supplemental: USGS)
          </div>
        `;
        document.body.appendChild(div);
        const dataUrl = await toPng(div, { quality: 0.95, pixelRatio: 2 });
        document.body.removeChild(div);

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `earthquake-m${event.magnitude?.toFixed(1)}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `M${event.magnitude?.toFixed(1)} Earthquake`, text: `${event.place}`, files: [file] });
        } else {
          const link = document.createElement('a');
          link.download = `earthquake-m${event.magnitude?.toFixed(1)}.png`;
          link.href = dataUrl;
          link.click();
        }
      } catch (err) {
        console.warn('[MapView] Share as image failed:', err.message);
      }
    }

    function renderShakeMap() {
      // No longer auto-renders from shakemapContours prop.
      // ShakeMap is now on-demand via the 'show-shakemap' custom event.
    }

    function getContourStyle(feature) {
      const mmi = feature?.properties?.MMI || feature?.properties?.value || feature?.properties?.CONTAMMI || 0;
      const color = MMI_COLORS[Math.round(mmi)] || '#ff0000';
      const isPolygon = feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon';
      return {
        color, weight: isPolygon ? 1 : 2, opacity: 0.6,
        fillColor: color, fillOpacity: isPolygon ? 0.15 : 0,
      };
    }

    function renderZones() {
      if (!zonesLayerGroup) return;
      zonesLayerGroup.clearLayers();
      if (!props.watchZones || props.watchZones.length === 0) return;

      props.watchZones.forEach((zone) => {
        if (!zone.polygon || zone.polygon.length < 3) return;
        const latlngs = zone.polygon.map(([lon, lat]) => [lat, lon]);
        const polygon = L.polygon(latlngs, {
          color: '#64ffda', weight: 2, opacity: 0.8,
          fillColor: '#64ffda', fillOpacity: 0.1, dashArray: '5, 10',
        });
        polygon.bindTooltip(
          `${zone.name || 'Watch Zone'} (≥M${zone.min_magnitude || 4.5})`,
          { sticky: true, className: 'zone-tooltip' }
        );
        zonesLayerGroup.addLayer(polygon);
      });
    }

    const magLegend = {
      onAdd() {
        const div = L.DomUtil.create('div', 'map-legend mag-legend');
        div.innerHTML = `
          <div class="legend-title">Magnitude</div>
          <div class="legend-items">
            <div class="legend-item"><span style="background:#ff1744"></span> ≥ 7.0</div>
            <div class="legend-item"><span style="background:#ff6d00"></span> 6.0 – 6.9</div>
            <div class="legend-item"><span style="background:#ffd600"></span> 5.0 – 5.9</div>
            <div class="legend-item"><span style="background:#00e676"></span> 4.5 – 4.9</div>
          </div>
        `;
        return div;
      },
    };

    const shakemapLegend = {
      onAdd() {
        const div = L.DomUtil.create('div', 'map-legend shakemap-legend');
        let items = Object.entries(MMI_DESCRIPTIONS).map(([mmi, desc]) => {
          const color = MMI_COLORS[mmi] || '#ff0000';
          const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][mmi] || mmi;
          return `<div class="legend-item"><span style="background:${color}"></span> ${roman} – ${desc}</div>`;
        }).join('');
        div.innerHTML = `
          <div class="legend-title">ShakeMap Intensity</div>
          <div class="legend-items">${items}</div>
        `;
        return div;
      },
    };

    // Watchers
    watch(() => [props.events, props.mapMinMagnitude], () => {
      nextTick(() => renderEvents());
    }, { deep: true });

    watch(() => props.selectedEventId, () => {
      nextTick(() => renderEvents());
    });

    watch(() => props.shakemapContours, () => {
      nextTick(() => {
        renderShakeMap();
        if (props.shakemapContours && !legendControl) {
          legendControl = L.control({ position: 'bottomright' });
          legendControl.onAdd = shakemapLegend.onAdd;
          legendControl.addTo(map);
        } else if (!props.shakemapContours && legendControl) {
          map.removeControl(legendControl);
          legendControl = null;
        }
      });
    });

    watch(() => props.watchZones, () => {
      nextTick(() => renderZones());
    }, { deep: true });

    watch(() => props.userLocation, (loc) => {
      if (!map) return;
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
      if (userAccuracyCircle) { map.removeLayer(userAccuracyCircle); userAccuracyCircle = null; }
      if (loc && loc.lat != null && loc.lng != null) {
        userMarker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div class="user-location-dot"></div><div class="user-location-pulse"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          zIndexOffset: 1000,
        }).addTo(map);
        userMarker.bindTooltip('You are here', { permanent: false, direction: 'top' });
        if (props.userAccuracy != null) {
          userAccuracyCircle = L.circle([loc.lat, loc.lng], {
            radius: props.userAccuracy,
            color: '#64ffda', weight: 1, fillOpacity: 0.1, dashArray: '4, 4', fillColor: '#64ffda',
          }).addTo(map);
        }
      }
    }, { immediate: true });

    onMounted(() => {
      initMap();

      magnitudeLegendControl = L.control({ position: 'bottomright' });
      magnitudeLegendControl.onAdd = magLegend.onAdd;
      magnitudeLegendControl.addTo(map);

      nextTick(() => {
        renderEvents();
        renderZones();
      });
    });

    onBeforeUnmount(() => {
      document.removeEventListener('show-shakemap', onShowShakeMap);
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (magnitudeLegendControl && map) { map.removeControl(magnitudeLegendControl); }
      if (seismogramAnimId) cancelAnimationFrame(seismogramAnimId);
      if (map) { map.remove(); map = null; }
    });

    return { mapContainer, flyToLocation };
  },
};
</script>

<style>
.map-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }

.mag-marker { background: transparent !important; border: none !important; }

.mag-marker-inner {
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #000; text-shadow: 0 0 2px rgba(255,255,255,0.3);
  transition: transform 0.15s, box-shadow 0.15s; cursor: pointer;
}
.mag-marker-inner:hover { transform: scale(1.15); }

.cluster-icon { background: none !important; border: none !important; }

.quake-popup-container .leaflet-popup-content-wrapper {
  background: #1a1a2e; color: #ccd6f6; border: 1px solid #233554; border-radius: 8px;
}
.quake-popup-container .leaflet-popup-tip { background: #1a1a2e; border: 1px solid #233554; }
.quake-popup-container .leaflet-popup-content { margin: 12px 16px; }
.quake-popup p { margin: 4px 0; font-size: 13px; color: #8892b0; }

.seismogram-container { margin: 8px 0; border-radius: 6px; overflow: hidden; }
.seismogram-canvas { display: block; width: 100%; height: 60px; background: #0f0f23; border-radius: 6px; }

.popup-btn {
  background: #233554; color: #64ffda; border: 1px solid #2e4a6b;
  padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.2s;
}
.popup-btn:hover { background: #2e4a6b; }

.map-legend {
  background: rgba(15, 15, 35, 0.92); padding: 10px 14px; border-radius: 8px;
  border: 1px solid #233554; font-size: 12px; color: #ccd6f6;
  backdrop-filter: blur(4px); margin-bottom: 6px;
}
.legend-title { font-weight: bold; margin-bottom: 6px; color: #64ffda; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
.legend-items { display: flex; flex-direction: column; gap: 3px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.legend-item span { display: inline-block; width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }

.shakemap-tooltip { background: rgba(26, 26, 46, 0.9) !important; color: #ccd6f6 !important; border: 1px solid #233554 !important; font-size: 11px !important; padding: 4px 8px !important; }
.zone-tooltip { background: rgba(26, 26, 46, 0.9) !important; color: #64ffda !important; border: 1px solid #64ffda !important; font-size: 11px !important; padding: 4px 8px !important; }

.user-location-marker { background: none !important; border: none !important; }
.user-location-dot {
  width: 16px; height: 16px; background: #64ffda; border-radius: 50%;
  border: 3px solid #1a1a2e; box-shadow: 0 0 4px rgba(100, 255, 218, 0.8);
  position: absolute; top: 4px; left: 4px; z-index: 2;
}
.user-location-pulse {
  width: 24px; height: 24px; background: rgba(100, 255, 218, 0.3); border-radius: 50%;
  animation: user-loc-pulse 2s infinite; position: absolute; top: 0; left: 0;
}
@keyframes user-loc-pulse {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.5); opacity: 0.2; }
  100% { transform: scale(1); opacity: 0.6; }
}

.marker-cluster-small { background: rgba(100, 255, 218, 0.15) !important; }
.marker-cluster-small div { background: transparent !important; }
.marker-cluster-medium { background: rgba(100, 255, 218, 0.2) !important; }
.marker-cluster-medium div { background: transparent !important; }
.marker-cluster-large { background: rgba(100, 255, 218, 0.25) !important; }
.marker-cluster-large div { background: transparent !important; }

.leaflet-draw-toolbar a { background-color: #1a1a2e !important; background-image: url('https://unpkg.com/leaflet-draw@1.0.4/dist/images/spritesheet.png') !important; }
.leaflet-draw-toolbar a:hover { background-color: #16213e !important; }
.leaflet-draw-actions a { background: #1a1a2e !important; color: #ccd6f6 !important; }
.leaflet-draw-actions a:hover { background: #16213e !important; }
</style>