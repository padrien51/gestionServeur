<script setup>
import { ref, onMounted, watch } from 'vue';

import { useModal } from '../composables/useModal';

const { showAlert, showConfirm } = useModal();

const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
  }
});

const form = ref({
  mattermost_webhook_url: '',
  notify_backups: 'true',
  notify_updates: 'true',
  notify_ai_alerts: 'true',
  update_cron_schedule: '0 9 * * *',
  ai_enabled: 'false',
  ai_engine: 'ollama',
  ai_url: 'http://host.docker.internal:11434',
  ai_api_key: '',
  ai_model: 'mistral'
});

const isSaving = ref(false);
const saveSuccess = ref(false);

const cronMode = ref('simple');
const cronTime = ref('09:00');
const cronDays = ref([]); 

const parseCronToUI = (cronStr) => {
  try {
    const parts = (cronStr || '0 9 * * *').split(' ').filter(Boolean);
    if (parts.length === 5 && parts[2] === '*' && parts[3] === '*') {
      const min = parts[0] === '*' ? '00' : parts[0].padStart(2, '0');
      const hr = parts[1] === '*' ? '00' : parts[1].padStart(2, '0');
      if (!isNaN(min) && !isNaN(hr)) {
        cronTime.value = `${hr}:${min}`;
        if (parts[4] === '*') {
          cronDays.value = [];
        } else {
          cronDays.value = parts[4].split(',').map(Number);
        }
        cronMode.value = 'simple';
        return;
      }
    }
  } catch(e) {}
  cronMode.value = 'advanced';
};

watch([cronTime, cronDays], () => {
  if (cronMode.value === 'simple') {
    const [hr, min] = (cronTime.value || '09:00').split(':');
    const d = (cronDays.value.length === 0 || cronDays.value.length === 7) ? '*' : [...cronDays.value].sort().join(',');
    form.value.update_cron_schedule = `${parseInt(min||0)} ${parseInt(hr||0)} * * ${d}`;
  }
}, { deep: true });

const toggleDay = (v) => {
  if (cronDays.value.length === 0) {
    cronDays.value = [v];
  } else {
    const idx = cronDays.value.indexOf(v);
    if (idx >= 0) cronDays.value.splice(idx, 1);
    else cronDays.value.push(v);
  }
};

const loadSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/settings`, { headers: getFetchOptions().headers });
    if (res.ok) {
      const data = await res.json();
      form.value = { ...form.value, ...data };
      parseCronToUI(form.value.update_cron_schedule);
    }
  } catch (e) {
    console.error("Erreur de chargement des paramètres:", e);
  }
};

const saveSettings = async () => {
  isSaving.value = true;
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      ...getFetchOptions(),
      body: JSON.stringify(form.value)
    });
    if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
    showAlert("Succès", "Paramètres sauvegardés avec succès");
  } catch (e) {
    console.error(e);
    showAlert("Erreur", "Impossible de sauvegarder les paramètres");
  } finally {
    isSaving.value = false;
  }
};

const isTestingWebhook = ref(false);

const testWebhook = async () => {
  if (!form.value.mattermost_webhook_url) {
    return showAlert("Erreur", "Veuillez d'abord saisir une URL de webhook.");
  }
  
  isTestingWebhook.value = true;
  try {
    const res = await fetch(`${API_BASE}/settings/test-webhook`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ webhookUrl: form.value.mattermost_webhook_url })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du test du webhook");
    
    showAlert("Succès", "Le webhook de test a été envoyé avec succès !");
  } catch (e) {
    console.error(e);
    showAlert("Erreur", e.message);
  } finally {
    isTestingWebhook.value = false;
  }
};

const users = ref([]);
const newUserEmail = ref('');
const newUserPassword = ref('');

const loadUsers = async () => {
  try {
    const res = await fetch(`${API_BASE}/users`, { headers: getFetchOptions().headers });
    if (res.ok) {
      users.value = await res.json();
    }
  } catch(e) {
    console.error(e);
  }
}

const handleAddUser = async () => {
  if (!newUserEmail.value || !newUserPassword.value) {
    return showAlert("Erreur", "Veuillez remplir l'email et le mot de passe");
  }
  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ email: newUserEmail.value, password: newUserPassword.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'ajout de l'utilisateur");
    showAlert("Succès", data.message);
    newUserEmail.value = '';
    newUserPassword.value = '';
    loadUsers();
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

const handleDeleteUser = async (id, email) => {
  const confirmed = await showConfirm(
    "Supprimer l'utilisateur ?",
    `Êtes-vous sûr de vouloir supprimer ${email} ?`
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      headers: getFetchOptions().headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de suppression");
    showAlert("Succès", "Utilisateur supprimé");
    loadUsers();
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

onMounted(() => {
  loadSettings();
  loadUsers();
});
</script>

<template>
  <!-- pb-28 pour éviter que le contenu soit caché par la sticky bar de sauvegarde + la nav mobile -->
  <div class="p-4 space-y-8 pb-32">
    <div>
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">⚙️</span> Paramètres Généraux
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Configurez le comportement global de l'application.</p>
    </div>

    <form @submit.prevent="saveSettings">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Section Notifications -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm p-6 flex flex-col">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-3 mb-5 flex items-center">
            <span class="mr-2">💬</span> Notifications
          </h3>
          
          <div class="flex-1 space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">URL du Webhook Mattermost</label>
              <div class="flex flex-col sm:flex-row gap-3">
                <input 
                  v-model="form.mattermost_webhook_url" 
                  type="url" 
                  placeholder="https://mattermost.mon-domaine.com/hooks/xyz..." 
                  class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
                />
                <button 
                  @click="testWebhook" 
                  type="button"
                  :disabled="isTestingWebhook || !form.mattermost_webhook_url"
                  class="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-800 dark:text-white font-medium py-3 px-6 rounded-xl transition-all whitespace-nowrap"
                >
                  <span v-if="isTestingWebhook" class="animate-pulse">Test en cours...</span>
                  <span v-else>Tester 🚀</span>
                </button>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">L'orchestrateur enverra un message à cette URL selon vos préférences ci-dessous.</p>
            </div>

            <!-- Options de notifications -->
            <div class="space-y-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Quelles alertes souhaitez-vous recevoir ?</label>
              
              <div class="flex flex-col gap-3">
                <label class="relative inline-flex items-center cursor-pointer group">
                  <input type="checkbox" v-model="form.notify_ai_alerts" true-value="true" false-value="false" class="sr-only peer">
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600 group-hover:bg-slate-300 dark:group-hover:bg-slate-600"></div>
                  <span class="ml-3 text-sm text-slate-700 dark:text-slate-300 select-none">Alerte IA (Problème détecté dans les logs)</span>
                </label>
                
                <label class="relative inline-flex items-center cursor-pointer group">
                  <input type="checkbox" v-model="form.notify_backups" true-value="true" false-value="false" class="sr-only peer">
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600 group-hover:bg-slate-300 dark:group-hover:bg-slate-600"></div>
                  <span class="ml-3 text-sm text-slate-700 dark:text-slate-300 select-none">Rapport de Sauvegarde (Succès / Échec)</span>
                </label>
                
                <label class="relative inline-flex items-center cursor-pointer group">
                  <input type="checkbox" v-model="form.notify_updates" true-value="true" false-value="false" class="sr-only peer">
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600 group-hover:bg-slate-300 dark:group-hover:bg-slate-600"></div>
                  <span class="ml-3 text-sm text-slate-700 dark:text-slate-300 select-none">Alerte de Mise à jour (OS et Conteneurs)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Section Mises à jour -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm p-6 flex flex-col">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-3 mb-5 flex items-center">
            <span class="mr-2">🔄</span> Vérification des mises à jour
          </h3>
          
          <div class="flex-1 space-y-4">
            
            <div class="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-max">
               <button type="button" @click="cronMode = 'simple'" :class="cronMode === 'simple' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Interface Simple</button>
               <button type="button" @click="cronMode = 'advanced'" :class="cronMode === 'advanced' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Mode Avancé</button>
            </div>

            <div v-if="cronMode === 'simple'" class="space-y-5 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Heure d'exécution</label>
                <input type="time" v-model="cronTime" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Jours d'exécution</label>
                <div class="flex flex-wrap gap-2">
                  <button type="button" @click="cronDays = []" class="px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium" :class="cronDays.length === 0 ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
                    Tous les jours
                  </button>
                  <button type="button" v-for="day in [{v:1,l:'Lun'},{v:2,l:'Mar'},{v:3,l:'Mer'},{v:4,l:'Jeu'},{v:5,l:'Ven'},{v:6,l:'Sam'},{v:0,l:'Dim'}]" :key="day.v" 
                         @click="toggleDay(day.v)"
                         class="cursor-pointer select-none px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium"
                         :class="cronDays.length > 0 && cronDays.includes(day.v) ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
                    {{ day.l }}
                  </button>
                </div>
                <p class="text-xs text-slate-500 mt-2 font-mono">Expression finale : <code>{{ form.update_cron_schedule }}</code></p>
              </div>
            </div>

            <div v-else class="space-y-4">
              <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Expression CRON personnalisée</label>
              <input 
                v-model="form.update_cron_schedule" 
                type="text" 
                placeholder="0 9 * * *" 
                class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all font-mono"
              />
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Permet d'utiliser des formats complexes (ex: tous les 1er du mois).</p>
            </div>
          </div>
        </div>

        <!-- Section IA (AIOps) -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm p-6 lg:col-span-2">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-3 mb-5 flex items-center">
            <span class="mr-2">🤖</span> Intelligence Artificielle (AIOps)
          </h3>
          
          <div class="space-y-6">
            <div class="flex items-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40">
              <label class="relative inline-flex items-center cursor-pointer group">
                <input type="checkbox" v-model="form.ai_enabled" true-value="true" false-value="false" class="sr-only peer">
                <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600 group-hover:bg-slate-400 dark:group-hover:bg-slate-600"></div>
                <span class="ml-4 text-sm font-bold text-slate-700 dark:text-slate-200 select-none">Activer la surveillance et l'analyse des logs d'erreurs par l'IA</span>
              </label>
            </div>
            
            <div v-if="form.ai_enabled === 'true'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Moteur IA</label>
                <select v-model="form.ai_engine" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none">
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Modèle</label>
                <input v-model="form.ai_model" type="text" placeholder="mistral" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">URL (Ollama/Custom)</label>
                <input v-model="form.ai_url" type="url" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
                <p class="text-[10px] text-slate-400 mt-1">Défaut Docker: http://host.docker.internal:11434</p>
              </div>

              <div v-if="form.ai_engine === 'openai'" class="md:col-span-2 lg:col-span-3">
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Clé API (OpenAI)</label>
                <input v-model="form.ai_api_key" type="password" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- STICKY ACTION BAR -->
      <div class="fixed bottom-14 sm:bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-4 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div class="max-w-6xl mx-auto flex justify-end">
          <button 
            type="submit" 
            :disabled="isSaving"
            class="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 px-8 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
          >
            <svg v-if="!isSaving" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <span v-if="isSaving" class="animate-pulse">Sauvegarde en cours...</span>
            <span v-else>Enregistrer les paramètres globaux</span>
          </button>
        </div>
      </div>
    </form>

    <div class="mt-12 mb-6">
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">👥</span> Gestion des Utilisateurs
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Gérez les accès à l'interface d'administration.</p>
    </div>

    <!-- Section Utilisateurs -->
    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm p-6">
      <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
        <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead class="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th class="px-5 py-3.5 font-medium">Email</th>
              <th class="px-5 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="u in users" :key="u.id" class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
              <td class="px-5 py-3.5">{{ u.email }}</td>
              <td class="px-5 py-3.5 text-right">
                <button type="button" @click="handleDeleteUser(u.id, u.email)" class="text-red-500 hover:text-red-400 font-medium transition-colors">Supprimer</button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="2" class="px-5 py-6 text-center text-slate-500">Chargement des utilisateurs...</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col md:flex-row gap-5 items-end">
        <div class="flex-1 w-full">
          <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nouvel email</label>
          <input v-model="newUserEmail" type="email" placeholder="admin@domaine.com" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
        </div>
        <div class="flex-1 w-full">
          <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Mot de passe</label>
          <input v-model="newUserPassword" type="password" placeholder="••••••••" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
        </div>
        <button type="button" @click="handleAddUser" class="w-full md:w-auto bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-xl transition-colors md:h-[46px] whitespace-nowrap flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          Ajouter
        </button>
      </div>
    </div>
  </div>
</template>
