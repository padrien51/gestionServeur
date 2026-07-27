<script setup>
import { ref } from 'vue';
import { useModal } from '../composables/useModal';

const { showAlert } = useModal();
const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
  }
});

const newEmail = ref('');
const currentPassword = ref('');
const newPassword = ref('');

const handleChangeEmail = async () => {
  if (!newEmail.value) {
    return showAlert("Erreur", "Veuillez entrer une adresse email valide.");
  }
  
  try {
    const res = await fetch(`${API_BASE}/auth/change-email`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ newEmail: newEmail.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du changement d'email");
    showAlert("Succès", "Votre email a été mis à jour avec succès.");
    newEmail.value = '';
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

const handleChangePassword = async () => {
  if (!currentPassword.value || !newPassword.value) {
    return showAlert("Erreur", "Veuillez remplir tous les champs du mot de passe.");
  }
  
  try {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du changement de mot de passe");
    showAlert("Succès", "Votre mot de passe a été mis à jour avec succès.");
    currentPassword.value = '';
    newPassword.value = '';
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};
</script>

<template>
  <div class="p-4 space-y-6">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">👤</span> Mon Compte
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Gérez vos informations personnelles et votre sécurité.</p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl p-6 space-y-8">
      
      <!-- Modifier l'email -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 mb-4 flex items-center">
          <span class="mr-2">📧</span> Changer d'adresse email
        </h3>
        <form @submit.prevent="handleChangeEmail" class="flex flex-col md:flex-row gap-4 items-end">
          <div class="flex-1 w-full">
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nouvelle adresse email</label>
            <input 
              v-model="newEmail" 
              type="email" 
              placeholder="votre.nouvel@email.com" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <button type="submit" class="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-all h-[50px] shadow-lg shadow-blue-900/20">
            Mettre à jour
          </button>
        </form>
      </div>

      <!-- Modifier le mot de passe -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 mb-4 flex items-center">
          <span class="mr-2">🔑</span> Changer de mot de passe
        </h3>
        <form @submit.prevent="handleChangePassword" class="space-y-4 max-w-md">
          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Mot de passe actuel</label>
            <input 
              v-model="currentPassword" 
              type="password" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nouveau mot de passe</label>
            <input 
              v-model="newPassword" 
              type="password" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <div class="pt-2">
            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20">
              Modifier le mot de passe
            </button>
          </div>
        </form>
      </div>

    </div>
  </div>
</template>
