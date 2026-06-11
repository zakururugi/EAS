<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet-draw';

/**
 * Get color based on earthquake magnitude.
 */
function getMagColor(mag) {
  if (mag >= 7) return '#ff1744';   // Major - Red
  if (mag >= 6) return '#ff6d00';   // Strong - Orange
  if (mag >= 5) return '#ffd600';   // Moderate - Yellow
  return '#00e676';                  // Light - Green
}

/**
 * Get circle radius based on magnitude.
 */
function getMagRadius(mag) {
  return Math.max(8, Math.min(40, mag * 6));
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

    // Tile layer URL with dark theme
    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

    /**
     * Initialize the Leaflet map.
     */
    function initMap() {
      if (!mapContainer.value) return;

      map = L.map(mapContainer.value, {
        center: [0, 0],
        zoom: 2,
        zoomControl: true,
        attributionControl: true,
      });

      // Add dark tile layer
      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Initialize feature groups
      eventLayerGroup = L.featureGroup().addTo(map);
      shakemapLayerGroup = L.featureGroup().addTo(map);
      zonesLayerGroup = L.featureGroup().addTo(map);

      // Initialize drawn items for Leaflet.draw
      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      // Add draw control
      drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
              color: '#64ffda',
              weight: 2,
              opacity: 0.8,
              fillOpacity: 0.15,
            },
          },
          polyline: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      });
      map.addControl(drawControl);

      // Handle draw events
      map.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;

        if (event.layerType === 'polygon') {
          // Extract polygon coordinates as [lon, lat] pairs
          const latlngs = layer.getLatLngs()[0];
          const coordinates = latlngs.map((ll) => [ll.lng, ll.lat]);

          // Style the drawn polygon
          layer.setStyle({
            color: '#64ffda',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.15,
          });

          drawnItems.addLayer(layer);
          emit('zone-created', coordinates);
        }
      });

      map.on(L.Draw.Event.DELETED, () => {
        // The deleted event fires but doesn't tell us which layer was removed
        // We'll handle zone deletion from the settings panel
      });

      // Handle map click to deselect
      map.on('click', () => {
        if (props.selectedEventId) {
          emit('select-event', null);
        }
      });

      // Fit world bounds
      map.fitWorld();

      // Invalidate size after mount
      setTimeout(() => map.invalidateSize(), 100);
    }

    /**
     * Render earthquake epicenters as circles on the map.
     */
    function renderEvents() {
      if (!eventLayerGroup) return;
      eventLayerGroup.clearLayers();

      if (!props.events || props.events.length === 0) return;

      props.events.forEach((event) => {
        if (!event.latitude || !event.longitude) return;

        const isSelected = event.id === props.selectedEventId;
        const color = getMagColor(event.magnitude);
        const radius = getMagRadius(event.magnitude);

        const circle = L.circleMarker([event.latitude, event.longitude], {
          radius,
          fillColor: color,
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 3 : 1.5,
          opacity: 0.9,
          fillOpacity: isSelected ? 0.9 : 0.5,
        });

        // Format time
        const timeStr = event.time
          ? new Date(event.time).toLocaleString()
          : 'Unknown';

        // Create popup content
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
            </div>
            <div class="popup-actions" style="margin-top:8px; display:flex; gap:6px;">
              <button class="popup-btn shake-btn" data-event-id="${event.id}">
                Show ShakeMap
              </button>
              <button class="popup-btn felt-btn-popup" data-event-id="${event.id}">
                I felt it
              </button>
            </div>
          </div>
        `;

        circle.bindPopup(popupContent, {
          maxWidth: 320,
          className: 'quake-popup-container',
        });

        // Handle popup open events for button clicks
        circle.on('popupopen', () => {
          // Defer: wait for popup DOM to render
          setTimeout(() => {
            const shakeBtn = document.querySelector('.shake-btn');
            const feltBtn = document.querySelector('.felt-btn-popup');

            if (shakeBtn) {
              shakeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = e.target.dataset.eventId;
                emit('select-event', eventId);
                circle.closePopup();
              });
            }

            if (feltBtn) {
              feltBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = e.target.dataset.eventId;
                emit('select-event', eventId);
                circle.closePopup();
                // Tell App to show felt dialog
                // We emit a custom event that App can listen to
                document.dispatchEvent(new CustomEvent('show-felt-dialog'));
              });
            }
          }, 50);
        });

        // Click also selects
        circle.on('click', () => {
          emit('select-event', event.id);
        });

        eventLayerGroup.addLayer(circle);
      });

      // If an event is selected, fly to it
      if (props.selectedEventId) {
        const selectedEvent = props.events.find((e) => e.id === props.selectedEventId);
        if (selectedEvent && selectedEvent.latitude && selectedEvent.longitude) {
          map.flyTo([selectedEvent.latitude, selectedEvent.longitude], 6, {
            duration: 1,
          });
        }
      }
    }

    /**
     * Render ShakeMap intensity contours.
     */
    function renderShakeMap() {
      if (!shakemapLayerGroup) return;
      shakemapLayerGroup.clearLayers();

      if (!props.shakemapContours) return;

      const data = props.shakemapContours;

      // Check if it's a FeatureCollection
      const features = data.features || [];

      if (features.length === 0) {
        // Maybe it's a single geometry or different format
        if (data.geometry) {
          try {
            const layer = L.geoJSON(data, {
              style: getContourStyle,
            });
            shakemapLayerGroup.addLayer(layer);
          } catch (err) {
            console.warn('[MapView] Could not parse ShakeMap geometry:', err.message);
          }
        }
        return;
      }

      // Parse contour features (MMI polygons/lines)
      const contourLayer = L.geoJSON(data, {
        style: getContourStyle,
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const mmi = feature.properties.MMI || feature.properties.value || feature.properties.CONTAMMI;
            const label = mmi != null ? `MMI ${mmi}` : 'Intensity contour';
            layer.bindTooltip(label, {
              sticky: true,
              className: 'shakemap-tooltip',
            });
          }
        },
      });

      shakemapLayerGroup.addLayer(contourLayer);

      // Zoom to fit contours if we have any
      if (contourLayer.getBounds().isValid()) {
        map.fitBounds(contourLayer.getBounds(), {
          padding: [50, 50],
          maxZoom: 10,
        });
      }
    }

    /**
     * Style function for ShakeMap contour features.
     * Color by MMI intensity value.
     */
    function getContourStyle(feature) {
      const mmi = feature?.properties?.MMI ||
                  feature?.properties?.value ||
                  feature?.properties?.CONTAMMI ||
                  0;

      const colors = {
        1: '#ffffff', 2: '#dcdcdc', 3: '#c8c8c8',
        4: '#b0b0b0', 5: '#ffff00', 6: '#ffcc00',
        7: '#ff9900', 8: '#ff6600', 9: '#ff3300',
        10: '#ff0000',
      };

      const color = colors[Math.round(mmi)] || '#ff0000';
      const isPolygon = feature?.geometry?.type === 'Polygon' ||
                        feature?.geometry?.type === 'MultiPolygon';

      return {
        color: color,
        weight: isPolygon ? 1 : 2,
        opacity: 0.6,
        fillColor: color,
        fillOpacity: isPolygon ? 0.15 : 0,
      };
    }

    /**
     * Render user's watch zones.
     */
    function renderZones() {
      if (!zonesLayerGroup) return;
      zonesLayerGroup.clearLayers();

      if (!props.watchZones || props.watchZones.length === 0) return;

      props.watchZones.forEach((zone) => {
        if (!zone.polygon || zone.polygon.length < 3) return;

        // Convert [lon, lat] to [lat, lng] for Leaflet
        const latlngs = zone.polygon.map(([lon, lat]) => [lat, lon]);

        const polygon = L.polygon(latlngs, {
          color: '#64ffda',
          weight: 2,
          opacity: 0.8,
          fillColor: '#64ffda',
          fillOpacity: 0.1,
          dashArray: '5, 10',
        });

        polygon.bindTooltip(
          `${zone.name || 'Watch Zone'} (≥M${zone.min_magnitude || 4.5})`,
          { sticky: true, className: 'zone-tooltip' }
        );

        zonesLayerGroup.addLayer(polygon);
      });
    }

    /**
     * Add ShakeMap legend to the map.
     */
    const shakemapLegend = {
      onAdd() {
        const div = L.DomUtil.create('div', 'shakemap-legend');
        div.innerHTML = `
          <div class="legend-title">MMI Intensity</div>
          <div class="legend-items">
            <div class="legend-item"><span style="background:#ffffff"></span> I</div>
            <div class="legend-item"><span style="background:#ffff00"></span> V</div>
            <div class="legend-item"><span style="background:#ffcc00"></span> VI</div>
            <div class="legend-item"><span style="background:#ff9900"></span> VII</div>
            <div class="legend-item"><span style="background:#ff6600"></span> VIII</div>
            <div class="legend-item"><span style="background:#ff3300"></span> IX</div>
            <div class="legend-item"><span style="background:#ff0000"></span> X</div>
          </div>
        `;
        return div;
      },
    };

    let legendControl = null;

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

        // Add/remove legend
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

    // ============================================================
    // Lifecycle
    // ============================================================

    onMounted(() => {
      initMap();

      // When map is ready, wait for next tick and render
      nextTick(() => {
        renderEvents();
        renderZones();
      });
    });

    onBeforeUnmount(() => {
      if (map) {
        map.remove();
        map = null;
      }
    });

    return {
      mapContainer,
    };
  },
};
</script>

<style>
.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

/* Popup styling */
.quake-popup-container .leaflet-popup-content-wrapper {
  background: #1a1a2e;
  color: #ccd6f6;
  border: 1px solid #233554;
  border-radius: 8px;
}

.quake-popup-container .leaflet-popup-tip {
  background: #1a1a2e;
  border: 1px solid #233554;
}

.quake-popup-container .leaflet-popup-content {
  margin: 12px 16px;
}

.quake-popup p {
  margin: 4px 0;
  font-size: 13px;
  color: #8892b0;
}

.popup-btn {
  background: #233554;
  color: #64ffda;
  border: 1px solid #2e4a6b;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}
.popup-btn:hover {
  background: #2e4a6b;
}

/* ShakeMap legend */
.shakemap-legend {
  background: rgba(26, 26, 46, 0.9);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #233554;
  font-size: 12px;
  color: #ccd6f6;
}

.legend-title {
  font-weight: bold;
  margin-bottom: 4px;
  color: #64ffda;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.legend-item span {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.1);
}

/* ShakeMap tooltip */
.shakemap-tooltip {
  background: rgba(26, 26, 46, 0.9) !important;
  color: #ccd6f6 !important;
  border: 1px solid #233554 !important;
  font-size: 11px !important;
  padding: 4px 8px !important;
}

/* Zone tooltip */
.zone-tooltip {
  background: rgba(26, 26, 46, 0.9) !important;
  color: #64ffda !important;
  border: 1px solid #64ffda !important;
  font-size: 11px !important;
  padding: 4px 8px !important;
}

/* Leaflet draw overrides for dark theme */
.leaflet-draw-toolbar a {
  background-color: #1a1a2e !important;
  background-image: url('https://unpkg.com/leaflet-draw@1.0.4/dist/images/spritesheet.png') !important;
}

.leaflet-draw-toolbar a:hover {
  background-color: #16213e !important;
}

.leaflet-draw-actions a {
  background: #1a1a2e !important;
  color: #ccd6f6 !important;
}

.leaflet-draw-actions a:hover {
  background: #16213e !important;
}
</style>