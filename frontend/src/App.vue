<script setup>
import { ref, onMounted } from 'vue';
import Dashboard from './components/Dashboard.vue';
import Updates from './components/Updates.vue';
import Backups from './components/Backups.vue';
import Settings from './components/Settings.vue';

const currentTab = ref('dashboard');
const isAuth = ref(false);
const pwdInput = ref('');

onMounted(() => {
  if (localStorage.getItem('app_pwd')) {
    isAuth.value = true;
  }
});

const login = () => {
  if (pwdInput.value) {
    localStorage.setItem('app_pwd', pwdInput.value);
    isAuth.value = true;
    window.location.reload();
  }
};

const logout = () => {
  localStorage.removeItem('app_pwd');
  isAuth.value = false;
};
</script>

<template>
  <div v-if="!isAuth" class="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl">
      <h1 class="text-2xl font-bold text-slate-100 mb-6 text-center flex items-center justify-center">
        <span class="mr-3 text-3xl">🛡️</span> Accès Restreint
      </h1>
      <form @submit.prevent="login" class="space-y-4">
        <div>
          <input 
            v-model="pwdInput" 
            type="password" 
            placeholder="Mot de passe système" 
            class="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
            required
          >
        </div>
        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/20">
          Déverrouiller l'accès
        </button>
      </form>
    </div>
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
          <button @click="logout" class="px-4 py-2 rounded-md text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-all whitespace-nowrap ml-auto sm:ml-2 border border-transparent hover:border-red-800/50">Déconnexion</button>
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
      </transition>
    </main>
  </div>
</template>

<style>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
