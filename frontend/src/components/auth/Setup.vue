<script setup>
import { ref } from 'vue';

const emit = defineEmits(['setup-complete']);
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

const API_BASE = '/api';

const handleSetup = async () => {
  error.value = '';
  
  if (password.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas.';
    return;
  }
  
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de la configuration");
    }
    
    emit('setup-complete', data.message);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 text-center flex flex-col items-center justify-center">
      <span class="mb-2 text-4xl">👋</span> Bienvenue
    </h1>
    <p class="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">Créez le tout premier compte administrateur pour sécuriser l'accès.</p>
    
    <div v-if="error" class="mb-4 bg-red-900/50 text-red-200 p-3 rounded-lg border border-red-700 text-sm">
      {{ error }}
    </div>

    <form @submit.prevent="handleSetup" class="space-y-4">
      <div>
        <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Adresse Email</label>
        <input 
          v-model="email" 
          type="email" 
          class="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <div>
        <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Mot de passe</label>
        <input 
          v-model="password" 
          type="password" 
          class="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
          minlength="6"
        >
      </div>
      <div>
        <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Confirmer le mot de passe</label>
        <input 
          v-model="confirmPassword" 
          type="password" 
          class="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
          minlength="6"
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 font-medium py-3 rounded-lg transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-emerald-900/20 mt-2">
        <span v-if="loading">Création...</span>
        <span v-else>Créer mon compte</span>
      </button>
    </form>
  </div>
</template>
