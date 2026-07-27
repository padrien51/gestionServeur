<script setup>
import { ref, onMounted } from 'vue';

const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: { 'x-api-password': localStorage.getItem('app_pwd') || '' }
});

const osUpdates = ref({ available: false, rawText: '', supported: true });
const containers = ref([]);
const loading = ref(true);
const updatingContainer = ref(null);
const updateMessage = ref('');

const fetchOSUpdates = async () => {
  try {
    const res = await fetch(`${API_BASE}/updates/os`, getFetchOptions());
    if (res.ok) {
      osUpdates.value = await res.json();
    }
  } catch (err) {
    console.error("Erreur OS updates:", err);
  }
};

const checkDockerUpdates = async () => {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/updates/docker/check`, getFetchOptions());
    if (res.ok) {
      containers.value = await res.json();
    }
  } catch (err) {
    console.error("Erreur check MAJ docker:", err);
  } finally {
    loading.value = false;
  }
};

const applyUpdate = async (container) => {
  if (container.isBreaking) {
    if (!confirm(`⚠️ ATTENTION : Des Breaking Changes ont été détectés pour ${container.name}.\nLisez bien le changelog avant de continuer. Voulez-vous vraiment forcer la mise à jour ?`)) {
      return;
    }
  } else {
    if (!confirm(`Voulez-vous lancer la mise à jour de ${container.name} (v.${container.currentVersion} -> v.${container.newVersion}) ?`)) {
      return;
    }
  }

  updatingContainer.value = container.name;
  updateMessage.value = `Lancement de Watchtower pour ${container.name}...`;

  try {
    const res = await fetch(`${API_BASE}/updates/docker/apply/${container.name}`, {
      method: 'POST',
      ...getFetchOptions()
    });
    const data = await res.json();
    if (res.ok) {
      updateMessage.value = data.message || `Mise à jour terminée.`;
      setTimeout(() => { updateMessage.value = ''; }, 5000);
    } else {
      throw new Error(data.error || "Erreur serveur");
    }
  } catch (err) {
    alert("Erreur lors de la mise à jour : " + err.message);
    updateMessage.value = '';
  } finally {
    updatingContainer.value = null;
    checkDockerUpdates();
  }
};

onMounted(async () => {
  fetchOSUpdates();
  checkDockerUpdates();
});
</script>

<template>
  <div class="p-4 space-y-6">
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-100 flex items-center">
        <span class="mr-2">🐧</span> Mises à jour Système (Ubuntu)
      </h2>
      <div class="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
        <div v-if="osUpdates.supported && osUpdates.available" class="text-slate-300 font-mono text-sm whitespace-pre-wrap bg-[#0d1117] p-4 rounded-lg">
          {{ osUpdates.rawText }}
        </div>
        <div v-else class="text-slate-400 text-sm">
          {{ osUpdates.rawText || "Aucune mise à jour détectée ou fichier de suivi non monté." }}
        </div>
      </div>
    </section>

    <section>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-slate-100 flex items-center">
          <span class="mr-2">🐳</span> Conteneurs Docker
        </h2>
        <button @click="checkDockerUpdates" class="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded">
          Rafraîchir
        </button>
      </div>

      <div v-if="updateMessage" class="mb-4 p-3 bg-blue-900/50 text-blue-300 border border-blue-700 rounded-lg text-sm flex items-center">
        <span class="mr-2 animate-spin">⏳</span>
        {{ updateMessage }}
      </div>

      <div v-if="loading" class="animate-pulse space-y-3">
        <div class="h-20 bg-slate-800 rounded-xl"></div>
        <div class="h-20 bg-slate-800 rounded-xl"></div>
      </div>
      <div v-else class="space-y-4">
        <div v-for="container in containers" :key="container.id" 
             class="bg-slate-800 rounded-xl border shadow-md transition-all overflow-hidden"
             :class="container.hasUpdate ? (container.isBreaking ? 'border-red-500/50' : 'border-blue-500/50') : 'border-slate-700'">
          
          <div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-slate-100 flex items-center gap-2">
                {{ container.name }}
                <span v-if="container.hasUpdate" class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full" 
                      :class="container.isBreaking ? 'bg-red-900/80 text-red-300' : 'bg-blue-900/80 text-blue-300'">
                  Maj dispo
                </span>
                <span v-else class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                  À jour
                </span>
              </h3>
              <div class="text-xs text-slate-400 mt-2 flex flex-col gap-1">
                <span><span class="opacity-70">Image:</span> {{ container.image }}</span>
                <span><span class="opacity-70">Actuel:</span> {{ container.currentVersion }}</span>
                <span v-if="container.hasUpdate" class="text-blue-300"><span class="opacity-70">Nouveau:</span> {{ container.newVersion }}</span>
              </div>
            </div>
            
            <div class="flex-shrink-0">
              <button 
                v-if="container.hasUpdate"
                @click="applyUpdate(container)"
                :disabled="updatingContainer === container.name"
                class="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg shadow transition-all disabled:opacity-50"
                :class="container.isBreaking ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'"
              >
                {{ updatingContainer === container.name ? 'En cours...' : 'Mettre à jour' }}
              </button>
            </div>
          </div>

          <!-- Section Changelog (si mise à jour dispo) -->
          <div v-if="container.hasUpdate" class="border-t border-slate-700 bg-slate-900/50 p-4">
            <div v-if="container.isBreaking" class="mb-3 text-xs font-bold text-red-400 flex items-center bg-red-950/30 p-2 rounded border border-red-900/50">
              ⚠️ BREAKING CHANGES DÉTECTÉS
            </div>
            <details class="text-xs text-slate-300">
              <summary class="cursor-pointer font-medium text-slate-400 hover:text-slate-200">Voir les notes de mise à jour (Changelog)</summary>
              <div v-if="container.changelog" class="mt-2 p-3 bg-slate-950 rounded overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                {{ container.changelog }}
              </div>
              <div v-else class="mt-2 text-slate-500 italic">
                Aucune note de mise à jour (Release) publique trouvée sur GitHub pour cette image. Lisez attentivement la documentation officielle avant de procéder.
              </div>
            </details>
          </div>
        </div>
        
        <div v-if="containers.length === 0" class="text-center py-8 text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
          Aucun conteneur trouvé.
        </div>
      </div>
    </section>
  </div>
</template>
