<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet-draw';

function getMagColor(mag) {
  if (mag >= 7) return '#ff1744';
  if (mag >= 6) return '#ff6d00';
  if (mag >= 5) return '#ffd600';
  return '#00e676';
}

function getMagRadius(mag) {
  return Math.max(12, Math.min(48, mag * 6));
}

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
  },
  emits: ['select-event', 'zone-created', 'zone-deleted'],

  setup(props, { emit }) {
    const mapContainer = ref(null);
    let map = null;
    let eventLayerGroup = null;
    let shakemapLayerGroup = null;
    let zonesLayerGroup = null;
    let drawnItems = null;
    let drawControl = null;
    let isFlyingToSelected = false;
    let resizeObserver = null;
    let legendControl = null;
    let magnitudeLegendControl = null;
    let hasFlownToUser = false;

    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

    /**
     * Initialize the Leaflet map, centered on Philippines.
     */
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

      eventLayerGroup = L.featureGroup().addTo(map);
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
            shapeOptions: {
              color: '#64ffda', weight: 2, opacity: 0.8, fillOpacity: 0.15,
            },
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
          layer.setStyle({
            color: '#64ffda', weight: 2, opacity: 0.8, fillOpacity: 0.15,
          });
          drawnItems.addLayer(layer);
          emit('zone-created', coordinates);
        }
      });

      map.on('click', () => {
        if (props.selectedEventId) emit('select-event', null);
      });

      setTimeout(() => map.invalidateSize(), 100);

      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          if (map) map.invalidateSize();
        });
        resizeObserver.observe(mapContainer.value);
      }
    }

    /**
     * Public method to fly to a specific location.
     */
    function flyToLocation(lat, lng, zoom) {
      if (!map) return;
      isFlyingToSelected = true;
      map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 1 });
      map.once('moveend', () => {
        isFlyingToSelected = false;
      });
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

    function renderEvents() {
      if (!eventLayerGroup) return;
      eventLayerGroup.clearLayers();
      if (!props.events || props.events.length === 0) return;

      props.events.forEach((event) => {
        if (!event.latitude || !event.longitude) return;

        const isSelected = event.id === props.selectedEventId;
        const marker = L.marker([event.latitude, event.longitude], {
          icon: createMagMarker(event, isSelected),
          riseOnHover: true,
        });

        const timeStr = event.time
          ? new Date(event.time).toLocaleString()
          : 'Unknown';
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
            <div class="popup-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
              <button class="popup-btn shake-btn" data-event-id="${event.id}">
                Show ShakeMap
              </button>
              <button class="popup-btn felt-btn-popup" data-event-id="${event.id}">
                I felt it
              </button>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 320,
          className: 'quake-popup-container',
        });

        // Robust popup event delegation using closest()
        marker.on('popupopen', () => {
          setTimeout(() => {
            const popupEl = marker.getPopup()?.getElement();
            if (!popupEl) return;

            const handleClick = (e) => {
              const shakeBtn = e.target.closest('.shake-btn');
              const feltBtn = e.target.closest('.felt-btn-popup');

              if (shakeBtn) {
                e.stopPropagation();
                emit('select-event', shakeBtn.dataset.eventId);
                marker.closePopup();
              } else if (feltBtn) {
                e.stopPropagation();
                emit('select-event', feltBtn.dataset.eventId);
                marker.closePopup();
                document.dispatchEvent(new CustomEvent('show-felt-dialog'));
              }
            };

            popupEl.addEventListener('click', handleClick);
            marker.once('popupclose', () => {
              popupEl.removeEventListener('click', handleClick);
            });
          }, 50);
        });

        marker.on('click', () => {
          emit('select-event', event.id);
        });

        eventLayerGroup.addLayer(marker);
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
          map.once('moveend', () => {
            isFlyingToSelected = false;
          });
        }
      }
    }

    function renderShakeMap() {
      if (!shakemapLayerGroup) return;
      shakemapLayerGroup.clearLayers();
      if (!props.shakemapContours) return;

      const data = props.shakemapContours;
      const features = data.features || [];

      if (features.length === 0) {
        if (data.geometry) {
          try {
            const layer = L.geoJSON(data, { style: getContourStyle });
            shakemapLayerGroup.addLayer(layer);
          } catch (err) {
            console.warn('[MapView] Could not parse ShakeMap geometry:', err.message);
          }
        }
        return;
      }

      const contourLayer = L.geoJSON(data, {
        style: getContourStyle,
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const mmi = feature.properties.MMI || feature.properties.value || feature.properties.CONTAMMI;
            const label = mmi != null ? `MMI ${mmi}` : 'Intensity contour';
            layer.bindTooltip(label, { sticky: true, className: 'shakemap-tooltip' });
          }
        },
      });

      shakemapLayerGroup.addLayer(contourLayer);

      if (contourLayer.getBounds().isValid()) {
        map.fitBounds(contourLayer.getBounds(), { padding: [50, 50], maxZoom: 10 });
      }
    }

    function getContourStyle(feature) {
      const mmi = feature?.properties?.MMI ||
                  feature?.properties?.value ||
                  feature?.properties?.CONTAMMI || 0;
      const colors = {
        1: '#ffffff', 2: '#dcdcdc', 3: '#c8c8c8',
        4: '#b0b0b0', 5: '#ffff00', 6: '#ffcc00',
        7: '#ff9900', 8: '#ff6600', 9: '#ff3300', 10: '#ff0000',
      };
      const color = colors[Math.round(mmi)] || '#ff0000';
      const isPolygon = feature?.geometry?.type === 'Polygon' ||
                        feature?.geometry?.type === 'MultiPolygon';
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

    // Magnitude legend
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

    // ShakeMap MMI legend
    const shakemapLegend = {
      onAdd() {
        const div = L.DomUtil.create('div', 'map-legend shakemap-legend');
        div.innerHTML = `
          <div class="legend-title">MMI Intensity</div>
          <div class="legend-items">
            <div class="legend-item"><span style="background:#ffffff"></span> I</div>
            <div class="legend-item"><span style="background:#ffff00"></span> V</div>
            <div class="legend-item"><span style="background:#ffcc00"></span> VI</div>
            <div class="legend-item"><span style="background:#ff9900"></span> VII</div>
            <div class="legend-item"><span style="background:#ff6600"></span> VIII</div>
            <div class="legend-item"><span style="background:#ff3300"></span> IX</div>
            <div class="legend-item"><span style="background:#ff0000"></span> X+</div>
          </div>
        `;
        return div;
      },
    };

    // ============================================================
    // Watchers
    // ============================================================

    watch(() => props.events, () => {
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

    // Auto-fly to user location when it becomes available
    watch(() => props.userLocation, (loc) => {
      if (loc && loc.lat != null && loc.lng != null && !hasFlownToUser) {
        hasFlownToUser = true;
        nextTick(() => {
          isFlyingToSelected = true;
          map.flyTo([loc.lat, loc.lng], 8, { duration: 1.5 });
          map.once('moveend', () => {
            isFlyingToSelected = false;
          });
        });
      }
    }, { immediate: false });

    // ============================================================
    // Lifecycle
    // ============================================================

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
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (magnitudeLegendControl && map) { map.removeControl(magnitudeLegendControl); }
      if (map) { map.remove(); map = null; }
    });

    // Expose flyToLocation as public method
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

.quake-popup-container .leaflet-popup-content-wrapper {
  background: #1a1a2e; color: #ccd6f6; border: 1px solid #233554; border-radius: 8px;
}
.quake-popup-container .leaflet-popup-tip { background: #1a1a2e; border: 1px solid #233554; }
.quake-popup-container .leaflet-popup-content { margin: 12px 16px; }
.quake-popup p { margin: 4px 0; font-size: 13px; color: #8892b0; }

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

.leaflet-draw-toolbar a { background-color: #1a1a2e !important; background-image: url('https://unpkg.com/leaflet-draw@1.0.4/dist/images/spritesheet.png') !important; }
.leaflet-draw-toolbar a:hover { background-color: #16213e !important; }
.leaflet-draw-actions a { background: #1a1a2e !important; color: #ccd6f6 !important; }
.leaflet-draw-actions a:hover { background: #16213e !important; }
</style>