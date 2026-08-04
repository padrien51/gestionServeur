<script setup>
import { ref } from 'vue';

const emit = defineEmits(['login-success', 'go-forgot-password']);
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const requires2FA = ref(false);
const tempToken = ref('');
const twoFACode = ref('');

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
    
    if (data.requires2FA) {
      requires2FA.value = true;
      tempToken.value = data.tempToken;
      return;
    }
    
    // On sauvegarde le token JWT
    localStorage.setItem('auth_token', data.token);
    
    emit('login-success');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const handle2FALogin = async () => {
  error.value = '';
  loading.value = true;
  
  try {
    const res = await fetch(`${API_BASE}/auth/login-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: tempToken.value, tokenCode: twoFACode.value })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Code incorrect");
    
    localStorage.setItem('auth_token', data.token);
    emit('login-success');
  } catch(err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl relative overflow-hidden">
    <!-- Déco -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-emerald-500"></div>

    <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6 text-center flex items-center justify-center">
      <span class="mr-3 text-3xl">🛡️</span> Accès Restreint
    </h1>
    
    <div v-if="error" class="mb-4 bg-red-900/50 text-red-200 p-3 rounded-lg border border-red-700 text-sm animate-pulse">
      {{ error }}
    </div>

    <form v-if="!requires2FA" @submit.prevent="handleLogin" class="space-y-4">
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
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Mot de passe</label>
          <a href="#" @click.prevent="$emit('go-forgot-password')" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">Oublié ?</a>
        </div>
        <input 
          v-model="password" 
          type="password" 
          placeholder="••••••••"
          class="w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 rounded-lg transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20 mt-2">
        <span v-if="loading">Vérification...</span>
        <span v-else>Déverrouiller l'accès</span>
      </button>
    </form>
    
    <form v-else @submit.prevent="handle2FALogin" class="space-y-4">
      <div class="text-center mb-4 text-sm text-slate-600 dark:text-slate-400">
        La double authentification est activée sur ce compte.
      </div>
      <div>
        <label class="block text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide text-center">Code de sécurité (A2F)</label>
        <input 
          v-model="twoFACode" 
          type="text" 
          placeholder="123456"
          class="w-full bg-white dark:bg-slate-800 text-center text-3xl tracking-widest text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 rounded-lg p-4 focus:outline-none focus:border-blue-500 transition-colors"
          required
        >
      </div>
      <button type="submit" :disabled="loading" class="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 rounded-lg transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20 mt-2">
        <span v-if="loading">Vérification...</span>
        <span v-else>Valider</span>
      </button>
      <div class="text-center mt-4">
        <button type="button" @click="requires2FA = false; twoFACode = ''" class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">Annuler</button>
      </div>
    </form>
  </div>
</template>
