<template>
  <aside class="settings-panel">
    <div class="settings-header">
      <h2>Settings</h2>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>

    <div class="settings-content">
      <!-- ============================================ -->
      <!-- Min Magnitude -->
      <!-- ============================================ -->
      <section class="setting-section">
        <h3>Minimum Magnitude</h3>
        <p class="setting-desc">Only show & notify for quakes ≥ this magnitude</p>
        <div class="slider-group">
          <input
            type="range"
            :min="2"
            :max="9"
            :step="0.5"
            :value="minMagnitude"
            @input="$emit('update:min-magnitude', parseFloat($event.target.value))"
            class="mag-slider"
          />
          <span class="slider-value">M{{ minMagnitude.toFixed(1) }}</span>
        </div>
      </section>

      <!-- ============================================ -->
      <!-- Push Notifications -->
      <!-- ============================================ -->
      <section class="setting-section">
        <h3>Push Notifications</h3>
        <p class="setting-desc">
          Receive real-time alerts when earthquakes occur in your watch zones.
        </p>

        <div class="toggle-group">
          <label class="toggle-label">
            <span>Enable notifications</span>
            <button
              :class="['toggle-switch', { active: pushEnabled }]"
              @click="$emit('toggle-push', !pushEnabled)"
              :disabled="fcmStatus === 'loading'"
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
        </div>

        <!-- Status messages -->
        <div v-if="fcmStatus === 'loading'" class="status-msg loading">
          ⏳ Requesting notification permission...
        </div>
        <div v-else-if="fcmStatus === 'granted'" class="status-msg success">
          ✅ Notifications enabled
        </div>
        <div v-else-if="fcmStatus === 'denied'" class="status-msg error">
          ⛔ Notification permission denied. Please update your browser settings.
        </div>
        <div v-else-if="fcmStatus === 'error'" class="status-msg error">
          ❌ Failed to enable notifications. Check Firebase config.
        </div>

        <div v-if="!vapidKey" class="status-msg warning">
          ⚠️ VITE_FIREBASE_VAPID_KEY not set. FCM will not work.
        </div>
      </section>

      <!-- ============================================ -->
      <!-- Date Range Filter -->
      <!-- ============================================ -->
      <section class="setting-section">
        <h3>Date Range</h3>
        <p class="setting-desc">
          Filter earthquakes by date (uses USGS FDSN query when dates are set).
        </p>
        <div class="date-range-group">
          <div class="date-field">
            <label>From</label>
            <input
              type="date"
              :value="dateFrom"
              @input="$emit('update:date-from', $event.target.value)"
              class="date-input"
            />
          </div>
          <div class="date-field">
            <label>To</label>
            <input
              type="date"
              :value="dateTo"
              @input="$emit('update:date-to', $event.target.value)"
              class="date-input"
            />
          </div>
          <div class="date-actions">
            <button class="settings-btn primary" @click="$emit('apply-dates')" :disabled="!dateFrom && !dateTo">
              Apply
            </button>
            <button class="settings-btn secondary" @click="$emit('reset-dates')" :disabled="!dateFrom && !dateTo">
              Reset
            </button>
          </div>
        </div>
      </section>

      <!-- ============================================ -->
      <!-- Watch Zones -->
      <!-- ============================================ -->
      <section class="setting-section">
        <h3>Watch Zones</h3>
        <p class="setting-desc">
          Draw polygons on the map to define areas you want to monitor.
          Use the polygon tool (⬡) in the top-right corner of the map.
        </p>

        <div v-if="watchZones.length === 0" class="empty-zones">
          <p>No watch zones defined yet.</p>
          <p class="hint">Click the polygon icon on the map to draw one.</p>
        </div>

        <div v-else class="zone-list">
          <div
            v-for="zone in watchZones"
            :key="zone.id"
            class="zone-item"
          >
            <div class="zone-info">
              <span class="zone-name">{{ zone.name }}</span>
              <span class="zone-mag">≥M{{ zone.min_magnitude?.toFixed(1) || '4.5' }}</span>
              <span class="zone-points">{{ zone.polygon?.length || 0 }} points</span>
            </div>
            <button
              class="delete-zone-btn"
              @click="$emit('delete-zone', zone.id)"
              title="Delete zone"
            >
              🗑
            </button>
          </div>
        </div>
      </section>

      <!-- ============================================ -->
      <!-- About -->
      <!-- ============================================ -->
      <section class="setting-section about-section">
        <h3>About</h3>
        <p class="setting-desc">
          Earthquake Alert System v1.0.0
        </p>
        <p class="setting-desc">
          Data source: <a href="https://earthquake.usgs.gov" target="_blank" rel="noopener">USGS</a>
        </p>
        <p class="setting-desc">
          Powered by Vue 3, Leaflet, Firebase, and Vercel.
        </p>
      </section>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'SettingsPanel',
  props: {
    minMagnitude: { type: Number, default: 4.5 },
    pushEnabled: { type: Boolean, default: false },
    watchZones: { type: Array, default: () => [] },
    vapidKey: { type: String, default: '' },
    fcmStatus: { type: String, default: 'idle' },
    dateFrom: { type: String, default: '' },
    dateTo: { type: String, default: '' },
  },
  emits: [
    'update:min-magnitude',
    'toggle-push',
    'delete-zone',
    'close',
    'update:date-from',
    'update:date-to',
    'apply-dates',
    'reset-dates',
  ],
};
</script>

