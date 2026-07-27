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

const fetchContainers = async () => {
  try {
    const res = await fetch(`${API_BASE}/docker/containers`, getFetchOptions());
    if (res.ok) {
      containers.value = await res.json();
    }
  } catch (err) {
    console.error("Erreur conteneurs:", err);
  }
};

const applyUpdate = async (containerName) => {
  if (!confirm(`Voulez-vous vraiment lancer la mise à jour de ${containerName} ? L'application va être téléchargée et redémarrée si une nouvelle version est disponible.`)) {
    return;
  }

  updatingContainer.value = containerName;
  updateMessage.value = `Lancement de Watchtower pour ${containerName}... (Cela peut prendre quelques minutes)`;

  try {
    const res = await fetch(`${API_BASE}/updates/docker/apply/${containerName}`, {
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
    fetchContainers();
  }
};

onMounted(async () => {
  await Promise.all([fetchOSUpdates(), fetchContainers()]);
  loading.value = false;
});
</script>

<template>
  <div class="p-4 space-y-6">
    <!-- OS Updates Section -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-100 flex items-center">
        <span class="mr-2">🐧</span> Mises à jour Système (Ubuntu)
      </h2>
      <div class="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
        <div v-if="loading" class="animate-pulse flex space-x-4">
          <div class="h-4 bg-slate-700 rounded w-3/4"></div>
        </div>
        <div v-else>
          <div v-if="osUpdates.supported && osUpdates.available" class="text-slate-300 font-mono text-sm whitespace-pre-wrap bg-[#0d1117] p-4 rounded-lg">
            {{ osUpdates.rawText }}
          </div>
          <div v-else-if="!osUpdates.supported || !osUpdates.available" class="text-slate-400 text-sm">
            {{ osUpdates.rawText || "Aucune mise à jour détectée ou fichier de suivi non monté." }}
          </div>
        </div>
      </div>
    </section>

    <!-- Docker Updates Section -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-100 flex items-center">
        <span class="mr-2">🐳</span> Mises à jour Conteneurs
      </h2>
      <p class="text-xs text-slate-400 mb-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
        Cliquez sur "Mettre à jour" pour forcer le téléchargement de la dernière version de l'image (si disponible) et recréer le conteneur automatiquement.
      </p>

      <div v-if="updateMessage" class="mb-4 p-3 bg-blue-900/50 text-blue-300 border border-blue-700 rounded-lg text-sm flex items-center">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ updateMessage }}
      </div>

      <div v-if="loading" class="animate-pulse space-y-3">
        <div class="h-16 bg-slate-800 rounded-xl"></div>
        <div class="h-16 bg-slate-800 rounded-xl"></div>
      </div>
      <div v-else class="space-y-3">
        <div v-for="container in containers" :key="container.id" 
             class="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-md flex justify-between items-center transition-all hover:border-slate-600">
          <div class="flex-1 min-w-0 pr-4">
            <h3 class="text-base font-semibold text-slate-100 truncate flex items-center gap-2">
              {{ container.name }}
            </h3>
            <p class="text-xs text-slate-400 mt-1 truncate">{{ container.image }}</p>
          </div>
          <div>
            <button 
              @click="applyUpdate(container.name)"
              :disabled="updatingContainer === container.name || container.name === 'gestion_serveur'"
              class="px-4 py-2 bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-400 hover:to-teal-400 text-white text-sm font-medium rounded-lg shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="updatingContainer === container.name">En cours...</span>
              <span v-else>Mettre à jour</span>
            </button>
          </div>
        </div>
        
        <div v-if="containers.length === 0" class="text-center py-8 text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
          Aucun conteneur trouvé.
        </div>
      </div>
    </section>
  </div>
</template>
