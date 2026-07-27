<script setup>
import { ref } from 'vue';

const props = defineProps({
  token: { type: String, required: true }
});

const emit = defineEmits(['reset-success', 'go-login']);
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

const API_BASE = '/api';

const handleReset = async () => {
  error.value = '';
  
  if (password.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas.';
    return;
  }
  
  loading.value = true;
  
  try {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: props.token, newPassword: password.value })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || "Erreur de réinitialisation");
    }
    
    emit('reset-success', data.message);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
    <h1 class="text-2xl font-bold text-slate-100 mb-2 text-center flex items-center justify-center">
      <span class="mr-2">🔑</span> Nouveau mot de passe
    </h1>
    <p class="text-slate-400 text-sm text-center mb-6">Définissez votre nouveau mot de passe administrateur.</p>
    
    <div v-if="error" class="mb-4 bg-red-900/50 text-red-200 p-3 rounded-lg border border-red-700 text-sm">
      {{ error }}
    </div>

    <form @submit.prevent="handleReset" class="space-y-4">
      <div>
        <label class="block text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Nouveau mot de passe</label>
        <input 
          v-model="password" 
          type="password" 
          class="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
          minlength="6"
        >
      </div>
      <div>
        <label class="block text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Confirmer le mot de passe</label>
        <input 
          v-model="confirmPassword" 
          type="password" 
          class="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
          minlength="6"
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 mt-2">
        <span v-if="loading">Validation...</span>
        <span v-else>Valider</span>
      </button>
    </form>
    
    <div class="mt-6 text-center">
      <a href="#" @click.prevent="$emit('go-login')" class="text-sm text-slate-400 hover:text-slate-200 transition-colors">
        ← Retour à la connexion
      </a>
    </div>
  </div>
</template>
