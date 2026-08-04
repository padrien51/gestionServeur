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
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{{ container.image }}</p>
        <p class="text-xs font-mono text-slate-500 mt-0.5">{{ container.status }}</p>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
        <!-- Badge MAJ -->
        <span v-if="container.hasUpdate && !isUpdateIgnored" class="text-[10px] font-bold px-2 py-1 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center shadow-sm animate-pulse mr-1" title="Mise à jour disponible">
          ⬆️ v.{{ container.newVersion }}
        </span>
        
        <button @click="$emit('toggle-ignore-update', container)" class="p-2 rounded-lg transition-colors" :class="isUpdateIgnored ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100' : 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'" :title="isUpdateIgnored ? 'Mises à jour ignorées (Cliquer pour surveiller)' : 'Mises à jour surveillées (Cliquer pour ignorer)'">
          <span v-if="isUpdateIgnored">🛡️</span>
          <span v-else class="grayscale opacity-50">🛡️</span>
        </button>
        
        <button v-if="isUp" @click="$emit('open-terminal', container)" class="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors" title="Ouvrir le Terminal (Shell)">
          📟
        </button>
        <button @click="$emit('live-logs', container)" class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors" title="Logs en Direct">
          📡
        </button>
        <button v-if="!isUp" @click="handleAction('start')" class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors" title="Démarrer">
          ▶️
        </button>
        <button v-if="isUp" @click="handleAction('restart')" class="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors" title="Redémarrer">
          🔄
        </button>
        <button v-if="isUp" @click="handleAction('stop')" class="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors" title="Arrêter">
          ⏹️
        </button>
      </div>
    </div>
  </div>
</template>
