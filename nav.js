/* ==========================================================================
   nav.js — Preenche a barra de navegação (login/logout) e o tema claro/escuro
   em todas as páginas. Chame renderNav() depois que a página carregar.
   ========================================================================== */

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function applySavedTheme() {
  const theme = localStorage.getItem('petadopt_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('petadopt_theme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'light' ? 'Escuro' : 'Claro';
}

function renderNav() {
  applySavedTheme();
  const user = Auth.getCurrentUser();
  const userNotifications = user ? Store.getNotifications(user.id) : [];
  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  const themeIcon = (localStorage.getItem('petadopt_theme') || 'light') === 'light' ? 'Escuro' : 'Claro';

  let extraLinks = '<a href="apoio.html">Rede de Apoio</a>';
  if (user) extraLinks += '<a href="favoritos.html">Favoritos</a>';
  if (user) extraLinks += '<a href="minhas-solicitacoes.html">Minhas Solicitações</a>';
  if (user?.role === 'doador') extraLinks += '<a href="painel-doador.html">Meu Painel</a>';
  if (user?.role === 'admin') extraLinks += '<a href="admin.html">Painel Admin</a>';
  extraLinks += `<button class="mobile-nav-action" onclick="toggleTheme()">Alternar tema</button>`;
  if (user) {
    const mobileNotifCount = userNotifications.filter(n => !n.read).length;
    extraLinks += `<button class="mobile-nav-action" onclick="toggleMobileNotifications()">Avisos${mobileNotifCount ? ` (${mobileNotifCount})` : ''}</button>`;
    extraLinks += '<div id="mobile-notif-panel" class="mobile-notif-panel"></div>';
    extraLinks += `<span class="mobile-user-greeting">Olá, ${escapeHTML(user.name.split(' ')[0])}</span>`;
    extraLinks += '<button class="mobile-nav-action mobile-logout" onclick="handleLogout()">Sair</button>';
  } else {
    extraLinks += '<a class="mobile-account-link" href="login.html">Entrar</a><a class="mobile-account-link" href="registro.html">Cadastre-se</a>';
  }
  const navLinks = document.getElementById('nav-extra-links');
  if (navLinks) navLinks.innerHTML = extraLinks;

  const notifCount = userNotifications.filter(n => !n.read).length;
  const notifBtn = user ? `
    <div style="position:relative;">
      <button class="btn btn-ghost btn-sm" id="notif-toggle" onclick="toggleNotifications()" aria-label="Notificações">Avisos${notifCount ? ` (${notifCount})` : ''}</button>
      <div id="notif-panel" class="notif-panel" style="display:none;"></div>
    </div>` : '';

  actions.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="theme-toggle" onclick="toggleTheme()" aria-label="Alternar tema">${themeIcon}</button>
    ${notifBtn}
    ${user
      ? `<span style="font-size:.85rem;color:var(--color-ink-soft)">Olá, ${escapeHTML(user.name.split(' ')[0])}</span>
         <button class="btn btn-outline btn-sm" onclick="handleLogout()">Sair</button>`
      : `<a href="login.html" class="btn btn-outline btn-sm">Entrar</a>
         <a href="registro.html" class="btn btn-accent btn-sm">Cadastre-se</a>`
    }
    <button class="menu-toggle" onclick="toggleMobileMenu()" aria-label="Abrir menu">Menu</button>
  `;
}

function toggleNotifications() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const user = Auth.getCurrentUser();
  if (panel.style.display === 'none') {
    const notifications = Store.getNotifications(user.id);
    panel.innerHTML = notifications.length
      ? notifications.slice(0, 8).map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">${escapeHTML(n.message)}</div>`).join('')
      : '<div class="notif-item">Você não tem notificações.</div>';
    panel.style.display = 'block';
    Store.markNotificationsRead(user.id);
  } else {
    panel.style.display = 'none';
    renderNav();
  }
}

function toggleMobileNotifications() {
  const panel = document.getElementById('mobile-notif-panel');
  const user = Auth.getCurrentUser();
  if (!panel || !user) return;
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    return;
  }
  const notifications = Store.getNotifications(user.id);
  panel.innerHTML = notifications.length
    ? notifications.slice(0, 8).map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">${escapeHTML(n.message)}</div>`).join('')
    : '<div class="notif-item">Você não tem notificações.</div>';
  panel.classList.add('open');
  Store.markNotificationsRead(user.id);
}

function handleLogout() {
  Auth.logout();
  window.location.href = 'index.html';
}

function toggleMobileMenu() {
  document.getElementById('nav-links')?.classList.toggle('open');
}

// Aviso rápido não-bloqueante (substitui alert() nas confirmações de
// ações simples, como "link copiado" — não interrompe o fluxo do usuário).
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), 3200);
}

document.addEventListener('DOMContentLoaded', () => {
  seedDatabase();
  renderNav();
});
