// Apply the saved preference before styles and page content finish loading.
(() => {
  const key = 'hoasen_workspace_theme';
  const stored = (() => {
    try { return localStorage.getItem(key); } catch { return null; }
  })();
  const initial = stored === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = initial;
  document.documentElement.style.colorScheme = initial;

  function setTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    try { localStorage.setItem(key, value); } catch { /* Private browsing can block storage. */ }
    const button = document.querySelector('#theme-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(value === 'dark'));
      button.setAttribute('aria-label', value === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
      button.innerHTML = `<span aria-hidden="true">${value === 'dark' ? '☀' : '☾'}</span><span>${value === 'dark' ? 'Sáng' : 'Tối'}</span>`;
    }
    window.dispatchEvent(new CustomEvent('hoasen-theme-change', { detail: { theme: value } }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header-inner');
    if (header && !document.querySelector('#theme-toggle')) {
      const button = document.createElement('button');
      button.id = 'theme-toggle';
      button.className = 'theme-toggle';
      button.type = 'button';
      button.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
      header.append(button);
    }

    if (!document.querySelector('.site-footer')) {
      const footer = document.createElement('footer');
      footer.className = 'site-footer';
      footer.innerHTML = `<div class="site-footer-inner"><div class="footer-brand"><img src="/assets/logo-danny.png" alt="Logo Danny196Vnhat" loading="lazy"><div><strong>Made by Danny196Vnhat</strong><span>Hoa Sen Home Workspace</span></div></div><span class="footer-mark">DN 1906 · 2026</span></div>`;
      document.body.append(footer);
    }

    setTheme(document.documentElement.dataset.theme);
  });

  window.addEventListener('storage', event => {
    if (event.key === key) setTheme(event.newValue);
  });
})();
