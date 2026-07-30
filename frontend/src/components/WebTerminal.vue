<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { io } from 'socket.io-client';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const props = defineProps({
  containerId: String
});

const emit = defineEmits(['close']);
const terminalContainer = ref(null);
let socket = null;
let terminal = null;
let fitAddon = null;

onMounted(async () => {
  await nextTick();

  // Initialisation de Xterm
  terminal = new Terminal({
    cursorBlink: true,
    theme: {
      background: '#0f172a', // slate-900
      foreground: '#f8fafc',
    }
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  
  // Petit délai pour s'assurer que le DOM est prêt avant le fit
  setTimeout(() => {
    fitAddon.fit();
  }, 50);

  // Connexion WebSocket
  const token = localStorage.getItem('auth_token');
  // En dev, Vite tourne sur 3000 (ou via proxy). S'assurer que io() se connecte bien.
  socket = io({ auth: { token } });

  socket.on('connect', () => {
    terminal.writeln('\x1b[32mConnecté au backend, ouverture du terminal...\x1b[0m');
    socket.emit('start-terminal', props.containerId, { cmd: 'sh' });
    setTimeout(() => {
        if(fitAddon) {
            fitAddon.fit();
            socket.emit('terminal-resize', { cols: terminal.cols, rows: terminal.rows });
        }
    }, 100);
  });

  socket.on('terminal-data', (data) => {
    terminal.write(data);
  });

  socket.on('terminal-error', (err) => {
    terminal.writeln(`\r\n\x1b[31mErreur: ${err}\x1b[0m`);
  });

  socket.on('disconnect', () => {
    terminal.writeln('\r\n\x1b[31mDéconnecté du serveur.\x1b[0m');
  });

  terminal.onData((data) => {
    socket.emit('terminal-input', data);
  });

  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) {
      fitAddon.fit();
      socket.emit('terminal-resize', { cols: terminal.cols, rows: terminal.rows });
    }
  });
  resizeObserver.observe(terminalContainer.value);
});

onBeforeUnmount(() => {
  if (socket) {
    socket.emit('stop-stream');
    socket.disconnect();
  }
  if (terminal) terminal.dispose();
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col p-4 md:p-8">
    <div class="bg-slate-800 rounded-t-xl border-t border-x border-slate-700 p-4 flex justify-between items-center shadow-lg">
      <div class="flex items-center space-x-3">
        <span class="text-xl">📟</span>
        <h3 class="text-white font-bold">Terminal Web ({{ containerId.substring(0, 8) }})</h3>
      </div>
      <button @click="emit('close')" class="text-slate-400 hover:text-white transition-colors">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
    <div class="flex-1 bg-[#0f172a] rounded-b-xl border-b border-x border-slate-700 overflow-hidden relative shadow-2xl">
      <div ref="terminalContainer" class="absolute inset-0 p-2"></div>
    </div>
  </div>
</template>
