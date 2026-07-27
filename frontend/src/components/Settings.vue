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

        <!-- Section Utilisateurs -->
        <div class="space-y-4 pt-4 mt-4 border-t border-slate-700/50">
          <h3 class="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2 flex items-center">
            <span class="mr-2">👥</span> Gestion des Utilisateurs
          </h3>
          
          <div class="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden mb-4">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="bg-slate-800 text-slate-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Email</th>
                  <th class="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700">
                <tr v-for="u in users" :key="u.id" class="hover:bg-slate-800/50 transition-colors">
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

          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
            <div class="flex-1 w-full">
              <label class="block text-xs font-medium text-slate-400 mb-1">Nouvel email</label>
              <input v-model="newUserEmail" type="email" placeholder="admin@domaine.com" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div class="flex-1 w-full">
              <label class="block text-xs font-medium text-slate-400 mb-1">Mot de passe</label>
              <input v-model="newUserPassword" type="password" placeholder="••••••••" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <button type="button" @click="handleAddUser" class="w-full md:w-auto bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors border border-slate-600 md:h-[42px] whitespace-nowrap">
              Ajouter
            </button>
          </div>
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
