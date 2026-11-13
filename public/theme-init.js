try {
  const theme = localStorage.getItem('gml-theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
} catch {}
