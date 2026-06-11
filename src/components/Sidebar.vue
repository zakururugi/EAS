<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>Earthquakes</h2>
      <span class="count-badge">{{ sortedEvents.length }}</span>
    </div>

    <!-- Sort controls -->
    <div class="sort-controls">
      <button
        :class="['sort-btn', { active: sortBy === 'time' }]"
        @click="$emit('update:sort-by', 'time')"
      >
        Time ▼
      </button>
      <button
        :class="['sort-btn', { active: sortBy === 'magnitude' }]"
        @click="$emit('update:sort-by', 'magnitude')"
      >
        Mag ▼
      </button>
      <button
        :class="['sort-btn', { active: sortBy === 'distance' }]"
        @click="$emit('update:sort-by', 'distance')"
        :disabled="!userLocation"
        :title="!userLocation ? 'Enable location for distance sort' : ''"
      >
        Dist ▼
      </button>
    </div>

    <!-- Event list -->
    <div class="events-list" ref="listContainer">
      <div
        v-for="event in sortedEvents"
        :key="event.id"
        :class="['event-card', { selected: event.id === selectedEventId }]"
        @click="$emit('select-event', event.id)"
      >
        <div class="event-mag" :style="{ background: getMagColor(event.magnitude) }">
          M{{ event.magnitude?.toFixed(1) || '?' }}
        </div>
        <div class="event-info">
          <div class="event-place" :title="event.place">{{ event.place || 'Unknown' }}</div>
          <div class="event-meta">
            <span class="event-time">{{ formatTime(event.time) }}</span>
            <span class="event-depth">{{ event.depth?.toFixed(1) || '?' }} km</span>
            <span v-if="event.felt" class="event-felt">👤 {{ event.felt }}</span>
            <span v-if="event.mmi" class="event-mmi">MMI {{ event.mmi }}</span>
            <span v-if="event.tsunami" class="event-tsunami">🌊</span>
          </div>
          <div v-if="event.distance != null" class="event-distance">
            {{ event.distance.toFixed(0) }} km away
          </div>
        </div>
      </div>

      <div v-if="sortedEvents.length === 0" class="empty-state">
        <p>No earthquakes found</p>
      </div>
    </div>
  </aside>
</template>

<script>
import { computed } from 'vue';

/**
 * Haversine distance between two points in km.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMagColor(mag) {
  if (mag >= 7) return '#ff1744';
  if (mag >= 6) return '#ff6d00';
  if (mag >= 5) return '#ffd600';
  return '#00e676';
}

export default {
  name: 'Sidebar',
  props: {
    events: { type: Array, default: () => [] },
    selectedEventId: { type: String, default: null },
    userLocation: { type: Object, default: null },
    sortBy: { type: String, default: 'time' },
  },
  emits: ['select-event', 'update:sort-by'],

  setup(props) {
    const sortedEvents = computed(() => {
      const list = [...props.events];

      switch (props.sortBy) {
        case 'time':
          return list.sort((a, b) => b.time - a.time);

        case 'magnitude':
          return list.sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));

        case 'distance':
          if (props.userLocation) {
            const { lat, lng } = props.userLocation;
            list.forEach((e) => {
              if (e.latitude != null && e.longitude != null) {
                e.distance = haversineDistance(lat, lng, e.latitude, e.longitude);
              } else {
                e.distance = Infinity;
              }
            });
            return list.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
          }
          return list.sort((a, b) => b.time - a.time);

        default:
          return list.sort((a, b) => b.time - a.time);
      }
    });

    function formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      // Within last hour: show minutes ago
      if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
      }
      // Within last 24 hours: show hours ago
      if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
      }
      // Otherwise: show date
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return {
      sortedEvents,
      getMagColor,
      formatTime,
    };
  },
};
</script>

<style scoped>
.sidebar {
  position: absolute;
  top: 0;
  left: 0;
  width: 340px;
  height: 100%;
  background: rgba(15, 15, 35, 0.95);
  border-right: 1px solid #233554;
  z-index: 999;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 8px;
  border-bottom: 1px solid #233554;
}

.sidebar-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #ccd6f6;
  margin: 0;
}

.count-badge {
  background: #233554;
  color: #64ffda;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.sort-controls {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid #233554;
}

.sort-btn {
  background: transparent;
  border: 1px solid #233554;
  color: #8892b0;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-btn:hover {
  border-color: #64ffda;
  color: #64ffda;
}

.sort-btn.active {
  background: rgba(100, 255, 218, 0.1);
  border-color: #64ffda;
  color: #64ffda;
}

.sort-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.events-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.events-list::-webkit-scrollbar {
  width: 6px;
}

.events-list::-webkit-scrollbar-track {
  background: transparent;
}

.events-list::-webkit-scrollbar-thumb {
  background: #233554;
  border-radius: 3px;
}

.event-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
  border: 1px solid transparent;
}

.event-card:hover {
  background: rgba(35, 53, 84, 0.5);
}

.event-card.selected {
  background: rgba(35, 53, 84, 0.8);
  border-color: #64ffda;
}

.event-mag {
  flex-shrink: 0;
  width: 52px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-weight: 700;
  font-size: 13px;
  color: #000;
  text-shadow: 0 0 2px rgba(255,255,255,0.3);
}

.event-info {
  flex: 1;
  min-width: 0;
}

.event-place {
  font-size: 13px;
  font-weight: 500;
  color: #ccd6f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #8892b0;
}

.event-distance {
  font-size: 11px;
  color: #64ffda;
  margin-top: 1px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: #8892b0;
  font-size: 14px;
}
</style>