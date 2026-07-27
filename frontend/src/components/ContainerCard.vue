<script setup>
import { computed } from 'vue';

const props = defineProps({
  container: {
    type: Object,
    required: true
  }
});

import { useModal } from '../composables/useModal';

const { showConfirm } = useModal();

const emit = defineEmits(['action', 'view-logs']);

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
  <div class="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700/50 shadow-lg relative overflow-hidden group">
    <!-- Ligne colorée indicatrice sur la gauche -->
    <div class="absolute left-0 top-0 bottom-0 w-1" :class="isUp ? 'bg-emerald-500' : 'bg-red-500'"></div>
    
    <div class="flex justify-between items-start ml-2">
      <div class="truncate pr-2 flex-1">
        <h3 class="text-base font-semibold text-slate-100 truncate flex items-center gap-2">
          {{ container.name }}
          <span class="h-2.5 w-2.5 rounded-full inline-block" :class="statusColor"></span>
        </h3>
        <p class="text-xs text-slate-400 mt-1 truncate">{{ container.image }}</p>
        <p class="text-xs font-mono text-slate-500 mt-0.5">{{ container.status }}</p>
      </div>
      
      <!-- Actions -->
      <div class="flex space-x-2">
        <button @click="$emit('view-logs', container)" class="p-2 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-colors" title="Voir les logs">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
        </button>
        <button v-if="!isUp" @click="handleAction('start')" class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="Démarrer">
          ▶️
        </button>
        <button v-if="isUp" @click="handleAction('restart')" class="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors" title="Redémarrer">
          🔄
        </button>
        <button v-if="isUp" @click="handleAction('stop')" class="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Arrêter">
          ⏹️
        </button>
      </div>
    </div>
  </div>
</template>
