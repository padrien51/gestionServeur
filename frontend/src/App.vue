<script setup>
import { ref, onMounted } from 'vue';
import Dashboard from './components/Dashboard.vue';
import Updates from './components/Updates.vue';
import Backups from './components/Backups.vue';
import Settings from './components/Settings.vue';
import Optimization from './components/Optimization.vue';
import Networks from './components/Networks.vue';
import Profile from './components/Profile.vue';
import AppModal from './components/AppModal.vue';

// Vues d'authentification
import Setup from './components/auth/Setup.vue';
import Login from './components/auth/Login.vue';
import ForgotPassword from './components/auth/ForgotPassword.vue';
import ResetPassword from './components/auth/ResetPassword.vue';

import { useTheme } from './composables/useTheme';

const currentTab = ref('dashboard');
const authState = ref('loading'); // 'loading', 'setup', 'login', 'forgot', 'reset', 'authenticated'
const resetToken = ref('');

const API_BASE = '/api';

const { isDarkMode, toggleTheme, initTheme } = useTheme();

onMounted(async () => {
  initTheme();
  
  // Intercepteur global Fetch pour gérer l'expiration de session (401)
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 && authState.value === 'authenticated') {
      logout();
    }
    return response;
  };

  // Check url parameters for reset token
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('reset')) {
    resetToken.value = urlParams.get('reset');
    authState.value = 'reset';
    return;
  }

  // Si on a déjà un token, on le valide auprès de l'API
  const token = localStorage.getItem('auth_token');
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        authState.value = 'authenticated';
        return;
      } else {
        // Token invalide ou expiré (le backend a renvoyé 401)
        localStorage.removeItem('auth_token');
      }
    } catch (e) {
      console.warn("Erreur réseau lors de la validation du token", e);
      // En cas de coupure réseau temporaire, on garde l'état connecté
      authState.value = 'authenticated';
      return;
    }
  }

  // Vérifier si le système a besoin d'être initialisé (aucun compte)
  try {
    const res = await fetch(`${API_BASE}/auth/status`);
    if (res.ok) {
      const data = await res.json();
      if (data.setupNeeded) {
        authState.value = 'setup';
        return;
      }
    }
  } catch (e) {
    console.error("Impossible de vérifier le statut de configuration", e);
  }

  authState.value = 'login';
});

const onLoginSuccess = () => {
  authState.value = 'authenticated';
  window.history.replaceState({}, document.title, "/"); // Nettoyer l'URL
};

const onSetupComplete = () => {
  authState.value = 'login';
};

const logout = () => {
  localStorage.removeItem('auth_token');
  authState.value = 'login';
};
</script>

