<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center">
        <svg class="w-7 h-7 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        Surveillance de Sécurité (IDS)
      </h1>
      <button @click="clearEvents" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors text-sm font-medium flex items-center">
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        Purger l'historique
      </button>
    </div>

    <div class="flex-1 overflow-auto bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
      <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
        <thead class="text-xs uppercase bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 sticky top-0">
          <tr>
            <th class="px-4 py-3 font-medium">Date</th>
            <th class="px-4 py-3 font-medium">Conteneur visé</th>
            <th class="px-4 py-3 font-medium">IP Attaquant</th>
            <th class="px-4 py-3 font-medium">Menace détectée</th>
            <th class="px-4 py-3 font-medium">Sévérité</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-if="events.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-500">Aucune menace détectée pour le moment.</td>
          </tr>
          <tr v-for="event in events" :key="event.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <td class="px-4 py-3 whitespace-nowrap">{{ new Date(event.created_at).toLocaleString() }}</td>
            <td class="px-4 py-3 font-mono text-xs">{{ event.container_name }}</td>
            <td class="px-4 py-3 font-mono text-xs font-bold text-red-500">{{ event.attacker_ip }}</td>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-800 dark:text-slate-200">{{ event.event_type }}</div>
              <div class="text-xs text-slate-500 font-mono mt-1 truncate max-w-md" :title="event.log_line">{{ event.log_line }}</div>
            </td>
            <td class="px-4 py-3">
              <span :class="severityClass(event.severity)" class="px-2 py-1 text-xs font-medium rounded-full uppercase">
                {{ event.severity }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
});

const events = ref([]);
let interval = null;

const fetchEvents = async () => {
  try {
    const res = await fetch(`${API_BASE}/security/events`, getFetchOptions());
    if (res.ok) {
      events.value = await res.json();
    }
  } catch (e) {
    console.error(e);
  }
};

const clearEvents = async () => {
  if (!confirm("Voulez-vous vraiment purger tout l'historique de sécurité ?")) return;
  try {
    const res = await fetch(`${API_BASE}/security/events/clear`, {
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.ok) fetchEvents();
  } catch (e) {
    console.error(e);
  }
};

const severityClass = (sev) => {
  switch(sev) {
    case 'low': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500';
    case 'medium': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-500';
    case 'high': 
    case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500';
    default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
  }
};

const startPolling = () => {
  if (!interval) {
    interval = setInterval(fetchEvents, 5000);
  }
};

const stopPolling = () => {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
};

const handleVisibility = () => {
  if (document.visibilityState === 'visible') {
    fetchEvents();
    startPolling();
  } else {
    stopPolling();
  }
};

onMounted(() => {
  fetchEvents();
  startPolling();
  document.addEventListener('visibilitychange', handleVisibility);
});

onUnmounted(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>