<style scoped>
.settings-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 360px;
  height: 100%;
  background: rgba(15, 15, 35, 0.97);
  border-left: 1px solid #233554;
  z-index: 999;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #233554;
}

.settings-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #ccd6f6;
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: #8892b0;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.close-btn:hover {
  color: #ccd6f6;
  background: rgba(255,255,255,0.05);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 24px;
}

.settings-content::-webkit-scrollbar {
  width: 6px;
}
.settings-content::-webkit-scrollbar-track {
  background: transparent;
}
.settings-content::-webkit-scrollbar-thumb {
  background: #233554;
  border-radius: 3px;
}

.setting-section {
  padding: 16px 0;
  border-bottom: 1px solid rgba(35, 53, 84, 0.5);
}

.setting-section:last-child {
  border-bottom: none;
}

h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64ffda;
  margin: 0 0 4px;
}

.setting-desc {
  font-size: 12px;
  color: #8892b0;
  margin: 0 0 12px;
  line-height: 1.5;
}

/* Slider */
.slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mag-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #233554;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.mag-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #64ffda;
  cursor: pointer;
  border: 2px solid #0f0f23;
  box-shadow: 0 0 4px rgba(100, 255, 218, 0.4);
}

.mag-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #64ffda;
  cursor: pointer;
  border: 2px solid #0f0f23;
}

.slider-value {
  font-size: 16px;
  font-weight: 700;
  color: #ccd6f6;
  min-width: 44px;
  text-align: center;
}

/* Toggle */
.toggle-group {
  margin-bottom: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #ccd6f6;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: #233554;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
  padding: 0;
}

.toggle-switch.active {
  background: #64ffda;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

.toggle-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status messages */
.status-msg {
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  margin-top: 8px;
}

.status-msg.loading {
  background: rgba(100, 255, 218, 0.08);
  color: #64ffda;
  border: 1px solid rgba(100, 255, 218, 0.2);
}

.status-msg.success {
  background: rgba(0, 230, 118, 0.08);
  color: #00e676;
  border: 1px solid rgba(0, 230, 118, 0.2);
}

.status-msg.error {
  background: rgba(255, 23, 68, 0.08);
  color: #ff1744;
  border: 1px solid rgba(255, 23, 68, 0.2);
}

.status-msg.warning {
  background: rgba(255, 214, 0, 0.08);
  color: #ffd600;
  border: 1px solid rgba(255, 214, 0, 0.2);
}

/* Watch zones */
.empty-zones {
  background: rgba(35, 53, 84, 0.3);
  border: 1px dashed #233554;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  color: #8892b0;
  font-size: 13px;
}

.empty-zones .hint {
  font-size: 11px;
  margin-top: 4px;
  color: #64ffda;
}

.zone-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zone-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(35, 53, 84, 0.3);
  border: 1px solid #233554;
  border-radius: 6px;
  padding: 10px 12px;
}

.zone-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.zone-name {
  font-size: 13px;
  color: #ccd6f6;
  font-weight: 500;
}

.zone-mag {
  font-size: 11px;
  color: #64ffda;
}

.zone-points {
  font-size: 10px;
  color: #8892b0;
}

.delete-zone-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 6px;
  border-radius: 4px;
  color: #8892b0;
  transition: color 0.2s, background 0.2s;
}

.delete-zone-btn:hover {
  color: #ff1744;
  background: rgba(255, 23, 68, 0.1);
}

/* Date Range */
.date-range-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-field label {
  font-size: 11px;
  color: #8892b0;
  font-weight: 500;
}

.date-input {
  background: #0f0f23;
  border: 1px solid #233554;
  color: #ccd6f6;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  cursor: pointer;
  color-scheme: dark;
}

.date-input:focus {
  border-color: #64ffda;
}

.date-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.settings-btn {
  flex: 1;
  padding: 7px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn.primary {
  background: #64ffda;
  color: #0f0f23;
}

.settings-btn.primary:hover:not(:disabled) {
  background: #45e0be;
}

.settings-btn.secondary {
  background: transparent;
  color: #8892b0;
  border: 1px solid #233554;
}

.settings-btn.secondary:hover:not(:disabled) {
  border-color: #64ffda;
  color: #64ffda;
}

.settings-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* About section */
.about-section a {
  color: #64ffda;
  text-decoration: none;
}

.about-section a:hover {
  text-decoration: underline;
}
</style>