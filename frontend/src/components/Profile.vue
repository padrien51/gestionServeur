<script setup>
import { ref, onMounted } from 'vue';
import { useModal } from '../composables/useModal';

const { showAlert } = useModal();
const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
  }
});

const newEmail = ref('');
const currentPassword = ref('');
const newPassword = ref('');

const handleChangeEmail = async () => {
  if (!newEmail.value) {
    return showAlert("Erreur", "Veuillez entrer une adresse email valide.");
  }
  
  try {
    const res = await fetch(`${API_BASE}/auth/change-email`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ newEmail: newEmail.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du changement d'email");
    showAlert("Succès", "Votre email a été mis à jour avec succès.");
    newEmail.value = '';
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

const handleChangePassword = async () => {
  if (!currentPassword.value || !newPassword.value) {
    return showAlert("Erreur", "Veuillez remplir tous les champs du mot de passe.");
  }
  
  try {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors du changement de mot de passe");
    showAlert("Succès", "Votre mot de passe a été mis à jour avec succès.");
    currentPassword.value = '';
    newPassword.value = '';
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

// --- LOGIQUE A2F (2FA) ---
const is2FAEnabled = ref(false);
const qrCodeUrl = ref('');
const tokenCode = ref('');
const backupCodes = ref([]);
const show2FAModal = ref(false);
const showDisableModal = ref(false);
const twoFAPassword = ref('');

const load2FAStatus = async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/2fa/status`, getFetchOptions());
    if (res.ok) {
      const data = await res.json();
      is2FAEnabled.value = data.isEnabled;
    }
  } catch (e) { console.error(e); }
};

onMounted(() => {
  load2FAStatus();
});

const start2FASetup = async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/2fa/generate`, { method: 'POST', ...getFetchOptions() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    qrCodeUrl.value = data.qrCode;
    show2FAModal.value = true;
    tokenCode.value = '';
    backupCodes.value = [];
  } catch(e) {
    showAlert("Erreur", e.message);
  }
};

const verify2FASetup = async () => {
  if (!tokenCode.value || tokenCode.value.length < 6) return showAlert("Erreur", "Veuillez entrer un code valide.");
  try {
    const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ tokenCode: tokenCode.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    is2FAEnabled.value = true;
    backupCodes.value = data.backupCodes;
  } catch(e) {
    showAlert("Erreur", e.message);
  }
};

const disable2FA = async () => {
  if (!twoFAPassword.value) return showAlert("Erreur", "Veuillez entrer votre mot de passe.");
  try {
    const res = await fetch(`${API_BASE}/auth/2fa/disable`, {
      method: 'POST',
      ...getFetchOptions(),
      body: JSON.stringify({ password: twoFAPassword.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    is2FAEnabled.value = false;
    twoFAPassword.value = '';
    showDisableModal.value = false;
    showAlert("Succès", "La double authentification a été désactivée.");
  } catch(e) {
    showAlert("Erreur", e.message);
  }
};

</script>

<template>
  <div class="p-4 space-y-6">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">👤</span> Mon Compte
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Gérez vos informations personnelles et votre sécurité.</p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl p-6 space-y-8">
      
      <!-- Modifier l'email -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-700 pb-2 mb-4 flex items-center">
          <span class="mr-2">📧</span> Changer d'adresse email
        </h3>
        <form @submit.prevent="handleChangeEmail" class="flex flex-col md:flex-row gap-4 items-end">
          <div class="flex-1 w-full">
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nouvelle adresse email</label>
            <input 
              v-model="newEmail" 
              type="email" 
              placeholder="votre.nouvel@email.com" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <button type="submit" class="w-full md:w-auto bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 px-6 rounded-xl transition-all h-[50px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20">
            Mettre à jour
          </button>
        </form>
      </div>

      <!-- Modifier le mot de passe -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-700 pb-2 mb-4 flex items-center">
          <span class="mr-2">🔑</span> Changer de mot de passe
        </h3>
        <form @submit.prevent="handleChangePassword" class="space-y-4 max-w-md">
          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Mot de passe actuel</label>
            <input 
              v-model="currentPassword" 
              type="password" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nouveau mot de passe</label>
            <input 
              v-model="newPassword" 
              type="password" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>
          <div class="pt-2">
            <button type="submit" class="bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 px-6 rounded-xl transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20">
              Modifier le mot de passe
            </button>
          </div>
        </form>
      </div>
      
      <!-- Authentification Double Facteur (A2F) -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-700 pb-2 mb-4 flex items-center">
          <span class="mr-2">🛡️</span> Double Authentification (A2F)
        </h3>
        
        <div v-if="!is2FAEnabled" class="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center border border-slate-200/60 dark:border-slate-700">
          <div class="mb-4 md:mb-0">
            <h4 class="font-bold text-slate-800 dark:text-slate-200">Sécurisez votre compte</h4>
            <p class="text-slate-500 text-sm mt-1">Utilisez une application comme Google Authenticator pour protéger votre serveur.</p>
          </div>
          <button @click="start2FASetup" class="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 font-medium py-2.5 px-5 rounded-lg transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-emerald-900/20 whitespace-nowrap">
            Activer l'A2F
          </button>
        </div>
        
        <div v-else class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center border border-emerald-200 dark:border-emerald-800/30">
          <div class="mb-4 md:mb-0 flex items-center">
            <span class="text-3xl mr-4">✅</span>
            <div>
              <h4 class="font-bold text-emerald-800 dark:text-emerald-400">A2F Activée</h4>
              <p class="text-emerald-600 dark:text-emerald-500 text-sm mt-1">Votre compte est protégé de façon optimale.</p>
            </div>
          </div>
          <button @click="showDisableModal = true" class="bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 font-medium py-2.5 px-5 rounded-lg transition-all">
            Désactiver
          </button>
        </div>
      </div>

    </div>

    <!-- Modal Configuration A2F -->
    <div v-if="show2FAModal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl overflow-hidden border border-slate-200/60 dark:border-slate-700">
        
        <div v-if="backupCodes.length > 0" class="p-6">
          <h3 class="text-xl font-bold text-emerald-600 mb-4 flex items-center"><span class="mr-2">🎉</span> A2F Activée !</h3>
          <p class="text-slate-600 dark:text-slate-300 text-sm mb-4">
            Voici vos codes de récupération. <strong>Copiez-les en lieu sûr</strong>. Ils vous permettront de vous connecter si vous perdez votre téléphone.
          </p>
          <div class="bg-slate-100 dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700 grid grid-cols-2 gap-2 text-center font-mono text-sm text-slate-800 dark:text-slate-200 mb-6">
            <div v-for="code in backupCodes" :key="code">{{ code }}</div>
          </div>
          <button @click="show2FAModal = false" class="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-all">
            J'ai sauvegardé ces codes
          </button>
        </div>

        <div v-else class="p-6 space-y-6">
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-4">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white">Configurer l'A2F</h3>
            <button @click="show2FAModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              ✕
            </button>
          </div>
          
          <div class="text-center space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-300">1. Scannez ce QR Code avec Google Authenticator ou Authy :</p>
            <div class="flex justify-center bg-white p-4 rounded-xl inline-block border border-slate-200 mx-auto">
              <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="QR Code 2FA" class="w-48 h-48" />
              <div v-else class="w-48 h-48 animate-pulse bg-slate-200 flex items-center justify-center text-slate-400">Chargement...</div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">2. Entrez le code généré par l'application :</label>
            <input 
              v-model="tokenCode" 
              type="text" 
              maxlength="6"
              placeholder="123456" 
              class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-center text-2xl tracking-widest text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>

          <button @click="verify2FASetup" class="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 font-medium py-3 px-4 rounded-xl transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/20">
            Valider et Activer
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Désactivation A2F -->
    <div v-if="showDisableModal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-2xl overflow-hidden border border-slate-200/60 dark:border-slate-700 p-6 space-y-6">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white">Désactiver l'A2F</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Veuillez entrer votre mot de passe pour confirmer la désactivation.</p>
        <input 
          v-model="twoFAPassword" 
          type="password" 
          placeholder="Mot de passe actuel" 
          class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-red-500 focus:outline-none"
        />
        <div class="flex space-x-3">
          <button @click="showDisableModal = false; twoFAPassword = ''" class="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-medium py-3 rounded-xl transition-all">Annuler</button>
          <button @click="disable2FA" class="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-3 rounded-xl transition-all">Désactiver</button>
        </div>
      </div>
    </div>
  </div>
</template>
