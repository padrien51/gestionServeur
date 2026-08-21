<script setup>
import { ref } from 'vue';

const props = defineProps({
    isOpen: Boolean,
    insights: Array
});

const emit = defineEmits(['close', 'refresh']);

const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
});

const resolveInsight = async (id) => {
    try {
        await fetch(`${API_BASE}/ai/insights/${id}/resolve`, {
            method: 'POST',
            ...getFetchOptions()
        });
        emit('refresh');
    } catch (e) {
        console.error(e);
    }
};

const ignoreInsight = async (id) => {
    try {
        await fetch(`${API_BASE}/ai/insights/${id}/ignore`, {
            method: 'POST',
            ...getFetchOptions()
        });
        emit('refresh');
    } catch (e) {
        console.error(e);
    }
};

const retryingIds = ref(new Set());

const retryInsight = async (id) => {
    if (retryingIds.value.has(id)) return;
    
    // Create a new set to trigger Vue reactivity
    const newSet = new Set(retryingIds.value);
    newSet.add(id);
    retryingIds.value = newSet;

    try {
        await fetch(`${API_BASE}/ai/insights/${id}/retry`, {
            method: 'POST',
            ...getFetchOptions()
        });
        emit('refresh');
    } catch (e) {
        console.error(e);
    } finally {
        const nextSet = new Set(retryingIds.value);
        nextSet.delete(id);
        retryingIds.value = nextSet;
    }
};

const copiedId = ref(null);
const copyLog = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
        copiedId.value = id;
        setTimeout(() => {
            if (copiedId.value === id) copiedId.value = null;
        }, 2000);
    }).catch(err => console.error("Erreur de copie: ", err));
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr.replace(' ', 'T') + 'Z');
        return d.toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch(e) {
        return dateStr;
    }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-hidden flex">
    <!-- Backdrop blur -->
    <div 
        class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        @click="emit('close')"
    ></div>

    <!-- Drawer Panel -->
    <div class="ml-auto w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl relative flex flex-col transition-transform duration-300 transform translate-x-0 border-l border-slate-200/60 dark:border-slate-700">
        <!-- Header -->
        <div class="p-4 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
            <h2 class="text-xl font-bold flex items-center text-slate-800 dark:text-slate-100">
                <span class="mr-2">🤖</span> AIOps Insights
            </h2>
            <button @click="emit('close')" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
            <div v-if="insights.length === 0" class="text-center py-12 text-slate-500">
                <div class="text-4xl mb-4">✨</div>
                <p>Aucune alerte IA pour le moment.</p>
                <p class="text-sm">Vos conteneurs se portent bien !</p>
            </div>

            <div v-else v-for="insight in insights" :key="insight.id" class="bg-white dark:bg-slate-800 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm overflow-hidden flex flex-col">
                <div class="p-3 border-b border-slate-100 dark:border-slate-700/50 bg-rose-50 dark:bg-rose-900/20">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">{{ insight.project_name }} / {{ insight.container_name }}</span>
                            <div class="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">
                                {{ insight.diagnosis }}
                            </div>
                        </div>
                        <span class="text-[10px] text-rose-500/70 font-medium bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">{{ formatDate(insight.created_at) }}</span>
                    </div>
                </div>

                <div class="relative group p-3 bg-slate-900 text-slate-300 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
                    <button @click="copyLog(insight.id, insight.log_context)" 
                            class="absolute top-2 right-2 p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" 
                            :title="copiedId === insight.id ? 'Copié !' : 'Copier'">
                        <svg v-if="copiedId === insight.id" class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                    <pre class="pr-8">{{ insight.log_context }}</pre>
                </div>

                <div class="p-3 bg-white dark:bg-slate-800">
                    <h4 class="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Solution proposée
                    </h4>
                    <p class="text-sm text-slate-700 dark:text-slate-300">{{ insight.solution }}</p>
                </div>

                <div class="p-2 border-t border-slate-100 dark:border-slate-700/50 flex justify-end space-x-2 bg-slate-50 dark:bg-slate-800/50">
                    <button v-if="insight.diagnosis && insight.diagnosis.includes('Échec de l\'analyse IA')" 
                            @click="retryInsight(insight.id)" 
                            :disabled="retryingIds.has(insight.id)"
                            class="px-3 py-1.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 rounded transition-colors border border-indigo-200 dark:border-indigo-800/50 disabled:opacity-50">
                        {{ retryingIds.has(insight.id) ? 'Analyse en cours...' : 'Relancer l\'analyse' }}
                    </button>
                    <button @click="ignoreInsight(insight.id)" class="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                        Faux positif (Ignorer)
                    </button>
                    <button @click="resolveInsight(insight.id)" class="px-3 py-1.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 rounded transition-colors border border-emerald-200 dark:border-emerald-800/50">
                        Marquer comme résolu
                    </button>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>
