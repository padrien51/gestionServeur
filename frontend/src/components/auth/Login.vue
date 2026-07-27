<script setup>
import { ref } from 'vue';

const emit = defineEmits(['login-success', 'go-forgot-password']);
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const API_BASE = '/api';

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || "Identifiants incorrects");
    }
    
    // On sauvegarde le token JWT
    localStorage.setItem('auth_token', data.token);
    // On conserve également app_pwd vide si jamais du vieux code s'en sert, mais il vaut mieux l'enlever
    localStorage.removeItem('app_pwd');
    
    emit('login-success');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
    <!-- Déco -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-emerald-500"></div>

    <h1 class="text-2xl font-bold text-slate-100 mb-6 text-center flex items-center justify-center">
      <span class="mr-3 text-3xl">🛡️</span> Accès Restreint
    </h1>
    
    <div v-if="error" class="mb-4 bg-red-900/50 text-red-200 p-3 rounded-lg border border-red-700 text-sm animate-pulse">
      {{ error }}
    </div>

    <form @submit.prevent="handleLogin" class="space-y-4">
      <div>
        <label class="block text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">Adresse Email</label>
        <input 
          v-model="email" 
          type="email" 
          placeholder="admin@domaine.com"
          class="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="block text-slate-400 text-xs font-medium uppercase tracking-wide">Mot de passe</label>
          <a href="#" @click.prevent="$emit('go-forgot-password')" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">Oublié ?</a>
        </div>
        <input 
          v-model="password" 
          type="password" 
          placeholder="••••••••"
          class="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/20 mt-2">
        <span v-if="loading">Vérification...</span>
        <span v-else>Déverrouiller l'accès</span>
      </button>
    </form>
  </div>
</template>
