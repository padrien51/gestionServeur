<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import ContainerCard from './ContainerCard.vue';
import LogViewer from './LogViewer.vue';

const metrics = ref({ cpuLoad: 0, memUsed: 0, memTotal: 1, diskUsed: 0, diskTotal: 1 });
const containers = ref([]);
const loading = ref(true);
const error = ref(null);
const activeLogContainer = ref(null);

const viewMode = ref(localStorage.getItem('dashboard_view_mode') || 'apps');

const toggleViewMode = (mode) => {
  viewMode.value = mode;
  localStorage.setItem('dashboard_view_mode', mode);
};

import { computed } from 'vue';

const groupedApps = computed(() => {
  const map = {};
  for (const c of containers.value) {
    if (!map[c.project]) {
      map[c.project] = { name: c.project, containers: [] };
    }
    map[c.project].containers.push(c);
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
});

const openLogs = (container) => {
  activeLogContainer.value = {
    id: container.id,
    name: container.name
  };
};

const API_BASE = '/api'; // Chemin relatif pour fonctionner avec le backend Express

const getFetchOptions = () => ({
  headers: { 'x-api-password': localStorage.getItem('app_pwd') || '' }
});

const handleUnauthorized = () => {
  localStorage.removeItem('app_pwd');
  window.location.reload();
};

const fetchMetrics = async () => {
  try {
    const res = await fetch(`${API_BASE}/system/metrics`, getFetchOptions());
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error('Erreur métriques');
    metrics.value = await res.json();
  } catch (err) {
    console.error(err);
  }
};

const fetchContainers = async () => {
  try {
    const res = await fetch(`${API_BASE}/docker/containers`, getFetchOptions());
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error('Erreur conteneurs');
    containers.value = await res.json();
  } catch (err) {
    error.value = "Impossible de charger les conteneurs.";
    console.error(err);
  }
};

const refreshData = async () => {
  await Promise.all([fetchMetrics(), fetchContainers()]);
  loading.value = false;
};

const handleContainerAction = async ({ id, action }) => {
  try {
    const res = await fetch(`${API_BASE}/docker/containers/${id}/${action}`, { 
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error(`Erreur lors de l'action ${action}`);
    // Rafraîchir après une petite pause pour laisser le temps au démon Docker
    setTimeout(refreshData, 1000);
  } catch (err) {
    alert(err.message);
  }
};

const isPruning = ref(false);

const pruneDocker = async () => {
  if (!confirm("⚠️ ATTENTION : Cela va supprimer TOUS les conteneurs arrêtés, les réseaux non utilisés, les volumes orphelins, et les images non tagguées (dangling). Voulez-vous continuer ?")) {
    return;
  }
  
  isPruning.value = true;
  try {
    const res = await fetch(`${API_BASE}/docker/prune`, {
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error("Erreur serveur lors du nettoyage");
    
    const data = await res.json();
    if (data.success) {
      alert(`Nettoyage terminé avec succès ! 🎉\n\nEspace libéré : ${formatBytes(data.spaceReclaimed)}`);
      refreshData();
    }
  } catch (err) {
    alert("Erreur : " + err.message);
  } finally {
    isPruning.value = false;
  }
};

let intervalId;
onMounted(() => {
  refreshData();
  intervalId = setInterval(refreshData, 5000); // Auto refresh toutes les 5s
});

onUnmounted(() => {
  clearInterval(intervalId);
});

// Utilitaires de calcul
const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const memPercent = ref(() => (metrics.value.memUsed / metrics.value.memTotal) * 100);
const diskPercent = ref(() => (metrics.value.diskUsed / metrics.value.diskTotal) * 100);

</script>

<template>
  <div class="p-4 space-y-6">
    <!-- Section Métriques Hôte -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-100 flex items-center">
        <span class="mr-2">🖥️</span> Ressources Système
      </h2>
      
      <div class="grid grid-cols-3 gap-3">
        <!-- CPU Gauge -->
        <div class="bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-700 shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-blue-500 transition-all duration-500" :stroke-dasharray="`${metrics.cpuLoad}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(metrics.cpuLoad) }}%</span>
          </div>
          <span class="text-xs text-slate-400 mt-2 font-medium">CPU</span>
        </div>

        <!-- RAM Gauge -->
        <div class="bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-700 shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-purple-500 transition-all duration-500" :stroke-dasharray="`${memPercent()}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(memPercent()) }}%</span>
          </div>
          <span class="text-xs text-slate-400 mt-2 font-medium">RAM</span>
        </div>

        <!-- Disk Gauge -->
        <div class="bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-700 shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-teal-500 transition-all duration-500" :stroke-dasharray="`${diskPercent()}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(diskPercent()) }}%</span>
          </div>
          <span class="text-xs text-slate-400 mt-2 font-medium">SSD</span>
        </div>
      </div>
      
      <!-- Détails en texte sous les jauges -->
      <div class="mt-3 text-xs text-slate-400 flex justify-between px-1">
        <span>RAM: {{ formatBytes(metrics.memUsed) }} / {{ formatBytes(metrics.memTotal) }}</span>
        <span>SSD: {{ formatBytes(metrics.diskUsed) }} / {{ formatBytes(metrics.diskTotal) }}</span>
      </div>
    </section>

    <!-- Section Nettoyage Docker -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-100 flex items-center">
        <span class="mr-2">🧹</span> Nettoyage & Stockage
      </h2>
      <div class="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg flex items-center justify-between">
        <div class="flex-1 pr-4">
          <h3 class="text-sm font-semibold text-slate-200">Purger le système Docker</h3>
          <p class="text-xs text-slate-400 mt-1">Supprime les images non utilisées (dangling) et les conteneurs/volumes orphelins pour libérer de l'espace disque.</p>
        </div>
        <button 
          @click="pruneDocker"
          :disabled="isPruning"
          class="flex-shrink-0 px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50"
        >
          <span v-if="isPruning">Nettoyage...</span>
          <span v-else>Purger (Prune)</span>
        </button>
      </div>
    </section>

    <!-- Section Conteneurs / Applications -->
    <section>
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-3">
        <h2 class="text-xl font-bold text-slate-100 flex items-center">
          <span class="mr-2">📦</span> Applications & Conteneurs
        </h2>
        
        <!-- Toggle Vue -->
        <div class="flex bg-slate-800 p-1 rounded-lg border border-slate-700 w-full sm:w-auto">
          <button 
            @click="toggleViewMode('apps')" 
            :class="viewMode === 'apps' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
            class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
          >
            Vue Applications
          </button>
          <button 
            @click="toggleViewMode('containers')" 
            :class="viewMode === 'containers' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
            class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
          >
            Vue Conteneurs
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-8 text-slate-400 animate-pulse">
        Chargement des données...
      </div>
      
      <div v-else-if="error" class="bg-red-900/50 text-red-200 p-4 rounded-lg border border-red-700">
        {{ error }}
      </div>
      
      <div v-else class="space-y-4 pb-4">
        
        <!-- Vue par Applications -->
        <div v-if="viewMode === 'apps'" class="space-y-6">
          <div v-for="app in groupedApps" :key="app.name" class="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-sm">
            <!-- En-tête de l'application -->
            <div class="bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
              <h3 class="font-bold text-slate-200 flex items-center text-lg">
                <span class="mr-2">📂</span> {{ app.name }}
              </h3>
              <span class="text-xs bg-slate-900 text-slate-400 px-2.5 py-1 rounded-md border border-slate-700">
                {{ app.containers.length }} conteneur(s)
              </span>
            </div>
            <!-- Liste des conteneurs de l'app -->
            <div class="p-3 space-y-3">
              <ContainerCard 
                v-for="container in app.containers" 
                :key="container.id" 
                :container="container"
                @action="handleContainerAction"
                @view-logs="openLogs"
              />
            </div>
          </div>
          
          <div v-if="groupedApps.length === 0" class="text-center py-8 text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            Aucune application trouvée.
          </div>
        </div>

        <!-- Vue par Conteneurs (Plate) -->
        <div v-else class="space-y-3">
          <ContainerCard 
            v-for="container in containers" 
            :key="container.id" 
            :container="container"
            @action="handleContainerAction"
            @view-logs="openLogs"
          />
          <div v-if="containers.length === 0" class="text-center py-8 text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            Aucun conteneur trouvé.
          </div>
        </div>

      </div>
    </section>

    <!-- Composant des logs en direct -->
    <LogViewer 
      :container-id="activeLogContainer?.id"
      :container-name="activeLogContainer?.name"
      @close="activeLogContainer = null"
    />
  </div>
</template>