<template>
  <div v-if="authState !== 'authenticated'" class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
    <div v-if="authState === 'loading'" class="text-slate-500 dark:text-slate-400 animate-pulse text-lg">
      Chargement...
    </div>
    
    <Setup 
      v-else-if="authState === 'setup'" 
      @setup-complete="onSetupComplete"
    />
    
    <Login 
      v-else-if="authState === 'login'" 
      @login-success="onLoginSuccess"
      @go-forgot-password="authState = 'forgot'"
    />
    
    <ForgotPassword 
      v-else-if="authState === 'forgot'"
      @go-login="authState = 'login'"
    />
    
    <ResetPassword 
      v-else-if="authState === 'reset'"
      :token="resetToken"
      @reset-success="authState = 'login'"
      @go-login="authState = 'login'"
    />
  </div>

  <div v-else class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col font-sans">
    <!-- En-tête -->
    <header class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-20 shadow-sm">
      <div class="max-w-6xl mx-auto flex justify-between items-center gap-4">
        <h1 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center">
          <span class="mr-2 text-2xl">🎛️</span> <span class="hidden xs:inline sm:inline">Gestion Serveur</span>
        </h1>
        
        <!-- Navigation Desktop -->
        <nav class="hidden sm:flex space-x-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <button @click="currentTab = 'dashboard'" :class="currentTab === 'dashboard' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Dashboard</button>
          <button @click="currentTab = 'networks'" :class="currentTab === 'networks' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Réseaux</button>
          <button @click="currentTab = 'optimization'" :class="currentTab === 'optimization' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Optimisation</button>
          <button @click="currentTab = 'updates'" :class="currentTab === 'updates' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Mises à jour</button>
          <button @click="currentTab = 'backups'" :class="currentTab === 'backups' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Sauvegardes</button>
          <button @click="currentTab = 'settings'" :class="currentTab === 'settings' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap">Paramètres</button>
        </nav>
        
        <!-- Actions Rapides (Thème/Profil/Déconnexion) -->
        <div class="flex items-center bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 ml-auto sm:ml-0 shadow-sm">
          <button @click="toggleTheme" class="p-1.5 sm:p-2 rounded-md text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-all" title="Changer de thème">
            <svg v-if="isDarkMode" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 4.22a1 1 0 011.415 0l.707.707a1 1 0 01-1.414 1.414l-.708-.707a1 1 0 010-1.414zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-4.22 4.22a1 1 0 010 1.415l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.22-4.22a1 1 0 01-1.415 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm4.22-4.22a1 1 0 010-1.415l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414 0zM10 5a5 5 0 100 10 5 5 0 000-10z" clip-rule="evenodd" />
            </svg>
          </button>
          <button @click="currentTab = 'profile'" :class="currentTab === 'profile' ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'" class="p-1.5 sm:p-2 ml-1 rounded-md text-sm transition-all" title="Mon Compte">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
            </svg>
          </button>
          <button @click="logout" class="p-1.5 sm:p-2 ml-1 rounded-md text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all border border-transparent hover:border-red-200 dark:hover:border-red-800/50" title="Déconnexion">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Contenu Principal -->
      <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 flex-grow w-full h-full relative">
        <transition name="fade" mode="out-in">
        <Dashboard v-if="currentTab === 'dashboard'" />
        <Networks v-if="currentTab === 'networks'" />
        <Optimization v-if="currentTab === 'optimization'" />
        <Updates v-else-if="currentTab === 'updates'" />
        <Backups v-else-if="currentTab === 'backups'" />
        <Settings v-else-if="currentTab === 'settings'" />
        <Profile v-else-if="currentTab === 'profile'" />
      </transition>
      </main>
    
    <!-- Modale Globale -->
    <AppModal />
    
    <!-- Navigation Mobile (Bottom Bar) -->
    <nav class="sm:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-around items-center pb-safe z-40 px-2 py-2 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <button @click="currentTab = 'dashboard'" class="flex flex-col items-center p-1.5 rounded-lg w-full transition-all" :class="currentTab === 'dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'">
        <svg class="w-6 h-6 mb-1" :class="currentTab === 'dashboard' ? 'stroke-2' : 'stroke-[1.5]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
        <span class="text-[10px] font-medium">Tableau</span>
      </button>
      
      <button @click="currentTab = 'optimization'" class="flex flex-col items-center p-1.5 rounded-lg w-full transition-all" :class="currentTab === 'optimization' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'">
        <svg class="w-6 h-6 mb-1" :class="currentTab === 'optimization' ? 'stroke-2' : 'stroke-[1.5]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
        <span class="text-[10px] font-medium">Opti</span>
      </button>

      <button @click="currentTab = 'updates'" class="flex flex-col items-center p-1.5 rounded-lg w-full transition-all" :class="currentTab === 'updates' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'">
        <svg class="w-6 h-6 mb-1" :class="currentTab === 'updates' ? 'stroke-2' : 'stroke-[1.5]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        <span class="text-[10px] font-medium">MAJ</span>
      </button>

      <button @click="currentTab = 'backups'" class="flex flex-col items-center p-1.5 rounded-lg w-full transition-all" :class="currentTab === 'backups' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'">
        <svg class="w-6 h-6 mb-1" :class="currentTab === 'backups' ? 'stroke-2' : 'stroke-[1.5]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
        <span class="text-[10px] font-medium">Backups</span>
      </button>

      <button @click="currentTab = 'settings'" class="flex flex-col items-center p-1.5 rounded-lg w-full transition-all" :class="currentTab === 'settings' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'">
        <svg class="w-6 h-6 mb-1" :class="currentTab === 'settings' ? 'stroke-2' : 'stroke-[1.5]'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        <span class="text-[10px] font-medium">Réglages</span>
      </button>
    </nav>
  </div>
</template>

<style>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
