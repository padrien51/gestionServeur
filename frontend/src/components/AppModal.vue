<script setup>
import { useModal } from '../composables/useModal';
const { state, close } = useModal();
</script>

<template>
  <transition name="modal-fade">
    <div v-if="state.isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Overlay (Backdrop) -->
      <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" @click="close(false)"></div>
      
      <!-- Modal Box -->
      <div class="relative bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl w-full max-w-md overflow-hidden flex flex-col transform transition-all">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex justify-between items-center" 
             :class="state.type === 'confirm' ? 'bg-orange-950/30' : 'bg-white dark:bg-slate-800/50'">
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center">
            <span class="mr-2" v-if="state.type === 'confirm'">⚠️</span>
            <span class="mr-2" v-else>ℹ️</span>
            {{ state.title || (state.type === 'confirm' ? 'Confirmation' : 'Information') }}
          </h3>
          <button @click="close(false)" class="text-slate-500 dark:text-slate-400 hover:text-slate-200 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <!-- Body -->
        <div class="px-6 py-5 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">
          {{ state.message }}
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
          <template v-if="state.type === 'confirm'">
            <button @click="close(false)" class="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-200/60 dark:border-slate-700">
              Annuler
            </button>
            <button @click="close(true)" class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 rounded-lg text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/50 transition-colors">
              Confirmer
            </button>
          </template>
          
          <template v-else>
            <button @click="close(true)" class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 rounded-lg text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/50 transition-colors">
              OK
            </button>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
