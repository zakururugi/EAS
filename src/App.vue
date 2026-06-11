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
      @select-event="selectEvent"
      @zone-created="onZoneCreated"
      @zone-deleted="onZoneDeleted"
    />

    <!-- Loading Overlay -->
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <span>Loading earthquake data...</span>
    </div>

    <!-- Error Banner -->
    <div v-if="error" class="error-banner">
      <span>⚠️ {{ error }}</span>
      <button @click="error = null; loadEvents()" class="retry-btn">Retry</button>
    </div>

    <!-- Sidebar Toggle Button -->
    <button
      class="sidebar-toggle"
      @click="showSidebar = !showSidebar"
      :title="showSidebar ? 'Hide sidebar' : 'Show sidebar'"
    >
      <span v-if="!showSidebar">☰</span>
      <span v-else>✕</span>
    </button>

    <!-- Settings Toggle Button -->
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

    <!-- Last Updated -->
    <div class="last-updated">
      Last updated: {{ lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--' }}
    </div>

    <!-- Sidebar -->
    <Sidebar
      v-if="showSidebar"
      :events="events"
      :selected-event-id="selectedEventId"
      :user-location="userLocation"
      :sort-by="sortBy"
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
      @update:min-magnitude="minMagnitude = $event"
      @toggle-push="togglePush"
      @delete-zone="onZoneDeleted"
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
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import MapView from './components/MapView.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import * as api from './lib/api.js';
import { getDeviceId } from './lib/device.js';

export default {
  name: 'App',
  components: { MapView, Sidebar, SettingsPanel },

  setup() {
    // ============================================================
    // State
    // ============================================================
    const events = ref([]);
    const selectedEventId = ref(null);
    const selectedEvent = ref(null);
    const shakemapContours = ref(null);
    const loading = ref(true);
    const error = ref(null);
    const refreshing = ref(false);
    const lastUpdated = ref(null);
    const showSidebar = ref(true);
    const showSettings = ref(false);
    const sortBy = ref('time'); // 'time' | 'magnitude' | 'distance'
    const userLocation = ref(null);
    const showFeltDialog = ref(false);

    // Settings
    const minMagnitude = ref(4.5);
    const pushEnabled = ref(false);
    const watchZones = ref([]);
    const fcmStatus = ref('idle'); // 'idle' | 'loading' | 'granted' | 'denied' | 'error'

    const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

    // ============================================================
    // Methods
    // ============================================================

    /**
     * Load earthquake events from the API.
     */
    async function loadEvents() {
      try {
        loading.value = true;
        error.value = null;

        const data = await api.fetchLatestEvents({ limit: 100 });
        events.value = data.events || [];
        lastUpdated.value = data.metadata?.generated || Date.now();

        console.log(`[App] Loaded ${events.value.length} events`);
      } catch (err) {
        console.error('[App] Failed to load events:', err.message);
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    /**
     * Refresh data (manual refresh).
     */
    async function refreshData() {
      if (refreshing.value) return;
      refreshing.value = true;
      await loadEvents();
      refreshing.value = false;
    }

    /**
     * Select an earthquake event and optionally load ShakeMap contours.
     */
    async function selectEvent(eventId) {
      selectedEventId.value = eventId;
      selectedEvent.value = events.value.find((e) => e.id === eventId) || null;
      shakemapContours.value = null;

      if (eventId) {
        try {
          const detail = await api.fetchEventDetails(eventId);
          if (detail.hasShakeMap) {
            const contours = await api.fetchEventContours(eventId);
            shakemapContours.value = contours;
          }
        } catch (err) {
          console.warn('[App] Could not load ShakeMap:', err.message);
        }
      }
    }

    /**
     * Get user's current location (browser geolocation).
     */
    function getUserLocation() {
      if (!navigator.geolocation) {
        console.log('[App] Geolocation not supported');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation.value = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          console.log('[App] User location:', userLocation.value);
        },
        (err) => {
          console.log('[App] Geolocation error:', err.message);
          // Default to [0, 0] as specified
          userLocation.value = { lat: 0, lng: 0 };
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    /**
     * Save minMagnitude to localStorage.
     */
    watch(minMagnitude, (val) => {
      localStorage.setItem('quake_min_magnitude', String(val));
    });

    /**
     * Push notification toggle.
     */
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
        // Unsubscribe
        try {
          const token = localStorage.getItem('quake_fcm_token');
          if (token) {
            await api.unsubscribePush(token);
          }
        } catch (err) {
          console.warn('[App] Unsubscribe failed:', err.message);
        }
        pushEnabled.value = false;
        fcmStatus.value = 'idle';
        localStorage.setItem('quake_push_enabled', 'false');
        localStorage.removeItem('quake_fcm_token');
      }
    }

    /**
     * Load watch zones from API.
     */
    async function loadZones() {
      try {
        const deviceId = getDeviceId();
        const data = await api.fetchZones(deviceId);
        watchZones.value = data.zones || [];
      } catch (err) {
        console.warn('[App] Failed to load watch zones:', err.message);
      }
    }

    /**
     * Called when a zone is created via Leaflet.draw.
     */
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
        console.error('[App] Failed to create zone:', err.message);
        error.value = 'Failed to save watch zone: ' + err.message;
      }
    }

    /**
     * Called when a zone is deleted.
     */
    async function onZoneDeleted(zoneId) {
      try {
        await api.deleteZone(zoneId);
        await loadZones();
      } catch (err) {
        console.error('[App] Failed to delete zone:', err.message);
      }
    }

    /**
     * "I felt it" - placeholder for USGS DYFI.
     */
    function submitFeltReport(intensity) {
      console.log(`[App] Felt report: M${selectedEvent.value?.magnitude} at ` +
        `${selectedEvent.value?.place}, intensity=${intensity}`);
      showFeltDialog.value = false;
      // In production, redirect to USGS DYFI page:
      // window.open(`https://earthquake.usgs.gov/earthquakes/eventpage/${eventId}/dyfi`, '_blank');
    }

    // ============================================================
    // Lifecycle
    // ============================================================

    onMounted(async () => {
      // Restore settings from localStorage
      const savedMag = localStorage.getItem('quake_min_magnitude');
      if (savedMag) minMagnitude.value = parseFloat(savedMag);

      const savedPush = localStorage.getItem('quake_push_enabled');
      pushEnabled.value = savedPush === 'true';

      getDeviceId(); // Ensure device ID is created
      getUserLocation();
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
      refreshData,
      selectEvent,
      togglePush,
      onZoneCreated,
      onZoneDeleted,
      submitFeltReport,
      loadEvents,
    };
  },
};
</script>

<style>
/* Global styles scoped to App */
.app-container {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* Loading overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 15, 35, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  gap: 12px;
  backdrop-filter: blur(2px);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.1);
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

/* Floating action buttons */
.sidebar-toggle,
.settings-toggle,
.refresh-btn {
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
.refresh-btn:hover {
  background: #16213e;
  transform: scale(1.05);
}

.sidebar-toggle {
  top: 16px;
  left: 16px;
}

.settings-toggle {
  top: 16px;
  right: 16px;
}

.refresh-btn {
  top: 16px;
  right: 68px;
}

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
}

/* "I felt it" dialog */
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