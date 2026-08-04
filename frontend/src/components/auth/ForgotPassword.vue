<script setup>
import { ref } from 'vue';

const emit = defineEmits(['go-login']);
const email = ref('');
const error = ref('');
const success = ref('');
const loading = ref(false);

const API_BASE = '/api';

const handleForgot = async () => {
  error.value = '';
  success.value = '';
  loading.value = true;
  
  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de la demande");
    }
    
    success.value = data.message;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl relative overflow-hidden">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 text-center flex items-center justify-center">
      <span class="mr-2">📧</span> Mot de passe oublié
    </h1>
    <p class="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">Saisissez votre email pour recevoir un lien de réinitialisation.</p>
    
    <div v-if="error" class="mb-4 bg-red-900/50 text-red-200 p-3 rounded-lg border border-red-700 text-sm">
      {{ error }}
    </div>
    
    <div v-if="success" class="mb-4 bg-emerald-900/50 text-emerald-200 p-3 rounded-lg border border-emerald-700 text-sm">
      {{ success }}
    </div>

    <form @submit.prevent="handleForgot" class="space-y-4" v-if="!success">
      <div>
        <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Adresse Email</label>
        <input 
          v-model="email" 
          type="email" 
          placeholder="admin@domaine.com"
          class="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 rounded-lg transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20 mt-2">
        <span v-if="loading">Envoi en cours...</span>
        <span v-else>Envoyer le lien</span>
      </button>
    </form>
    
    <div class="mt-6 text-center">
      <a href="#" @click.prevent="$emit('go-login')" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-200 transition-colors">
        ← Retour à la connexion
      </a>
    </div>
  </div>
</template>
