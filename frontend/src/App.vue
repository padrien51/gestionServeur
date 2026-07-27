<script setup>
import { ref, onMounted } from 'vue';
import Dashboard from './components/Dashboard.vue';
import Updates from './components/Updates.vue';
import Backups from './components/Backups.vue';
import Settings from './components/Settings.vue';
import Profile from './components/Profile.vue';
import AppModal from './components/AppModal.vue';

// Vues d'authentification
import Setup from './components/auth/Setup.vue';
import Login from './components/auth/Login.vue';
import ForgotPassword from './components/auth/ForgotPassword.vue';
import ResetPassword from './components/auth/ResetPassword.vue';

const currentTab = ref('dashboard');
const authState = ref('loading'); // 'loading', 'setup', 'login', 'forgot', 'reset', 'authenticated'
const resetToken = ref('');

const API_BASE = '/api';

onMounted(async () => {
  // Check url parameters for reset token
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('reset')) {
    resetToken.value = urlParams.get('reset');
    authState.value = 'reset';
    return;
  }

  // Si on a déjà un token, on suppose qu'on est connecté (s'il est invalide, les API renverront 401)
  if (localStorage.getItem('auth_token')) {
    authState.value = 'authenticated';
    return;
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
  <div v-if="authState !== 'authenticated'" class="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div v-if="authState === 'loading'" class="text-slate-400 animate-pulse text-lg">
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

  <div v-else class="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
    <!-- En-tête -->
    <header class="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 shadow-sm">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center">
          <span class="mr-2 text-2xl">🎛️</span> Gestion Serveur
        </h1>
        
        <!-- Navigation -->
        <nav class="flex space-x-1 bg-slate-800 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
          <button @click="currentTab = 'dashboard'" :class="currentTab === 'dashboard' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'" class="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap">Dashboard</button>
          <button @click="currentTab = 'updates'" :class="currentTab === 'updates' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'" class="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap">Mises à jour</button>
          <button @click="currentTab = 'backups'" :class="currentTab === 'backups' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'" class="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap">Sauvegardes</button>
          <button @click="currentTab = 'settings'" :class="currentTab === 'settings' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'" class="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap">Paramètres</button>
          
          <div class="flex items-center ml-auto sm:ml-2 pl-2 sm:pl-2 border-l border-slate-700">
            <button @click="currentTab = 'profile'" :class="currentTab === 'profile' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'" class="p-2 mr-1 rounded-md text-sm transition-all" title="Mon Compte">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
              </svg>
            </button>
            <button @click="logout" class="p-2 rounded-md text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-all border border-transparent hover:border-red-800/50" title="Déconnexion">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </nav>
      </div>
    </header>

    <!-- Contenu Principal -->
    <main class="flex-1 max-w-6xl mx-auto w-full p-2 sm:p-6 pb-20">
      <transition name="fade" mode="out-in">
        <Dashboard v-if="currentTab === 'dashboard'" />
        <Updates v-else-if="currentTab === 'updates'" />
        <Backups v-else-if="currentTab === 'backups'" />
        <Settings v-else-if="currentTab === 'settings'" />
        <Profile v-else-if="currentTab === 'profile'" />
      </transition>
    </main>
    
    <!-- Modale Globale -->
    <AppModal />
  </div>
</template>

<style>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
