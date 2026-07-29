<script setup>
import { ref, onMounted } from 'vue';

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
  update_cron_schedule: '0 9 * * *',
  ai_enabled: 'false',
  ai_engine: 'ollama',
  ai_url: 'http://host.docker.internal:11434',
  ai_api_key: '',
  ai_model: 'mistral'
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
  <div class="p-4 space-y-6">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">⚙️</span> Paramètres Généraux
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Configurez le comportement global de l'application.</p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl p-6">
      <form @submit.prevent="saveSettings" class="space-y-6">
        
        <!-- Section Notifications -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center">
            <span class="mr-2">💬</span> Notifications
          </h3>
          
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
                  class="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all whitespace-nowrap"
                >
                  <span v-if="isTestingWebhook" class="animate-pulse">Test en cours...</span>
                  <span v-else>Tester 🚀</span>
                </button>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">L'orchestrateur enverra un message à cette URL après chaque tâche de sauvegarde et vérification de MAJ.</p>
            </div>
        </div>

        <!-- Section Planification -->
        <div class="space-y-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700/50">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center">
            <span class="mr-2">⏱️</span> Planification
          </h3>
          
          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Vérification automatique des Mises à jour (CRON)</label>
            <input 
              v-model="form.update_cron_schedule" 
              type="text" 
              placeholder="0 9 * * *" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all font-mono"
            />
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Par défaut : <code>0 9 * * *</code> (Tous les jours à 09h00).</p>
          </div>
        </div>

        <!-- Section IA (AIOps) -->
        <div class="space-y-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700/50">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center">
            <span class="mr-2">🤖</span> Intelligence Artificielle (AIOps)
          </h3>
          <div class="space-y-4">
            <div class="flex items-center bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
              <input type="checkbox" id="ai_enabled" v-model="form.ai_enabled" true-value="true" false-value="false" class="mr-3 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
              <label for="ai_enabled" class="text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">Activer la surveillance et l'analyse des logs d'erreurs par l'IA</label>
            </div>
            
            <div v-if="form.ai_enabled === 'true'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Moteur IA</label>
                <select v-model="form.ai_engine" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none">
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">URL (Ollama/Custom)</label>
                <input v-model="form.ai_url" type="url" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
                <p class="text-[10px] text-slate-400 mt-1">Défaut Docker: http://host.docker.internal:11434</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Modèle</label>
                <input v-model="form.ai_model" type="text" placeholder="mistral" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
              </div>

              <div v-if="form.ai_engine === 'openai'">
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Clé API (OpenAI)</label>
                <input v-model="form.ai_api_key" type="password" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
              </div>
            </div>
          </div>
        </div>

        <!-- Section Utilisateurs -->
        <div class="space-y-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700/50">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center">
            <span class="mr-2">👥</span> Gestion des Utilisateurs
          </h3>
          
          <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
            <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead class="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Email</th>
                  <th class="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                <tr v-for="u in users" :key="u.id" class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                  <td class="px-4 py-3">{{ u.email }}</td>
                  <td class="px-4 py-3 text-right">
                    <button type="button" @click="handleDeleteUser(u.id, u.email)" class="text-red-400 hover:text-red-300 transition-colors">Supprimer</button>
                  </td>
                </tr>
                <tr v-if="users.length === 0">
                  <td colspan="2" class="px-4 py-4 text-center text-slate-500">Chargement...</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
            <div class="flex-1 w-full">
              <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nouvel email</label>
              <input v-model="newUserEmail" type="email" placeholder="admin@domaine.com" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div class="flex-1 w-full">
              <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mot de passe</label>
              <input v-model="newUserPassword" type="password" placeholder="••••••••" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <button type="button" @click="handleAddUser" class="w-full md:w-auto bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors border border-slate-300 dark:border-slate-600 md:h-[42px] whitespace-nowrap">
              Ajouter
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-4">
        <button 
          @click="saveSettings" 
          :disabled="isSaving"
          class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-900/20"
        >
          <span v-if="isSaving" class="animate-pulse">Sauvegarde en cours...</span>
          <span v-else>Enregistrer les paramètres globaux</span>
        </button>
      </div>
      </form>
    </div>
  </div>
</template>
