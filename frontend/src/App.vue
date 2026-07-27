<script setup>
import { ref } from 'vue';
import Dashboard from './components/Dashboard.vue';
// Placeholder components for other tabs
const Updates = { template: '<div class="p-4"><h2 class="text-xl font-bold mb-4">Mises à jour</h2><p class="text-gray-400">À venir (Module 2 & 3)...</p></div>' };
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
  <div class="h-screen flex flex-col bg-slate-900 text-white overflow-hidden pb-16">
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
