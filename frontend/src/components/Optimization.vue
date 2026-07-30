<script setup>
import { ref, onMounted } from 'vue';
import { useModal } from '../composables/useModal';

const { showConfirm, showAlert } = useModal();
const API_BASE = '/api';

const dfInfo = ref(null);
const loading = ref(true);
const isPruning = ref(false);
const error = ref(null);

const fetchDfInfo = async () => {
    loading.value = true;
    error.value = null;
    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/docker/system-df`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Erreur lors du calcul de l'espace disque");
        dfInfo.value = await res.json();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
};

const handlePrune = async () => {
  const confirmed = await showConfirm(
    "Nettoyage Docker (Prune)",
    "Cette action va supprimer tous les conteneurs arrêtés, les réseaux non utilisés, les images fantômes et les volumes orphelins.\n\nÊtes-vous sûr de vouloir continuer ?"
  );
  if (!confirmed) return;
  
  isPruning.value = true;
  try {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/docker/prune`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du nettoyage");
    const mb = (data.reclaimedSpace / (1024 * 1024)).toFixed(2);
    showAlert("Nettoyage Terminé", `Le nettoyage a libéré ${mb} Mo d'espace disque.`);
    await fetchDfInfo();
  } catch (e) {
    showAlert("Erreur", e.message);
  } finally {
    isPruning.value = false;
  }
};

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

onMounted(() => {
    fetchDfInfo();
});
</script>

<template>
  <div class="p-4 space-y-8 pb-32 max-w-5xl mx-auto">
    <div>
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">🧹</span> Optimisation Docker
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Gérez l'espace disque consommé par vos conteneurs et nettoyez le gaspillage.</p>
    </div>

    <div v-if="loading" class="text-center py-16">
        <svg class="animate-spin h-8 w-8 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        <p class="mt-4 text-slate-500 dark:text-slate-400 font-medium">Analyse de l'espace disque en cours... cela peut prendre quelques secondes.</p>
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-xl text-center border border-red-200 dark:border-red-800">
        {{ error }}
    </div>

    <div v-else-if="dfInfo" class="space-y-6">
        <!-- Dashboard Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center items-center text-center">
                <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Espace Total Consommé par Docker</span>
                <span class="text-4xl font-black text-slate-800 dark:text-white mt-2">{{ formatBytes(dfInfo.TotalSize || 0) }}</span>
            </div>
            
            <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-md flex flex-col justify-center items-center text-center text-white relative overflow-hidden group">
                <div class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span class="text-sm font-medium text-emerald-100">Espace Récupérable (Inutilisé)</span>
                <span class="text-4xl font-black mt-2">{{ formatBytes(dfInfo.Reclaimable || 0) }}</span>
                <button 
                  @click="handlePrune" 
                  :disabled="isPruning"
                  class="mt-4 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-6 py-2 rounded-full font-bold transition-all disabled:opacity-50 text-sm flex items-center space-x-2"
                >
                  <svg v-if="isPruning" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                  <span v-else>🧹</span>
                  <span>Lancer le Nettoyage</span>
                </button>
            </div>
        </div>

        <!-- Details -->
        <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">Détails de l'utilisation</h3>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <!-- Images -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">📦</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Images</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.Images?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Images mises en cache sur le serveur (utilisées et inutilisées)</p>
            </div>

            <!-- Conteneurs -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">🐳</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Conteneurs</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.Containers?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Conteneurs créés (actifs ou arrêtés)</p>
            </div>

            <!-- Volumes -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">💾</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Volumes</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.Volumes?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Volumes de persistance des données</p>
            </div>
        </div>
    </div>
  </div>
</template>
