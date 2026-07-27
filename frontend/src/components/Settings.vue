<script setup>
import { ref, onMounted } from 'vue';

import { useModal } from '../composables/useModal';

const { showAlert } = useModal();

const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: {
    'Content-Type': 'application/json',
    'x-api-password': localStorage.getItem('app_pwd') || ''
  }
});

const form = ref({
  mattermost_webhook_url: ''
});

const isSaving = ref(false);
const saveSuccess = ref(false);

const loadSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/settings`, { headers: getFetchOptions().headers });
    if (res.ok) {
      const data = await res.json();
      form.value = { ...form.value, ...data };
    }
  } catch (e) {
    console.error("Erreur de chargement des paramètres:", e);
  }
};

const saveSettings = async () => {
  isSaving.value = true;
  saveSuccess.value = false;
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      ...getFetchOptions(),
      body: JSON.stringify(form.value)
    });
    
    if (!res.ok) throw new Error("Erreur de sauvegarde");
    
    saveSuccess.value = true;
    setTimeout(() => saveSuccess.value = false, 3000);
  } catch (e) {
    showAlert("Erreur", e.message);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <div class="p-4 space-y-6">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-100 flex items-center">
        <span class="mr-2">⚙️</span> Paramètres Généraux
      </h2>
      <p class="text-slate-400 text-sm mt-1">Configurez le comportement global de l'application.</p>
    </div>

    <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl p-6">
      <form @submit.prevent="saveSettings" class="space-y-6">
        
        <!-- Section Notifications -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2 flex items-center">
            <span class="mr-2">💬</span> Notifications
          </h3>
          
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">URL du Webhook Mattermost</label>
            <input 
              v-model="form.mattermost_webhook_url" 
              type="url" 
              placeholder="https://mattermost.mon-domaine.com/hooks/xyz..." 
              class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
            <p class="text-xs text-slate-400 mt-2">L'orchestrateur enverra un message à cette URL après chaque tâche de sauvegarde.</p>
          </div>
        </div>

        <!-- Section Sécurité (Exemple) -->
        <div class="space-y-4 pt-4 mt-4 border-t border-slate-700/50">
          <h3 class="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2 flex items-center">
            <span class="mr-2">🔒</span> Sécurité
          </h3>
          <p class="text-sm text-slate-400 italic">Le mot de passe de l'application est géré via la variable d'environnement APP_PASSWORD dans le fichier docker-compose.yml.</p>
        </div>

        <div class="flex justify-end pt-4">
          <button 
            type="submit" 
            :disabled="isSaving"
            class="flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/50 transition-all disabled:opacity-50"
          >
            <span v-if="isSaving" class="mr-2 animate-spin">⏳</span>
            {{ isSaving ? 'Enregistrement...' : 'Enregistrer les paramètres' }}
          </button>
        </div>
        
        <div v-if="saveSuccess" class="p-3 bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 rounded-xl text-sm font-medium flex items-center justify-center transition-all animate-pulse">
          ✅ Paramètres sauvegardés avec succès !
        </div>
      </form>
    </div>
  </div>
</template>
