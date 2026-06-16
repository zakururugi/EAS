<template>
  <div class="timeline-container" v-if="event">
    <div class="timeline-header">
      <h3>📊 Shaking Timeline</h3>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>
    <div class="timeline-chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>
    <div class="timeline-legend">
      <span class="legend-p"><span class="dot dot-p"></span>P‑wave arrival</span>
      <span class="legend-s"><span class="dot dot-s"></span>S‑wave arrival</span>
      <span class="legend-peak"><span class="dot dot-peak"></span>Peak shaking</span>
      <span class="legend-safe"><span class="dot dot-safe"></span>Below damaging (MMI < 4)</span>
    </div>
    <div class="timeline-stats" v-if="timelineData">
      <div class="stat">
        <span class="stat-label">P-wave</span>
        <span class="stat-value">{{ timelineData.pArrival }}s</span>
      </div>
      <div class="stat">
        <span class="stat-label">S-wave</span>
        <span class="stat-value">{{ timelineData.sArrival }}s</span>
      </div>
      <div class="stat">
        <span class="stat-label">Peak</span>
        <span class="stat-value">{{ timelineData.peakTime }}s</span>
      </div>
      <div class="stat">
        <span class="stat-label">MMI</span>
        <span class="stat-value">{{ timelineData.peakMMI }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Duration</span>
        <span class="stat-value">{{ timelineData.duration }}s</span>
      </div>
    </div>

    <!-- Play/Pause button -->
    <div class="timeline-play-controls">
      <button class="play-btn" @click="togglePlay" :disabled="!timelineData">
        {{ isPlaying ? '⏸️ Pause' : '▶️ Play' }}
      </button>
      <span class="play-time" v-if="isPlaying">Cursor: {{ playCursorTime.toFixed(1) }}s</span>
    </div>

    <div class="timeline-controls" v-if="historicalQuakes.length">
      <label>Compare with historical quake:</label>
      <select v-model="selectedHistoricalId" @change="loadHistorical">
        <option value="">None</option>
        <option v-for="q in historicalQuakes" :key="q.id" :value="q.id">
          M{{ q.mag.toFixed(1) }} — {{ formatDate(q.time) }}
        </option>
      </select>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(...registerables, annotationPlugin);

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate P-wave and S-wave arrival times (seconds after origin).
 */
function calculateArrivalTimes(distanceKm, depthKm) {
  const pTravel = distanceKm / 6.0;
  const sTravel = distanceKm / 3.5;
  const depthDelay = depthKm / 8.0;
  return {
    pArrival: (pTravel + depthDelay).toFixed(1),
    sArrival: (sTravel + depthDelay).toFixed(1),
  };
}

/**
 * Estimate MMI from magnitude and distance using the same attenuation formula as ShakeMap.
 * Derived from: radius = 10^((mag - log10(mmi)) / c)  =>  mmi = 10^(mag - c * log10(distance))
 */
function estimateMMI(mag, distanceKm) {
  // Using same attenuation coefficient as ShakeMap (c=2.5) for consistency
  const c = 2.5;
  let mmi = Math.pow(10, mag - c * Math.log10(Math.max(1, distanceKm)));
  return Math.min(10, Math.max(0.5, mmi));
}

/**
 * Generate the shaking timeline (MMI vs time in seconds).
 */
function generateTimeline(event, distanceKm) {
  const mag = event.magnitude;
  const depth = event.depth || 10;
  const { pArrival, sArrival } = calculateArrivalTimes(distanceKm, depth);
  const peakMMI = estimateMMI(mag, distanceKm);
  const peakTime = (parseFloat(sArrival) + 2).toFixed(1);

  // Duration must be large enough to show P/S-wave arrival lines
  const duration = Math.max(
    parseFloat(pArrival) * 1.5,
    parseFloat(sArrival) * 1.5,
    mag * 5,
    30
  );

  const labels = [];
  const mmiValues = [];

  for (let t = 0; t <= duration; t += 0.5) {
    let mmi = 0;
    const pA = parseFloat(pArrival);
    const sA = parseFloat(sArrival);
    const pT = parseFloat(peakTime);

    if (t < pA) {
      mmi = 0;
    } else if (t < sA) {
      mmi = peakMMI * 0.6;
    } else if (t < pT) {
      const ratio = (t - sA) / (pT - sA);
      mmi = peakMMI * (0.6 + ratio * 0.4);
    } else {
      const decay = Math.exp(-(t - pT) / (duration * 0.2));
      mmi = peakMMI * decay;
    }
    // Never go below 0.1 so line is always visible (even at large distances)
    mmi = Math.min(10, Math.max(0.1, Math.round(mmi * 10) / 10));
    labels.push(t.toFixed(1));
    mmiValues.push(mmi);
  }

  return {
    labels,
    mmiValues,
    pArrival,
    sArrival,
    peakTime,
    peakMMI: Math.round(peakMMI * 10) / 10,
    duration,
  };
}

/**
 * Fetch historical earthquakes near the same coordinates from the USGS catalog.
 */
async function fetchHistoricalEvents(lat, lon, radiusKm = 50) {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=${radiusKm}&minmagnitude=4&limit=5&orderby=magnitude`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map((f) => ({
      id: f.id,
      mag: f.properties.mag || 0,
      time: f.properties.time,
      place: f.properties.place,
    }));
  } catch {
    // Show toast-like notification in console if fails
    console.warn('[Timeline] Could not load historical data – using cached only.');
    return [];
  }
}

export default {
  name: 'ShakingTimeline',
  props: {
    event: { type: Object, required: true },
    userDistance: { type: Number, default: null },
    userLocation: { type: Object, default: null },
  },
  emits: ['close'],

  setup(props) {
    const chartCanvas = ref(null);
    let chart = null;
    const historicalQuakes = ref([]);
    const selectedHistoricalId = ref('');
    const timelineData = ref(null);
    const isPlaying = ref(false);
    const playCursorTime = ref(0);
    let playAnimId = null;
    let playStartTime = 0;

    /**
     * Snap a time value to the nearest label string in the labels array.
     * Chart.js category scale requires exact string matches for annotation positioning.
     */
    function snapToNearestLabel(labels, time) {
      const numTime = parseFloat(time);
      let closest = labels[0];
      let minDiff = Infinity;
      for (const lbl of labels) {
        const diff = Math.abs(parseFloat(lbl) - numTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = lbl;
        }
      }
      return closest;
    }

    function renderChart() {
      if (!chartCanvas.value || !props.event) return;

      const distanceKm = props.userDistance || 100;
      const tl = generateTimeline(props.event, distanceKm);
      timelineData.value = tl;

      if (chart) chart.destroy();

      // Snap annotation positions to nearest labels for Chart.js category scale compatibility
      const pLabel = snapToNearestLabel(tl.labels, tl.pArrival);
      const sLabel = snapToNearestLabel(tl.labels, tl.sArrival);
      const peakLabel = snapToNearestLabel(tl.labels, tl.peakTime);

      const ctx = chartCanvas.value.getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: tl.labels,
          datasets: [
            {
              label: 'MMI Intensity',
              data: tl.mmiValues,
              borderColor: '#ff6d00',
              backgroundColor: 'rgba(255, 109, 0, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,  // Mobile-friendly
          animation: { duration: 600 },
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `Time: ${items[0].label}s`,
                label: (ctx) => `MMI ${ctx.raw}`,
              },
              backgroundColor: 'rgba(15, 15, 35, 0.9)',
              borderColor: '#233554',
              borderWidth: 1,
              titleColor: '#64ffda',
              bodyColor: '#ccd6f6',
            },
            annotation: {
              annotations: {
                pWaveLine: {
                  type: 'line',
                  xMin: pLabel,
                  xMax: pLabel,
                  borderColor: '#00e676',
                  borderWidth: 2,
                  borderDash: [6, 3],
                  label: {
                    display: true,
                    content: 'P‑wave',
                    position: 'start',
                    backgroundColor: 'rgba(0, 230, 118, 0.8)',
                    color: '#000',
                    font: { size: 10, weight: 'bold' },
                    padding: 4,
                  },
                },
                sWaveLine: {
                  type: 'line',
                  xMin: sLabel,
                  xMax: sLabel,
                  borderColor: '#ffd600',
                  borderWidth: 2,
                  borderDash: [6, 3],
                  label: {
                    display: true,
                    content: 'S‑wave',
                    position: 'start',
                    backgroundColor: 'rgba(255, 214, 0, 0.8)',
                    color: '#000',
                    font: { size: 10, weight: 'bold' },
                    padding: 4,
                  },
                },
                peakLine: {
                  type: 'line',
                  xMin: peakLabel,
                  xMax: peakLabel,
                  borderColor: '#ff1744',
                  borderWidth: 2,
                  borderDash: [6, 3],
                  label: {
                    display: true,
                    content: 'Peak',
                    position: 'end',
                    backgroundColor: 'rgba(255, 23, 68, 0.8)',
                    color: '#fff',
                    font: { size: 10, weight: 'bold' },
                    padding: 4,
                  },
                },
                safeLine: {
                  type: 'line',
                  yMin: 4,
                  yMax: 4,
                  borderColor: '#64ffda',
                  borderWidth: 1,
                  borderDash: [4, 4],
                  label: {
                    display: true,
                    content: 'Damage threshold (MMI 4)',
                    position: 'end',
                    backgroundColor: 'rgba(100, 255, 218, 0.8)',
                    color: '#000',
                    font: { size: 9, weight: 'bold' },
                    padding: 3,
                  },
                },
                // Play cursor annotation (initially hidden)
                playCursor: {
                  type: 'line',
                  xMin: 0,
                  xMax: 0,
                  borderColor: '#ffffff',
                  borderWidth: 2,
                  borderDash: [3, 3],
                  label: {
                    display: false,
                    content: '',
                  },
                },
              },
            },
          },
          scales: {
              x: {
                title: {
                  display: true,
                  text: 'Time (seconds after origin)',
                  color: '#8892b0',
                  font: { size: 11 },
                },
                max: tl.duration, // Ensure the x-axis shows the full duration including P/S-wave arrivals
                grid: { color: 'rgba(35, 53, 84, 0.5)' },
                ticks: { color: '#8892b0', font: { size: 10 }, maxTicksLimit: 20 },
              },
            y: {
              title: {
                display: true,
                text: 'MMI Intensity',
                color: '#8892b0',
                font: { size: 11 },
              },
              min: 0,
              max: 10,
              grid: { color: 'rgba(35, 53, 84, 0.5)' },
              ticks: { color: '#8892b0', font: { size: 10 }, stepSize: 1 },
            },
          },
        },
      });
    }

    function togglePlay() {
      if (isPlaying.value) {
        stopPlay();
      } else {
        startPlay();
      }
    }

    function startPlay() {
      if (!chart || !timelineData.value) return;
      isPlaying.value = true;
      playCursorTime.value = 0;
      playStartTime = performance.now();
      animatePlay();
    }

    function stopPlay() {
      isPlaying.value = false;
      if (playAnimId) {
        cancelAnimationFrame(playAnimId);
        playAnimId = null;
      }
      // Reset cursor to start and hide label
      if (chart) {
        const playCursor = chart.options.plugins.annotation.annotations.playCursor;
        if (playCursor) {
          playCursor.xMin = 0;
          playCursor.xMax = 0;
          playCursor.label = {
            display: false,
            content: '',
          };
          chart.update('none'); // 'none' avoids animation delay
        }
      }
      playCursorTime.value = 0;
    }

    function animatePlay() {
      if (!chart || !timelineData.value) return;
      const duration = timelineData.value.duration;
      // Adaptive speed: play entire duration in ~8 seconds regardless of event length
      const speedMultiplier = Math.max(1, duration / 8);
      const elapsed = (performance.now() - playStartTime) / 1000 * speedMultiplier;
      const currentTime = Math.min(elapsed, duration);
      playCursorTime.value = currentTime;

      const playCursor = chart.options.plugins.annotation.annotations.playCursor;
      if (playCursor) {
        // Use numeric time values directly for xMin/xMax
        // Use string labels (matching Chart.js category scale) for correct positioning
        playCursor.xMin = currentTime.toFixed(1);
        playCursor.xMax = currentTime.toFixed(1);
        playCursor.label = {
          display: true,
          content: `⏺ ${currentTime.toFixed(1)}s`,
          position: 'end',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          color: '#000',
          font: { size: 9, weight: 'bold' },
          padding: 3,
        };
        chart.update('none');
      }

      if (currentTime < duration) {
        playAnimId = requestAnimationFrame(animatePlay);
      } else {
        // Automatically stop at the end
        stopPlay();
      }
    }

    async function loadHistorical() {
      if (!selectedHistoricalId.value || !props.event) {
        if (chart && chart.data.datasets.length > 1) {
          chart.data.datasets.pop();
          chart.update();
        }
        return;
      }
      const hist = historicalQuakes.value.find((q) => q.id === selectedHistoricalId.value);
      if (!hist) return;

      const distanceKm = props.userDistance || 100;
      const histEvent = { magnitude: hist.mag, depth: props.event.depth || 10 };
      const histTl = generateTimeline(histEvent, distanceKm);

      if (chart) {
        if (chart.data.datasets.length > 1) {
          chart.data.datasets.pop();
        }
        chart.data.datasets.push({
          label: `M${hist.mag.toFixed(1)} historical`,
          data: histTl.mmiValues,
          borderColor: 'rgba(100, 255, 218, 0.7)',
          backgroundColor: 'rgba(100, 255, 218, 0.05)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [5, 3],
        });
        chart.update();
      }
    }

    // Load historical events on mount
    onMounted(async () => {
      await nextTick();
      if (props.event) {
        renderChart();
        if (props.event.latitude && props.event.longitude) {
          historicalQuakes.value = await fetchHistoricalEvents(
            props.event.latitude,
            props.event.longitude,
            50
          );
        }
      }
    });

    watch(
      () => props.event,
      async (newEvent) => {
        if (newEvent) {
          stopPlay(); // Stop any ongoing animation
          renderChart();
          if (newEvent.latitude && newEvent.longitude) {
            historicalQuakes.value = await fetchHistoricalEvents(
              newEvent.latitude,
              newEvent.longitude,
              50
            );
          }
        }
      }
    );

    watch(
      () => props.userDistance,
      () => {
        if (props.event && chartCanvas.value) {
          stopPlay();
          renderChart();
        }
      }
    );

    onBeforeUnmount(() => {
      stopPlay();
      if (chart) {
        chart.destroy();
        chart = null;
      }
    });

    function formatDate(ts) {
      return new Date(ts).toLocaleDateString();
    }

    return {
      chartCanvas,
      timelineData,
      historicalQuakes,
      selectedHistoricalId,
      loadHistorical,
      formatDate,
      isPlaying,
      playCursorTime,
      togglePlay,
    };
  },
};
</script>

<style scoped>
.timeline-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 520px;
  max-width: calc(100vw - 40px);
  background: rgba(15, 15, 35, 0.97);
  border: 1px solid #233554;
  border-radius: 10px;
  padding: 14px;
  z-index: 1100;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.timeline-header h3 {
  color: #64ffda;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

/* Chart wrapper for responsive sizing */
.timeline-chart-wrapper {
  width: 100%;
  height: 200px;
  position: relative;
}

.close-btn {
  background: none;
  border: none;
  color: #8892b0;
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
  transition: color 0.2s;
}
.close-btn:hover {
  color: #ff1744;
}

.timeline-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 8px;
  font-size: 10px;
  color: #8892b0;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.dot-p { background: #00e676; }
.dot-s { background: #ffd600; }
.dot-peak { background: #ff1744; }
.dot-safe { background: #64ffda; }

.timeline-stats {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(35, 53, 84, 0.3);
  border-radius: 6px;
  font-size: 11px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stat-label {
  color: #8892b0;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.stat-value {
  color: #ccd6f6;
  font-weight: 700;
  font-size: 13px;
}

/* Play controls */
.timeline-play-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.play-btn {
  background: #233554;
  color: #64ffda;
  border: 1px solid #2e4a6b;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.2s;
}
.play-btn:hover:not(:disabled) {
  background: #2e4a6b;
}
.play-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.play-time {
  font-size: 11px;
  color: #8892b0;
}

.timeline-controls {
  margin-top: 10px;
  font-size: 12px;
  color: #8892b0;
}
.timeline-controls label {
  margin-right: 6px;
}
select {
  background: #0f0f23;
  color: #ccd6f6;
  border: 1px solid #233554;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
}
select:focus {
  outline: 1px solid #64ffda;
}
</style>