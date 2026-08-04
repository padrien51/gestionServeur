<script setup>
import { ref, onMounted } from 'vue';
import { useModal } from '../composables/useModal';

const { showConfirm, showAlert } = useModal();
const API_BASE = '/api';

const dfInfo = ref(null);
const loading = ref(true);
const isPruning = ref(false);
const error = ref(null);

const activeTab = ref('express'); // 'express' or 'detailed'

// State for detailed cleanup
const unusedResources = ref(null);
const loadingUnused = ref(false);
const selectedIds = ref({ images: [], containers: [], volumes: [], networks: [] });
const isDeleting = ref(false);

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

const fetchUnusedResources = async () => {
    loadingUnused.value = true;
    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/docker/unused`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Erreur lors de la récupération des ressources inutilisées");
        unusedResources.value = await res.json();
    } catch (e) {
        showAlert("Erreur", e.message);
    } finally {
        loadingUnused.value = false;
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
    if (activeTab.value === 'detailed') await fetchUnusedResources();
  } catch (e) {
    showAlert("Erreur", e.message);
  } finally {
    isPruning.value = false;
  }
};

const deleteSpecificResources = async (type, ids) => {
    if (ids.length === 0) return;
    
    // Si c'est une suppression multiple, on demande confirmation
    if (ids.length > 1) {
        const confirmed = await showConfirm(
            "Suppression multiple", 
            `Voulez-vous vraiment supprimer ces ${ids.length} éléments ? Cette action est irréversible.`
        );
        if (!confirmed) return;
    }

    isDeleting.value = true;
    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/docker/delete-resources`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, ids })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur de suppression");
        
        if (data.errors && data.errors.length > 0) {
            showAlert("Attention", `Certains éléments n'ont pas pu être supprimés :\n${data.errors.join('\n')}`);
        } else {
            // Pas d'alerte si c'est une suppression individuelle réussie, pour ne pas polluer l'UX,
            // sauf si c'est une suppression multiple.
            if (ids.length > 1) {
                showAlert("Succès", `${data.success} éléments supprimés avec succès.`);
            }
        }
        
        // Reset selection
        selectedIds.value[type + 's'] = [];
        
        // Refresh data
        await fetchUnusedResources();
        await fetchDfInfo();
    } catch (e) {
        showAlert("Erreur", e.message);
    } finally {
        isDeleting.value = false;
    }
};

const toggleSelection = (category, id) => {
    const list = selectedIds.value[category];
    const index = list.indexOf(id);
    if (index === -1) {
        list.push(id);
    } else {
        list.splice(index, 1);
    }
};

