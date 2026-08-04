<template>
  <div class="relative w-full h-64 bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200/60 dark:border-slate-700 shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner">
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 rounded-xl z-10">
      <svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
    </div>
    <div v-else-if="error" class="h-full flex items-center justify-center text-red-500 text-sm">
      {{ error }}
    </div>
    <div v-else-if="!hasData" class="h-full flex items-center justify-center text-slate-400 text-sm italic">
      Données historiques insuffisantes...
    </div>
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'vue-chartjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_BASE = '/api';
const history = ref([]);
const loading = ref(true);
const error = ref(null);

const hasData = computed(() => history.value.length > 0);

const isDark = computed(() => document.documentElement.classList.contains('dark'));

const chartData = computed(() => {
  const labels = history.value.map(d => {
    // Adapter au fuseau horaire local
    const date = new Date(d.timestamp + 'Z');
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const cpuData = history.value.map(d => Math.round(d.cpuLoad || 0));
  const ramData = history.value.map(d => Math.round((d.memUsed / d.memTotal) * 100) || 0);

  return {
    labels,
    datasets: [
      {
        label: 'CPU (%)',
        backgroundColor: isDark.value ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4,
        data: cpuData
      },
      {
        label: 'RAM (%)',
        backgroundColor: isDark.value ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.1)',
        borderColor: 'rgb(168, 85, 247)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4,
        data: ramData
      }
    ]
  };
});

const chartOptions = computed(() => {
  const textColor = isDark.value ? '#94a3b8' : '#64748b';
  const gridColor = isDark.value ? '#334155' : '#e2e8f0';

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: textColor,
          usePointStyle: true,
          boxWidth: 8
        }
      },
      tooltip: {
        backgroundColor: isDark.value ? '#1e293b' : '#ffffff',
        titleColor: isDark.value ? '#f8fafc' : '#0f172a',
        bodyColor: isDark.value ? '#cbd5e1' : '#334155',
        borderColor: gridColor,
        borderWidth: 1,
        padding: 10,
        boxPadding: 4
      }
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        ticks: {
          color: textColor,
          maxTicksLimit: 8
        }
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: gridColor,
          drawBorder: false
        },
        ticks: {
          color: textColor,
          stepSize: 25,
          callback: function(value) {
            return value + '%';
          }
        }
      }
    }
  };
});

const fetchHistory = async () => {
  try {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/system/metrics/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de chargement");
    history.value = data;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

let intervalId;
onMounted(() => {
  fetchHistory();
  intervalId = setInterval(fetchHistory, 120000);
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});
</script>
