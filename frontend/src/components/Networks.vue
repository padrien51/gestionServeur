<template>
  <div class="p-4 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center">
        <span class="mr-2">🌐</span> Réseaux Docker
      </h1>
      <button 
        @click="fetchNetworks" 
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center transition-colors"
        :disabled="loading"
      >
        <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        Actualiser
      </button>
    </div>

    <div v-if="error" class="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded relative">
      {{ error }}
    </div>

    <div v-else-if="loading && networks.length === 0" class="text-center py-12">
      <svg class="animate-spin h-10 w-10 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
      <p class="mt-4 text-slate-500 dark:text-slate-400">Chargement des réseaux...</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="net in networks" :key="net.id" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center">
            <div class="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mr-3">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
            </div>
            <div>
              <h3 class="font-bold text-slate-800 dark:text-slate-200 text-lg">{{ net.name }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">{{ net.id.substring(0, 12) }}</p>
            </div>
          </div>
          <span class="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-600">
            {{ net.driver }}
          </span>
        </div>
        
        <div class="space-y-3 mt-4 text-sm">
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-2">
            <span class="text-slate-500 dark:text-slate-400">Scope</span>
            <span class="text-slate-700 dark:text-slate-300 font-medium capitalize">{{ net.scope }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-2">
            <span class="text-slate-500 dark:text-slate-400">Sous-réseau (Subnet)</span>
            <span class="text-slate-700 dark:text-slate-300 font-mono text-xs bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded">{{ net.subnet }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-2">
            <span class="text-slate-500 dark:text-slate-400">Passerelle (Gateway)</span>
            <span class="text-slate-700 dark:text-slate-300 font-mono text-xs bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded">{{ net.gateway }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-slate-500 dark:text-slate-400">Conteneurs attachés</span>
            <span class="font-bold" :class="net.containers > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'">
              {{ net.containers }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const networks = ref([]);
const loading = ref(true);
const error = ref(null);
const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
});

const fetchNetworks = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(`${API_BASE}/docker/networks`, getFetchOptions());
    if (!res.ok) throw new Error("Erreur de récupération des réseaux.");
    networks.value = await res.json();
    networks.value.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchNetworks();
});
</script>