const selectAll = (category) => {
    if (!unusedResources.value) return;
    const items = unusedResources.value[category];
    
    // Si tout est déjà sélectionné, on désélectionne tout
    if (selectedIds.value[category].length === items.length && items.length > 0) {
        selectedIds.value[category] = [];
    } else {
        // Sinon, on sélectionne tout (on utilise le bon champ d'identifiant selon la catégorie)
        selectedIds.value[category] = items.map(item => category === 'volumes' ? item.name : item.id);
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

    <!-- TABS -->
    <div class="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner max-w-fit">
        <button 
            @click="activeTab = 'express'" 
            :class="activeTab === 'express' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
            class="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        >
            Nettoyage Express
        </button>
        <button 
            @click="() => { activeTab = 'detailed'; if(!unusedResources) fetchUnusedResources(); }" 
            :class="activeTab === 'detailed' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
            class="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        >
            Nettoyage Ciblé
        </button>
    </div>

    <div v-if="loading && activeTab === 'express'" class="text-center py-16">
        <svg class="animate-spin h-8 w-8 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        <p class="mt-4 text-slate-500 dark:text-slate-400 font-medium">Analyse de l'espace disque en cours...</p>
    </div>

    <div v-else-if="error && activeTab === 'express'" class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-xl text-center border border-red-200 dark:border-red-800">
        {{ error }}
    </div>

    <!-- ONGLET: NETTOYAGE EXPRESS -->
    <div v-if="activeTab === 'express' && dfInfo" class="space-y-6 animate-fade-in">
        <!-- Dashboard Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm flex flex-col justify-center items-center text-center">
                <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Espace Total Consommé par Docker</span>
                <span class="text-4xl font-black text-slate-800 dark:text-white mt-2">{{ formatBytes(dfInfo.TotalSize || 0) }}</span>
            </div>
            
            <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.05)] dark:shadow-md flex flex-col justify-center items-center text-center text-white relative overflow-hidden group">
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
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200/60 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">📦</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Images</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.raw?.Images?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Images mises en cache sur le serveur</p>
            </div>

            <!-- Conteneurs -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200/60 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">🐳</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Conteneurs</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.raw?.Containers?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Conteneurs créés (actifs ou arrêtés)</p>
            </div>

            <!-- Volumes -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200/60 dark:border-slate-700 flex flex-col h-full">
                <div class="flex items-center space-x-3 mb-2">
                    <span class="text-2xl">💾</span>
                    <h4 class="font-bold text-slate-800 dark:text-slate-200">Volumes</h4>
                </div>
                <div class="text-3xl font-black text-slate-700 dark:text-white">{{ dfInfo.raw?.Volumes?.length || 0 }}</div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1">Volumes de persistance des données</p>
            </div>
        </div>
    </div>

    <!-- ONGLET: NETTOYAGE CIBLÉ -->
    <div v-if="activeTab === 'detailed'" class="space-y-8 animate-fade-in">
        
        <div v-if="loadingUnused" class="text-center py-16">
            <svg class="animate-spin h-8 w-8 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
            <p class="mt-4 text-slate-500 dark:text-slate-400 font-medium">Récupération des ressources inutilisées...</p>
        </div>

        <div v-else-if="unusedResources">
            
            <!-- CONTENEURS ARRÊTÉS -->
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 overflow-hidden mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm">
                <div class="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200/60 dark:border-slate-700 flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <span class="text-xl">🐳</span>
                        <h3 class="font-bold text-slate-800 dark:text-slate-200">Conteneurs Arrêtés</h3>
                        <span class="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold">{{ unusedResources.containers.length }}</span>
                    </div>
                    <button v-if="selectedIds.containers.length > 0" @click="deleteSpecificResources('container', selectedIds.containers)" class="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50" :disabled="isDeleting">
                        Supprimer la sélection ({{ selectedIds.containers.length }})
                    </button>
                </div>
                
                <div v-if="unusedResources.containers.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400">
                    Aucun conteneur arrêté.
                </div>
                <div v-else class="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    <div class="p-3 bg-slate-50/50 dark:bg-slate-800/50 flex text-xs font-semibold text-slate-500 dark:text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                        <div class="w-8 flex justify-center"><input type="checkbox" @change="selectAll('containers')" :checked="selectedIds.containers.length === unusedResources.containers.length && unusedResources.containers.length > 0" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"></div>
                        <div class="flex-1">Nom du Conteneur</div>
                        <div class="flex-1 hidden md:block">Image</div>
                        <div class="w-24 text-right pr-4">Action</div>
                    </div>
                    <div v-for="c in unusedResources.containers" :key="c.id" class="p-3 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div class="w-8 flex justify-center">
                            <input type="checkbox" :checked="selectedIds.containers.includes(c.id)" @change="toggleSelection('containers', c.id)" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent">
                        </div>
                        <div class="flex-1 min-w-0 pr-4">
                            <p class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{{ c.name.replace(/^\//, '') }}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400 truncate md:hidden">{{ c.image }}</p>
                        </div>
                        <div class="flex-1 hidden md:block min-w-0 pr-4">
                            <p class="text-sm text-slate-600 dark:text-slate-400 truncate">{{ c.image }}</p>
                        </div>
                        <div class="w-24 flex justify-end pr-2">
                            <button @click="deleteSpecificResources('container', [c.id])" :disabled="isDeleting" class="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50" title="Supprimer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- IMAGES INUTILISÉES -->
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 overflow-hidden mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm">
                <div class="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200/60 dark:border-slate-700 flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <span class="text-xl">📦</span>
                        <h3 class="font-bold text-slate-800 dark:text-slate-200">Images Inutilisées</h3>
                        <span class="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold">{{ unusedResources.images.length }}</span>
                    </div>
                    <button v-if="selectedIds.images.length > 0" @click="deleteSpecificResources('image', selectedIds.images)" class="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50" :disabled="isDeleting">
                        Supprimer la sélection ({{ selectedIds.images.length }})
                    </button>
                </div>
                
                <div v-if="unusedResources.images.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400">
                    Aucune image inutilisée.
                </div>
                <div v-else class="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    <div class="p-3 bg-slate-50/50 dark:bg-slate-800/50 flex text-xs font-semibold text-slate-500 dark:text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                        <div class="w-8 flex justify-center"><input type="checkbox" @change="selectAll('images')" :checked="selectedIds.images.length === unusedResources.images.length && unusedResources.images.length > 0" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"></div>
                        <div class="flex-[2]">Image</div>
                        <div class="flex-1 text-right pr-4">Taille</div>
                        <div class="w-24 text-right pr-4">Action</div>
                    </div>
                    <div v-for="img in unusedResources.images" :key="img.id" class="p-3 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div class="w-8 flex justify-center">
                            <input type="checkbox" :checked="selectedIds.images.includes(img.id)" @change="toggleSelection('images', img.id)" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent">
                        </div>
                        <div class="flex-[2] min-w-0 pr-4">
                            <p class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{{ img.tags.length > 0 ? img.tags[0] : '<none>:<none>' }}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ img.id.split(':')[1]?.substring(0,12) || img.id }}</p>
                        </div>
                        <div class="flex-1 text-right pr-4">
                            <p class="text-sm text-slate-600 dark:text-slate-400">{{ formatBytes(img.size) }}</p>
                        </div>
                        <div class="w-24 flex justify-end pr-2">
                            <button @click="deleteSpecificResources('image', [img.id])" :disabled="isDeleting" class="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50" title="Supprimer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- VOLUMES ORPHELINS -->
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 overflow-hidden mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm">
                <div class="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200/60 dark:border-slate-700 flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <span class="text-xl">💾</span>
                        <h3 class="font-bold text-slate-800 dark:text-slate-200">Volumes Orphelins</h3>
                        <span class="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold">{{ unusedResources.volumes.length }}</span>
                    </div>
                    <button v-if="selectedIds.volumes.length > 0" @click="deleteSpecificResources('volume', selectedIds.volumes)" class="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50" :disabled="isDeleting">
                        Supprimer la sélection ({{ selectedIds.volumes.length }})
                    </button>
                </div>
                
                <div v-if="unusedResources.volumes.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400">
                    Aucun volume orphelin.
                </div>
                <div v-else class="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    <div class="p-3 bg-slate-50/50 dark:bg-slate-800/50 flex text-xs font-semibold text-slate-500 dark:text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                        <div class="w-8 flex justify-center"><input type="checkbox" @change="selectAll('volumes')" :checked="selectedIds.volumes.length === unusedResources.volumes.length && unusedResources.volumes.length > 0" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"></div>
                        <div class="flex-[2]">Nom du Volume</div>
                        <div class="flex-1 text-right pr-4">Taille</div>
                        <div class="w-24 text-right pr-4">Action</div>
                    </div>
                    <div v-for="vol in unusedResources.volumes" :key="vol.name" class="p-3 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div class="w-8 flex justify-center">
                            <input type="checkbox" :checked="selectedIds.volumes.includes(vol.name)" @change="toggleSelection('volumes', vol.name)" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent">
                        </div>
                        <div class="flex-[2] min-w-0 pr-4">
                            <p class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{{ vol.name }}</p>
                        </div>
                        <div class="flex-1 text-right pr-4">
                            <p class="text-sm text-slate-600 dark:text-slate-400">{{ formatBytes(vol.size) }}</p>
                        </div>
                        <div class="w-24 flex justify-end pr-2">
                            <button @click="deleteSpecificResources('volume', [vol.name])" :disabled="isDeleting" class="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50" title="Supprimer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RÉSEAUX INUTILISÉS -->
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm">
                <div class="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200/60 dark:border-slate-700 flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <span class="text-xl">🌐</span>
                        <h3 class="font-bold text-slate-800 dark:text-slate-200">Réseaux Inutilisés</h3>
                        <span class="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold">{{ unusedResources.networks.length }}</span>
                    </div>
                    <button v-if="selectedIds.networks.length > 0" @click="deleteSpecificResources('network', selectedIds.networks)" class="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50" :disabled="isDeleting">
                        Supprimer la sélection ({{ selectedIds.networks.length }})
                    </button>
                </div>
                
                <div v-if="unusedResources.networks.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400">
                    Aucun réseau personnalisé inutilisé.
                </div>
                <div v-else class="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    <div class="p-3 bg-slate-50/50 dark:bg-slate-800/50 flex text-xs font-semibold text-slate-500 dark:text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                        <div class="w-8 flex justify-center"><input type="checkbox" @change="selectAll('networks')" :checked="selectedIds.networks.length === unusedResources.networks.length && unusedResources.networks.length > 0" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"></div>
                        <div class="flex-1">Nom du Réseau</div>
                        <div class="flex-1 hidden md:block">Driver</div>
                        <div class="w-24 text-right pr-4">Action</div>
                    </div>
                    <div v-for="net in unusedResources.networks" :key="net.id" class="p-3 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div class="w-8 flex justify-center">
                            <input type="checkbox" :checked="selectedIds.networks.includes(net.id)" @change="toggleSelection('networks', net.id)" class="rounded border-slate-200/60 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent">
                        </div>
                        <div class="flex-1 min-w-0 pr-4">
                            <p class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{{ net.name }}</p>
                        </div>
                        <div class="flex-1 hidden md:block min-w-0 pr-4">
                            <p class="text-sm text-slate-600 dark:text-slate-400 truncate">{{ net.driver }}</p>
                        </div>
                        <div class="w-24 flex justify-end pr-2">
                            <button @click="deleteSpecificResources('network', [net.id])" :disabled="isDeleting" class="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50" title="Supprimer">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
  </div>
</template>
