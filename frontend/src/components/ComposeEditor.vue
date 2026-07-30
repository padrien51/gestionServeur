<template>
  <div class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100">Éditeur Compose</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Projet : <span class="font-mono text-blue-500">{{ projectName }}</span></p>
          </div>
        </div>
        
        <div class="flex items-center space-x-2">
          <!-- File Selector -->
          <select 
            v-if="files.length > 0"
            v-model="selectedFile" 
            @change="loadFile(selectedFile)"
            class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option v-for="f in files" :key="f" :value="f">{{ f }}</option>
          </select>
          <span v-else class="text-xs text-slate-400 italic mr-2">Aucun fichier trouvé</span>
          
          <button @click="$emit('close')" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <!-- Editor Body -->
      <div class="flex-grow flex flex-col relative bg-slate-900">
        <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
           <svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        </div>
        
        <textarea 
          v-model="fileContent" 
          spellcheck="false"
          class="flex-grow w-full bg-transparent text-slate-300 font-mono text-sm p-4 resize-none focus:outline-none focus:ring-0 border-none"
          placeholder="Sélectionnez un fichier pour commencer l'édition..."
          :disabled="!selectedFile || isLoading"
        ></textarea>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <p class="text-xs text-slate-500 flex items-center">
          <svg class="w-4 h-4 mr-1 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          Attention : Les erreurs de syntaxe empêcheront le redémarrage.
        </p>
        
        <div class="flex space-x-3">
          <button 
            @click="$emit('close')"
            class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            Fermer
          </button>
          <button 
            @click="saveFile"
            :disabled="!selectedFile || isSaving || !hasChanges"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg transition-colors flex items-center"
          >
            <svg v-if="isSaving" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
            Sauvegarder sur l'hôte
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';

const props = defineProps({
  projectName: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'saved']);

const files = ref([]);
const selectedFile = ref('');
const fileContent = ref('');
const originalContent = ref('');
const isLoading = ref(false);
const isSaving = ref(false);

const API_BASE = '/api';

const getFetchOptions = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
};

const hasChanges = computed(() => {
  return fileContent.value !== originalContent.value;
});

const fetchFiles = async () => {
  isLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/docker/projects/${props.projectName}/files`, getFetchOptions());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    files.value = data.files || [];
    
    // Auto-select docker-compose.yml or the first file
    if (files.value.includes('docker-compose.yml')) {
      selectedFile.value = 'docker-compose.yml';
    } else if (files.value.length > 0) {
      selectedFile.value = files.value[0];
    }
    
    if (selectedFile.value) {
      await loadFile(selectedFile.value);
    }
  } catch (err) {
    console.error(err);
    alert("Erreur lors de la récupération des fichiers : " + err.message);
  } finally {
    isLoading.value = false;
  }
};

const loadFile = async (filename) => {
  if (!filename) return;
  isLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/docker/projects/${props.projectName}/file?file=${encodeURIComponent(filename)}`, getFetchOptions());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    fileContent.value = data.content;
    originalContent.value = data.content;
  } catch (err) {
    console.error(err);
    alert("Erreur de lecture : " + err.message);
    fileContent.value = '';
    originalContent.value = '';
  } finally {
    isLoading.value = false;
  }
};

const saveFile = async () => {
  if (!selectedFile.value || !hasChanges.value) return;
  
  isSaving.value = true;
  try {
    const options = getFetchOptions();
    options.method = 'PUT';
    options.body = JSON.stringify({
      file: selectedFile.value,
      content: fileContent.value
    });
    
    const res = await fetch(`${API_BASE}/docker/projects/${props.projectName}/file`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    originalContent.value = fileContent.value;
    emit('saved');
  } catch (err) {
    console.error(err);
    alert("Erreur de sauvegarde : " + err.message);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  fetchFiles();
});
</script>

<style scoped>
textarea {
  tab-size: 2;
}
</style>
