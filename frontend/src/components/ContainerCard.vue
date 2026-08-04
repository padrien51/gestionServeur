<script setup>
import { computed } from 'vue';

const props = defineProps({
  container: {
    type: Object,
    required: true
  },
  isUpdateIgnored: {
    type: Boolean,
    default: false
  }
});

import { useModal } from '../composables/useModal';

const { showConfirm } = useModal();

const emit = defineEmits(['action', 'view-logs', 'live-logs', 'open-terminal', 'toggle-ignore-update']);

const isUp = computed(() => props.container.state === 'running');

const statusColor = computed(() => {
  return isUp.value ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
});

const handleAction = async (action) => {
  const verb = action === 'start' ? 'démarrer' : action === 'stop' ? 'arrêter' : 'redémarrer';
  const isConfirmed = await showConfirm(
    "Confirmation",
    `Voulez-vous vraiment ${verb} le conteneur ${props.container.name} ?`
  );
  
  if (isConfirmed) {
    emit('action', { id: props.container.id, action });
  }
};
</script>

<template>
  <div class="bg-white dark:bg-slate-800 rounded-xl p-4 mb-3 border border-slate-200/60 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-sm dark:hover:shadow-md transition-shadow relative overflow-hidden group">
    <!-- Ligne colorée indicatrice sur la gauche -->
    <div class="absolute left-0 top-0 bottom-0 w-1" :class="isUp ? 'bg-emerald-500' : 'bg-red-500'"></div>
    
    <div class="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center ml-2 gap-3 sm:gap-2">
      <div class="truncate pr-2 w-full sm:flex-1">
        <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
          {{ container.name }}
          <span class="h-2.5 w-2.5 rounded-full inline-block shrink-0" :class="statusColor"></span>
          <!-- Badge MAJ -->
          <span v-if="container.hasUpdate && !isUpdateIgnored" class="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center shadow-sm ml-1" title="Mise à jour disponible">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            v.{{ container.newVersion }}
          </span>
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{{ container.image }}</p>
        <p class="text-xs font-mono text-slate-500 mt-0.5">{{ container.status }}</p>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
        
        <button @click="$emit('toggle-ignore-update', container)" class="p-2 rounded-lg transition-colors shadow-sm" :class="isUpdateIgnored ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'" :title="isUpdateIgnored ? 'Mises à jour ignorées (Cliquer pour surveiller)' : 'Mises à jour surveillées (Cliquer pour ignorer)'">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" :class="!isUpdateIgnored ? 'opacity-60' : ''"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </button>
        
        <button v-if="isUp" @click="$emit('open-terminal', container)" class="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shadow-sm" title="Ouvrir le Terminal (Shell)">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        </button>
        <button @click="$emit('live-logs', container)" class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors shadow-sm" title="Logs en Direct">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        </button>
        <button v-if="!isUp" @click="handleAction('start')" class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors shadow-sm" title="Démarrer">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
        </button>
        <button v-if="isUp" @click="handleAction('restart')" class="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors shadow-sm" title="Redémarrer">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>
        <button v-if="isUp" @click="handleAction('stop')" class="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors shadow-sm" title="Arrêter">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path></svg>
        </button>
      </div>
    </div>
  </div>
</template>
