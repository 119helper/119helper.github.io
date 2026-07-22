(() => {
  try {
    const savedTheme = localStorage.getItem('119helper-theme');
    const theme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }
})();
