<template>
  <div class="app-container">
    <!-- Main Map -->
    <MapView
      ref="mapView"
      :events="events"
      :selected-event-id="selectedEventId"
      :watch-zones="watchZones"
      :shakemap-contours="shakemapContours"
      :loading="loading"
      :error="error"
      :user-location="userLocation"
      @select-event="selectEvent"
      @zone-created="onZoneCreated"
      @zone-deleted="onZoneDeleted"
    />

    <!-- Loading overlay (subtle map spinner) -->
    <div v-if="loading" class="map-loading-spinner">
      <div class="spinner"></div>
    </div>

    <!-- Error Banner -->
    <div v-if="error" class="error-banner">
      <span>⚠️ {{ error }}</span>
      <button @click="dismissError(); loadEvents()" class="retry-btn">Retry</button>
    </div>

    <!-- Offline Banner -->
    <div v-if="isOffline" class="offline-banner">
      📡 You are offline — showing cached data
    </div>

    <!-- Sidebar Toggle -->
    <button
      class="sidebar-toggle"
      @click="showSidebar = !showSidebar"
      :title="showSidebar ? 'Hide sidebar' : 'Show sidebar'"
    >
      <span v-if="!showSidebar">☰</span>
      <span v-else>✕</span>
    </button>

    <!-- Settings Toggle -->
    <button
      class="settings-toggle"
      @click="showSettings = !showSettings"
      :title="showSettings ? 'Close settings' : 'Open settings'"
    >
      ⚙
    </button>

    <!-- Refresh Button -->
    <button
      class="refresh-btn"
      @click="refreshData"
      title="Refresh earthquake data"
      :disabled="refreshing"
    >
      {{ refreshing ? '⟳' : '↻' }}
    </button>

    <!-- Jump to My Location Button -->
    <button
      class="locate-btn"
      @click="jumpToMyLocation"
      title="Jump to my location"
    >
      📍
    </button>

    <!-- Share Button (appears when an event is selected) -->
    <button
      v-if="selectedEvent"
      class="share-btn"
      @click="shareEvent"
      title="Share this earthquake"
    >
      ↗
    </button>

    <!-- Last Updated -->
    <div class="last-updated">
      Last updated: {{ lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--' }}
      <span v-if="hasPHIVOLCS" class="ph-source-indicator">+PHIVOLCS</span>
    </div>

    <!-- Sidebar -->
    <Sidebar
      v-if="showSidebar"
      :events="events"
      :selected-event-id="selectedEventId"
      :user-location="userLocation"
      :sort-by="sortBy"
      :loading="sidebarLoading"
      :offline="isOffline"
      :has-phivolcs="hasPHIVOLCS"
      @select-event="selectEvent"
      @update:sort-by="sortBy = $event"
    />

    <!-- Settings Panel -->
    <SettingsPanel
      v-if="showSettings"
      :min-magnitude="minMagnitude"
      :push-enabled="pushEnabled"
      :watch-zones="watchZones"
      :vapid-key="vapidKey"
      :fcm-status="fcmStatus"
      :date-from="dateFrom"
      :date-to="dateTo"
      @update:min-magnitude="minMagnitude = $event"
      @toggle-push="togglePush"
      @delete-zone="onZoneDeleted"
      @update:date-from="dateFrom = $event"
      @update:date-to="dateTo = $event"
      @apply-dates="loadEvents"
      @reset-dates="resetDates"
    />

    <!-- Shaking Timeline -->
    <ShakingTimeline
      v-if="showTimeline && selectedEvent"
      :event="selectedEvent"
      :user-distance="userDistance"
      :user-location="userLocation"
      @close="showTimeline = false"
    />

    <!-- "I Felt It" dialog -->
    <div v-if="showFeltDialog && selectedEvent" class="felt-dialog-overlay" @click.self="showFeltDialog = false">
      <div class="felt-dialog">
        <h3>Did you feel it?</h3>
        <p class="felt-event-info">
          M{{ selectedEvent.magnitude?.toFixed(1) }} — {{ selectedEvent.place }}
        </p>
        <div class="felt-options">
          <button class="felt-btn" @click="submitFeltReport(1)">Not felt</button>
          <button class="felt-btn" @click="submitFeltReport(3)">Weak</button>
          <button class="felt-btn" @click="submitFeltReport(5)">Moderate</button>
          <button class="felt-btn" @click="submitFeltReport(7)">Strong</button>
          <button class="felt-btn" @click="submitFeltReport(10)">Very Strong</button>
        </div>
        <p class="felt-note">
          <small>Reports are sent to USGS DYFI (placeholder).</small>
        </p>
        <button class="felt-close" @click="showFeltDialog = false">Close</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import MapView from './components/MapView.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ShakingTimeline from './components/ShakingTimeline.vue';
import * as api from './lib/api.js';
import { getDeviceId } from './lib/device.js';
import { cacheEvents, loadCachedEvents, cacheShakeMap, loadCachedShakeMap, onNetworkChange } from './lib/cache.js';

export default {
  name: 'App',
  components: { MapView, Sidebar, SettingsPanel, ShakingTimeline },

  setup() {
    // ============================================================
    // State
    // ============================================================
    const events = ref([]);
    const selectedEventId = ref(null);
    const selectedEvent = ref(null);
    const shakemapContours = ref(null);
    const loading = ref(true);
    const sidebarLoading = ref(true);
    const error = ref(null);
    const refreshing = ref(false);
    const lastUpdated = ref(null);
    const showSidebar = ref(true);
    const showSettings = ref(false);
    const sortBy = ref('time');
    const mapView = ref(null);
    const userLocation = ref(null);
    const showFeltDialog = ref(false);
    const isOffline = ref(false);
    const hasPHIVOLCS = ref(false);
    const showTimeline = ref(false);
    const userDistance = ref(null);

    // Settings
    const minMagnitude = ref(4.5);
    const pushEnabled = ref(false);
    const watchZones = ref([]);
    const fcmStatus = ref('idle');
    const dateFrom = ref('');
    const dateTo = ref('');

    const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

    // ============================================================
    // Hash-based routing for shareable links
    // ============================================================
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#/event/')) {
        const eventId = hash.replace('#/event/', '');
        if (eventId) {
          selectEvent(eventId);
        }
      }
    }

    // ============================================================
    // Methods
    // ============================================================

    async function loadEvents() {
      try {
        loading.value = true;
        sidebarLoading.value = true;
        error.value = null;

        const data = await api.fetchLatestEvents({
          minMagnitude: minMagnitude.value,
          limit: 100,
        });

        // The backend now filters to Philippines and includes PHIVOLCS data
        const allEvents = data.events || [];

        // Check if any events have source='PHIVOLCS'
        hasPHIVOLCS.value = allEvents.some((e) => e.source === 'PHIVOLCS');

        events.value = allEvents;
        lastUpdated.value = Date.now();

        // Cache events for offline
        cacheEvents(allEvents);

        console.log(`[App] Loaded ${allEvents.length} events`);
      } catch (err) {
        console.error('[App] Failed to load events:', err.message);
        error.value = err.message;

        // Try loading from cache if offline
        if (!navigator.onLine) {
          const cached = await loadCachedEvents();
          if (cached.length > 0) {
            events.value = cached;
            isOffline.value = true;
            error.value = null; // Clear error since we have cached data
          }
        }
      } finally {
        loading.value = false;
        sidebarLoading.value = false;
      }
    }

    async function refreshData() {
      if (refreshing.value) return;
      refreshing.value = true;
      await loadEvents();
      refreshing.value = false;
    }

    function dismissError() {
      error.value = null;
    }

    /**
     * Generate approximate ShakeMap intensity zones based on magnitude and depth.
     * Uses concentric circles with MMi labels.
     */
    function generateApproximateShakeMap(event) {
      const mag = event.magnitude || 0;
      const depth = (event.depth || 10) * 1000; // Convert km to meters for attenuation
      const lat = event.latitude;
      const lng = event.longitude;

      if (!lat || !lng || mag < 4) return null;

      const features = [];
      const radiiKm = [10, 20, 40, 80, 120, 180, 250, 350];
      const mmis = [8, 7, 6, 5, 4, 3, 2, 1];

      for (let i = 0; i < radiiKm.length; i++) {
        const radiusKm = radiiKm[i];
        // Check if this MMI level would be felt at this distance given magnitude
        const expectedMmi = Math.min(10, Math.max(1, Math.round(mag * 1.5 - Math.log10(depth + 1) * 2 - radiusKm / 30)));

        if (expectedMmi < 1) continue;

        const radiusM = radiusKm * 1000;
        const points = [];
        const segments = 32;

        for (let j = 0; j <= segments; j++) {
          const angle = (j / segments) * 2 * Math.PI;
          const dLat = (radiusM / 111320) * Math.cos(angle);
          const dLng = (radiusM / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
          points.push([lng + dLng, lat + dLat]);
        }

        features.push({
          type: 'Feature',
          properties: { MMI: expectedMmi, label: `${expectedMmi}` },
          geometry: {
            type: 'Polygon',
            coordinates: [points],
          },
        });
      }

      return {
        type: 'FeatureCollection',
        metadata: { generated: true, eventName: event.place },
        features,
      };
    }

    async function selectEvent(eventId) {
      selectedEventId.value = eventId;
      selectedEvent.value = events.value.find((e) => e.id === eventId) || null;
      shakemapContours.value = null;

      // Update URL hash for shareable links
      if (eventId) {
        window.location.hash = `#/event/${eventId}`;
      } else {
        window.location.hash = '';
      }

      if (eventId) {
        // First try loading from cache
        let contours = await loadCachedShakeMap(eventId);
        if (contours) {
          shakemapContours.value = contours;
        }

        // Then fetch fresh data
        try {
          const detail = await api.fetchEventDetails(eventId);
          if (detail.hasShakeMap) {
            const freshContours = await api.fetchEventContours(eventId);
            shakemapContours.value = freshContours;
            // Cache it
            cacheShakeMap(eventId, freshContours);
          }
        } catch (err) {
          console.warn('[App] Could not load ShakeMap:', err.message);
          // Keep cached contours if fetch failed
        }

        // If no contours available, generate approximate intensity zones
        if (!shakemapContours.value && selectedEvent.value) {
          const approximateContours = generateApproximateShakeMap(selectedEvent.value);
          if (approximateContours) {
            shakemapContours.value = approximateContours;
          }
        }
      }
    }

    function getUserLocation() {
      if (!navigator.geolocation) {
        userLocation.value = { lat: 12.8797, lng: 121.7740 }; // Default to Philippines
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation.value = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
        },
        () => {
          userLocation.value = { lat: 12.8797, lng: 121.7740 }; // Default to Philippines
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    function jumpToMyLocation() {
      if (userLocation.value && mapView.value) {
        mapView.value.flyToLocation(
          userLocation.value.lat,
          userLocation.value.lng,
          10
        );
      } else if (!userLocation.value) {
        getUserLocation();
      }
    }

    async function shareEvent() {
      if (!selectedEvent.value) return;

      const shareUrl = `${window.location.origin}/#/event/${selectedEvent.value.id}`;
      const shareData = {
        title: `M${selectedEvent.value.magnitude?.toFixed(1)} Earthquake at ${selectedEvent.value.place}`,
        text: `M${selectedEvent.value.magnitude?.toFixed(1)} earthquake at ${selectedEvent.value.place}. Depth: ${selectedEvent.value.depth?.toFixed(1)}km.`,
        url: shareUrl,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch {
          // User cancelled
        }
      } else {
        // Fallback: copy to clipboard
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert('Link copied to clipboard!');
        } catch {
          prompt('Copy this link:', shareUrl);
        }
      }
    }

    watch(minMagnitude, (val) => {
      localStorage.setItem('quake_min_magnitude', String(val));
    });

    async function togglePush(enabled) {
      if (enabled) {
        fcmStatus.value = 'loading';
        try {
          const { initFirebase, requestFcmToken } = await import('./lib/fcm.js');
          initFirebase();
          const result = await requestFcmToken(VAPID_KEY);

          if (result.token) {
            const deviceId = getDeviceId();
            await api.subscribePush(deviceId, result.token, navigator.userAgent);
            pushEnabled.value = true;
            fcmStatus.value = 'granted';
            localStorage.setItem('quake_push_enabled', 'true');
            localStorage.setItem('quake_fcm_token', result.token);
          } else {
            pushEnabled.value = false;
            fcmStatus.value = result.permission === 'denied' ? 'denied' : 'error';
          }
        } catch (err) {
          console.error('[App] Push enable failed:', err.message);
          pushEnabled.value = false;
          fcmStatus.value = 'error';
        }
      } else {
        try {
          const token = localStorage.getItem('quake_fcm_token');
          if (token) await api.unsubscribePush(token);
        } catch { /* ignore */ }
        pushEnabled.value = false;
        fcmStatus.value = 'idle';
        localStorage.setItem('quake_push_enabled', 'false');
        localStorage.removeItem('quake_fcm_token');
      }
    }

    async function loadZones() {
      try {
        const deviceId = getDeviceId();
        const data = await api.fetchZones(deviceId);
        watchZones.value = data.zones || [];
      } catch { /* ignore */ }
    }

    async function onZoneCreated(polygon) {
      try {
        const deviceId = getDeviceId();
        await api.createZone({
          deviceId,
          name: `Zone ${watchZones.value.length + 1}`,
          polygon,
          minMagnitude: minMagnitude.value,
        });
        await loadZones();
      } catch (err) {
        error.value = 'Failed to save watch zone: ' + err.message;
      }
    }

    async function onZoneDeleted(zoneId) {
      try {
        await api.deleteZone(zoneId);
        await loadZones();
      } catch { /* ignore */ }
    }

    function submitFeltReport(intensity) {
      console.log(`[App] Felt report: M${selectedEvent.value?.magnitude} at ${selectedEvent.value?.place}, intensity=${intensity}`);
      showFeltDialog.value = false;
    }

    function resetDates() {
      dateFrom.value = '';
      dateTo.value = '';
      loadEvents();
    }

    /**
     * Open the Shaking Timeline panel for the currently selected event.
     * Computes the Haversine distance from the user to the epicenter.
     */
    function openTimeline() {
      if (!selectedEvent.value) {
        alert('Select an earthquake first.');
        return;
      }
      const loc = userLocation.value;
      if (!loc || loc.lat == null || loc.lng == null) {
        alert('Enable location access to compute your distance to the epicenter.');
        return;
      }
      const R = 6371;
      const toRad = (d) => (d * Math.PI) / 180;
      const lat1 = toRad(loc.lat);
      const lat2 = toRad(selectedEvent.value.latitude);
      const dLat = toRad(selectedEvent.value.latitude - loc.lat);
      const dLng = toRad(selectedEvent.value.longitude - loc.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      userDistance.value = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      showTimeline.value = true;
    }

    // Listen for custom events
    function setupCustomEvents() {
      document.addEventListener('show-felt-dialog', () => {
        showFeltDialog.value = true;
      });

      // Jump to location handler
      window.addEventListener('jump-to-location', () => {
        getUserLocation();
      });

      // Open shaking timeline from MapView popup
      document.addEventListener('open-shaking-timeline', (e) => {
        const eventId = e.detail;
        if (eventId) selectEvent(eventId);
        openTimeline();
      });

      // Network status changes
      const cleanup = onNetworkChange(
        () => {
          isOffline.value = false;
          loadEvents(); // Reload when back online
        },
        () => {
          isOffline.value = true;
        }
      );
    }

    // ============================================================
    // Lifecycle
    // ============================================================

    onMounted(async () => {
      // Restore settings
      const savedMag = localStorage.getItem('quake_min_magnitude');
      if (savedMag) minMagnitude.value = parseFloat(savedMag);
      const savedPush = localStorage.getItem('quake_push_enabled');
      pushEnabled.value = savedPush === 'true';

      // Check initial online status
      isOffline.value = !navigator.onLine;

      getDeviceId();
      getUserLocation();
      setupCustomEvents();

      // Check hash for direct event link
      handleHashChange();
      window.addEventListener('hashchange', handleHashChange);

      await loadEvents();
      await loadZones();

      // Auto-refresh every 60 seconds
      setInterval(async () => {
        await loadEvents();
      }, 60000);
    });

    return {
      events,
      selectedEventId,
      selectedEvent,
      shakemapContours,
      loading,
      sidebarLoading,
      error,
      refreshing,
      lastUpdated,
      showSidebar,
      showSettings,
      sortBy,
      userLocation,
      minMagnitude,
      pushEnabled,
      watchZones,
      fcmStatus,
      vapidKey: VAPID_KEY,
      showFeltDialog,
      dateFrom,
      dateTo,
      isOffline,
      hasPHIVOLCS,
      showTimeline,
      userDistance,
      refreshData,
      selectEvent,
      togglePush,
      onZoneCreated,
      onZoneDeleted,
      submitFeltReport,
      dismissError,
      loadEvents,
      jumpToMyLocation,
      shareEvent,
      resetDates,
      openTimeline,
    };
  },
};
</script>

<style>
.app-container {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* Map loading spinner (subtle, on map only) */
.map-loading-spinner {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(26, 26, 46, 0.8);
  padding: 8px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #8892b0;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #64ffda;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error banner */
.error-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 82, 82, 0.9);
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  max-width: 500px;
  font-size: 14px;
}

.retry-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Offline banner */
.offline-banner {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 152, 0, 0.9);
  color: #fff;
  padding: 6px 16px;
  border-radius: 8px;
  z-index: 1000;
  font-size: 13px;
}

/* Floating action buttons */
.sidebar-toggle,
.settings-toggle,
.refresh-btn,
.locate-btn,
.share-btn {
  position: absolute;
  z-index: 1000;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: background 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-toggle:hover,
.settings-toggle:hover,
.refresh-btn:hover,
.locate-btn:hover,
.share-btn:hover {
  background: #16213e;
  transform: scale(1.05);
}

.sidebar-toggle { top: 16px; left: 16px; }
.settings-toggle { top: 16px; right: 16px; }
.refresh-btn { top: 16px; right: 68px; }
.locate-btn { top: 64px; right: 16px; }
.share-btn { top: 112px; right: 16px; }

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Last updated */
.last-updated {
  position: absolute;
  bottom: 16px;
  left: 16px;
  background: rgba(26, 26, 46, 0.8);
  color: #8892b0;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ph-source-indicator {
  background: rgba(100, 255, 218, 0.1);
  color: #64ffda;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

/* Felt dialog */
.felt-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.felt-dialog {
  background: #1a1a2e;
  border: 1px solid #233554;
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  text-align: center;
}

.felt-dialog h3 {
  color: #64ffda;
  margin-bottom: 8px;
}

.felt-event-info {
  color: #ccd6f6;
  font-size: 14px;
  margin-bottom: 16px;
}

.felt-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 12px;
}

.felt-btn {
  background: #233554;
  color: #ccd6f6;
  border: 1px solid #2e4a6b;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}
.felt-btn:hover {
  background: #2e4a6b;
}

.felt-note {
  color: #8892b0;
  margin-bottom: 12px;
}

.felt-close {
  background: transparent;
  border: 1px solid #8892b0;
  color: #8892b0;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.felt-close:hover {
  background: rgba(136, 146, 176, 0.1);
}
</style>