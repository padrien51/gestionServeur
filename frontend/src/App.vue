<script setup>
import { ref, onMounted } from 'vue';
import Dashboard from './components/Dashboard.vue';
import Updates from './components/Updates.vue';

const isAuthenticated = ref(false);
const passwordInput = ref('');

onMounted(() => {
  if (localStorage.getItem('app_pwd')) {
    isAuthenticated.value = true;
  }
});

const login = () => {
  if (passwordInput.value) {
    localStorage.setItem('app_pwd', passwordInput.value);
    isAuthenticated.value = true;
    window.location.reload(); // Pour forcer le rechargement des requêtes initiales
  }
};
// Placeholder components for other tabs
const Backups = { template: '<div class="p-4"><h2 class="text-xl font-bold mb-4">Sauvegardes</h2><p class="text-gray-400">À venir (Module 5 & 6)...</p></div>' };
const Settings = { template: '<div class="p-4"><h2 class="text-xl font-bold mb-4">Paramètres</h2><p class="text-gray-400">À venir (Module 7)...</p></div>' };

const tabs = [
  { id: 'dashboard', name: 'Dashboard', icon: '📊', component: Dashboard },
  { id: 'updates', name: 'Mises à jour', icon: '🔄', component: Updates },
  { id: 'backups', name: 'Sauvegardes', icon: '💾', component: Backups },
  { id: 'settings', name: 'Paramètres', icon: '⚙️', component: Settings }
];

const currentTab = ref(tabs[0]);
</script>

<template>
  <!-- Écran de connexion -->
  <div v-if="!isAuthenticated" class="h-screen flex items-center justify-center bg-slate-900 text-white p-4">
    <div class="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🔐</div>
        <h1 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
          Connexion au Serveur
        </h1>
        <p class="text-slate-400 text-sm mt-2">Veuillez entrer le mot de passe d'administration</p>
      </div>
      <form @submit.prevent="login" class="space-y-4">
        <div>
          <input 
            type="password" 
            v-model="passwordInput" 
            placeholder="Mot de passe" 
            class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            required
          >
        </div>
        <button type="submit" class="w-full bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-400 hover:to-teal-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95">
          Se connecter
        </button>
      </form>
    </div>
  </div>

  <!-- Application Principale -->
  <div v-else class="h-screen flex flex-col bg-slate-900 text-white overflow-hidden pb-16">
    <!-- Header -->
    <header class="bg-slate-800 p-4 shadow-md z-10 flex items-center justify-between">
      <h1 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
        Gestion Serveur
      </h1>
      <div class="text-sm px-2 py-1 bg-slate-700 rounded-full border border-slate-600">
        {{ currentTab.name }}
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-y-auto w-full max-w-3xl mx-auto">
      <component :is="currentTab.component" />
    </main>

    <!-- Bottom Navigation Bar -->
    <nav class="bg-slate-800 border-t border-slate-700 fixed bottom-0 w-full z-20 pb-safe">
      <div class="flex justify-around items-center h-16 max-w-md mx-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="currentTab = tab"
          class="flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors"
          :class="currentTab.id === tab.id ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'"
        >
          <span class="text-xl leading-none">{{ tab.icon }}</span>
          <span class="text-[10px] font-medium uppercase tracking-wider">{{ tab.name }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<style>
/* CSS env() variables are used for safe areas on mobile devices (e.g., iPhone notch/home bar) */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
