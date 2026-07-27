import { ref } from 'vue';

// On utilise un état global pour que tous les composants puissent réagir
const isDarkMode = ref(false);

export function useTheme() {
  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value;
    updateThemeClass();
    localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light');
  };

  const updateThemeClass = () => {
    if (isDarkMode.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const initTheme = () => {
    // Thème clair par défaut si rien n'est stocké
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      isDarkMode.value = true;
    } else {
      isDarkMode.value = false; // default light
    }
    updateThemeClass();
  };

  return {
    isDarkMode,
    toggleTheme,
    initTheme
  };
}
