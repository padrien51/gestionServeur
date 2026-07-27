<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  containerId: { type: String, default: null },
  containerName: { type: String, default: '' }
});

const emit = defineEmits(['close']);

const logs = ref([]);
const logsContainer = ref(null);
const isAutoScroll = ref(true);
let eventSource = null;

const close = () => {
  stopLogs();
  emit('close');
};

const stopLogs = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const startLogs = () => {
  stopLogs();
  logs.value = [];
  if (!props.containerId) return;

  const pwd = localStorage.getItem('app_pwd') || '';
  const url = `/api/docker/containers/${props.containerId}/logs?pwd=${encodeURIComponent(pwd)}`;
  
  eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    // Le backend envoie le texte encodé en base64 pour éviter les soucis d'encodage SSE
    const decoded = atob(event.data);
    logs.value.push(decoded);
    
    // Auto-scroll
    if (isAutoScroll.value) {
      nextTick(() => {
        if (logsContainer.value) {
          logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
        }
      });
    }
  };

  eventSource.onerror = (err) => {
    console.error('Erreur SSE:', err);
    logs.value.push('[Erreur de connexion aux logs]');
    stopLogs();
  };
};

// Handle manual scroll to disable auto-scroll if user scrolls up
const handleScroll = (e) => {
  const el = e.target;
  const bottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 10;
  isAutoScroll.value = bottom;
};

// Restart logs if container changes
watch(() => props.containerId, (newVal) => {
  if (newVal) startLogs();
  else stopLogs();
});

onUnmounted(() => {
  stopLogs();
});
</script>

<template>
  <transition
    enter-active-class="transition transform duration-300 ease-out"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition transform duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div v-if="containerId" class="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none">
      <!-- Overlay semi-transparent (cliquable pour fermer) -->
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" @click="close"></div>
      
      <!-- Bottom Sheet -->
      <div class="relative bg-slate-50 dark:bg-slate-900 w-full h-[80vh] sm:h-[90vh] rounded-t-3xl shadow-2xl flex flex-col pointer-events-auto border-t border-slate-200 dark:border-slate-700">
        <!-- Handle for dragging (visual only) -->
        <div class="w-full flex justify-center pt-3 pb-1 cursor-pointer" @click="close">
          <div class="w-16 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
        </div>
        
        <!-- Header -->
        <div class="px-6 py-4 flex justify-between items-center border-b border-slate-800">
          <div>
            <h2 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              Logs
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 font-mono">{{ containerName }}</p>
          </div>
          <button @click="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <svg class="w-6 h-6 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <!-- Toolbar -->
        <div class="px-6 py-2 bg-white dark:bg-slate-800/50 flex justify-between items-center text-sm border-b border-slate-800">
          <div class="flex items-center space-x-2">
            <span class="flex h-2 w-2 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </span>
            <span class="text-teal-400 font-medium">Direct</span>
          </div>
          
          <button 
            @click="isAutoScroll = !isAutoScroll" 
            class="flex items-center space-x-1 px-3 py-1 rounded-lg transition-colors"
            :class="isAutoScroll ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
            <span>Auto-scroll</span>
          </button>
        </div>
        
        <!-- Logs Content -->
        <div 
          ref="logsContainer"
          @scroll="handleScroll"
          class="flex-1 overflow-y-auto bg-[#0d1117] p-4 font-mono text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1"
        >
          <div v-if="logs.length === 0" class="text-slate-500 text-center py-10 italic">
            En attente de nouveaux logs...
          </div>
          <div v-for="(log, idx) in logs" :key="idx" class="break-all whitespace-pre-wrap">
            {{ log }}
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
