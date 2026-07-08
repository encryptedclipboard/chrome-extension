import { Theme } from "@shared/enums/theme.enum";
import { storageService } from "@shared/services";

function createThemeStore() {
  // Sidebar is ALWAYS dark mode
  let theme = $state<Theme>(Theme.DARK);

  const isDark = $derived(true); // Always dark

  async function initTheme() {
    // Force dark mode, ignore stored theme for sidebar
    theme = Theme.DARK;
  }

  async function setTheme(newTheme: Theme) {
    // Sidebar is locked to dark mode
    theme = Theme.DARK;
  }

  async function toggleTheme() {
    // Sidebar is locked to dark mode, no toggle
    theme = Theme.DARK;
  }

  return {
    get theme() {
      return theme;
    },
    get isDark() {
      return isDark;
    },
    initTheme,
    setTheme,
    toggleTheme,
  };
}

export const themeStore = createThemeStore();
