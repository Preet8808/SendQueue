// SendQueue Theme Controller (Dark / Light Theme Switcher)

(function () {
  const STORAGE_KEY = 'sendqueue_theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return 'dark'; // Default theme
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggleButtons(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  function updateToggleButtons(theme) {
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
      btn.innerHTML = theme === 'light' ? '🌙' : '☀️';
      btn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    });
  }

  // Apply immediately before body renders to avoid flash
  applyTheme(getPreferredTheme());

  window.toggleTheme = toggleTheme;

  document.addEventListener('DOMContentLoaded', () => {
    updateToggleButtons(getPreferredTheme());
  });
})();
