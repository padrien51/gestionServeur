<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { io } from 'socket.io-client';

const props = defineProps({
  containerId: String,
  containerName: String
});

const emit = defineEmits(['close']);
const logsContainer = ref(null);
const logs = ref([]);
const isConnected = ref(false);
const autoScroll = ref(true);
let socket = null;

onMounted(() => {
  const token = localStorage.getItem('auth_token');
  socket = io({ auth: { token } });

  socket.on('connect', () => {
    isConnected.value = true;
    logs.value.push({ text: '>> Connecté au flux de logs Docker...', type: 'system' });
    socket.emit('start-logs', props.containerId);
  });

  socket.on('log-data', (data) => {
    // Les logs Docker viennent avec des \n à la fin, on peut les spliter ou les ajouter tels quels
    const lines = data.split('\n').filter(l => l.trim() !== '');
    lines.forEach(l => {
      logs.value.push({ text: l, type: 'log' });
    });
    
    // Garder seulement les 2000 dernières lignes pour la perfo
    if (logs.value.length > 2000) {
      logs.value = logs.value.slice(logs.value.length - 2000);
    }
    
    scrollToBottom();
  });

  socket.on('log-error', (err) => {
    logs.value.push({ text: `>> Erreur: ${err}`, type: 'error' });
    scrollToBottom();
  });

  socket.on('disconnect', () => {
    isConnected.value = false;
    logs.value.push({ text: '>> Déconnecté du serveur.', type: 'system' });
    scrollToBottom();
  });
});

const scrollToBottom = () => {
  if (autoScroll.value && logsContainer.value) {
    nextTick(() => {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    });
  }
};

const handleScroll = () => {
  if (!logsContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = logsContainer.value;
  // Si l'utilisateur remonte, on désactive l'autoscroll
  if (scrollTop + clientHeight < scrollHeight - 50) {
    autoScroll.value = false;
  } else {
    autoScroll.value = true;
  }
};

const downloadLogs = () => {
  const text = logs.value.map(l => l.text).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs_${props.containerName}_${new Date().getTime()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

onBeforeUnmount(() => {
  if (socket) {
    socket.emit('stop-stream');
    socket.disconnect();
  }
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col p-4 md:p-8">
    <div class="bg-slate-800 rounded-t-xl border-t border-x border-slate-700 p-4 flex justify-between items-center shadow-lg">
      <div class="flex items-center space-x-3">
        <div :class="['w-3 h-3 rounded-full', isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500']"></div>
        <h3 class="text-white font-bold">Logs en Direct : {{ containerName }}</h3>
      </div>
      <div class="flex items-center space-x-4">
        <button @click="downloadLogs" class="flex items-center space-x-2 text-sm bg-slate-700 hover:bg-slate-600 text-white py-1.5 px-3 rounded-lg transition-colors border border-slate-600">
          <span>⬇️</span>
          <span class="hidden sm:inline">Télécharger</span>
        </button>
        <button @click="emit('close')" class="text-slate-400 hover:text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
    
    <div 
      ref="logsContainer"
      @scroll="handleScroll"
      class="flex-1 bg-[#1e1e1e] rounded-b-xl border-b border-x border-slate-700 overflow-y-auto p-4 font-mono text-sm shadow-2xl space-y-1"
    >
      <div 
        v-for="(log, idx) in logs" 
        :key="idx"
        :class="{
          'text-blue-400 font-bold': log.type === 'system',
          'text-red-400 font-bold': log.type === 'error',
          'text-slate-300': log.type === 'log',
          'text-xs opacity-50 text-center my-4': log.text === '---'
        }"
      >
        {{ log.text }}
      </div>
    </div>
    
    <div v-if="!autoScroll" class="absolute bottom-10 left-1/2 transform -translate-x-1/2">
      <button @click="autoScroll = true; scrollToBottom()" class="bg-blue-600/90 hover:bg-blue-500 text-white text-xs py-2 px-4 rounded-full shadow-lg backdrop-blur-sm border border-blue-400/30 flex items-center space-x-2 transition-all">
        <span>↓</span>
        <span>Reprendre le défilement automatique</span>
      </button>
    </div>
  </div>
</template>
