/* Navegação compartilhada, responsiva e acessível. */
const mobileNavigation = window.matchMedia('(max-width: 1100px)');
function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
function setRecordMetadata(title, description, image) {
  document.title = title;
  const values = { 'description': description, 'og:title': title, 'og:description': description, 'og:type':'article', 'twitter:title': title, 'twitter:description': description };
  let imageUrl = null;
  try { const candidate = new URL(image || '', location.href); if (image && /^https?:$/.test(candidate.protocol)) imageUrl = candidate.href; } catch { }
  values['og:image'] = imageUrl;
  values['twitter:image'] = imageUrl;
  values['twitter:card'] = imageUrl ? 'summary_large_image' : 'summary';
  for (const [key, value] of Object.entries(values)) {
    const attr = key.startsWith('og:') ? 'property' : 'name';
    let meta = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!value) { meta?.remove(); continue; }
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute(attr, key); document.head.appendChild(meta); }
    meta.content = String(value).slice(0, key.includes('image') ? 2000 : 250);
  }
}
function getSavedTheme() {
  try { return localStorage.getItem('petadopt_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
function applySavedTheme() { document.documentElement.setAttribute('data-theme', getSavedTheme()); }
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('petadopt_theme', next); } catch { }
  const button = document.getElementById('theme-toggle');
  if (button) button.innerHTML = `${svgIcon(next === 'dark' ? 'sun' : 'moon')}Ativar tema ${next === 'dark' ? 'claro' : 'escuro'}`;
}

function renderNav() {
  applySavedTheme();
  const actions = document.getElementById('nav-actions');
  if (!actions) return;
  const user = Auth.getCurrentUser();
  let unread = 0;
  try { unread = user ? Store.getNotifications(user.id).filter(n => !n.read).length : 0; } catch { }
  const role = {adotante:'Adotante', doador:'ONG / Doador', admin:'Administrador'}[user?.role] || 'Minha conta';
  const panel = user?.role === 'doador' ? {href:'painel-doador.html', label:'Meu Painel'}
    : user?.role === 'admin' ? {href:'admin.html',label:'Painel Admin'} : null;
  const accountLinks = user ? `
    <a href="favoritos.html">${svgIcon('heart')}Favoritos</a>
    <a href="minhas-solicitacoes.html">${svgIcon('clipboard')}Minhas Solicitações</a>
    ${panel ? `<a href="${panel.href}">${svgIcon('dashboard')}${panel.label}</a>` : ''}`
    : `<a href="login.html">${svgIcon('user')}Entrar</a><a href="registro.html">${svgIcon('plus')}Criar conta</a>`;
  const extra = document.getElementById('nav-extra-links');
  if (extra) extra.innerHTML = `<a class="nav-support" href="apoio.html">${svgIcon('users')}<span>Rede de<br class="support-break"> Apoio</span></a>
    <span class="mobile-nav-account"><span class="mobile-nav-section-title">Sua conta</span>${accountLinks}</span>`;

  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  actions.innerHTML = `
    ${user ? `<a href="favoritos.html" class="nav-account-link">${svgIcon('heart')}Favoritos</a>
      <a href="minhas-solicitacoes.html" class="nav-account-link">${svgIcon('clipboard')}<span class="nav-requests-label">Minhas Solicitações</span></a>`
      : '<a href="login.html" class="nav-account-link">Entrar</a><a href="registro.html" class="nav-logout">Cadastre-se</a>'}
    <a href="${user ? 'favoritos.html' : 'login.html'}" class="nav-mobile-favorite" aria-label="Favoritos">${svgIcon('heart')}</a>
    <div class="account-wrap">
      <button type="button" class="account-toggle" id="account-toggle" aria-label="Minha conta" aria-expanded="false" aria-controls="account-menu" onclick="toggleAccountMenu()">
        <span class="account-avatar">${svgIcon('user')}</span>
        <span class="account-copy"><span class="account-name" title="${escapeAttr(user?.name || 'Bem-vindo ao AdotaPet')}">${user ? `Olá, ${escapeHTML(user.name)}` : 'Bem-vindo'}</span><span class="account-role">${role}${svgIcon('chevron')}</span></span>
      </button>
      <section class="account-menu" id="account-menu" aria-label="Opções da conta" hidden>
        <div class="account-menu-heading"><b>${escapeHTML(user?.name || 'Sua próxima amizade começa aqui')}</b><small>${user ? role : 'Entre ou crie sua conta gratuitamente.'}</small></div>
        ${accountLinks}
        <button type="button" id="theme-toggle" onclick="toggleTheme()">${svgIcon(dark ? 'sun' : 'moon')}Ativar tema ${dark ? 'claro' : 'escuro'}</button>
        ${user ? `<button type="button" id="notif-toggle" aria-expanded="false" aria-controls="notif-panel" onclick="toggleNotifications()">${svgIcon('bell')}Avisos<span class="notification-count" ${unread ? '' : 'hidden'}>${unread}</span></button>
          <div class="notif-panel" id="notif-panel" hidden></div>
          <button type="button" class="account-logout" onclick="handleLogout()">${svgIcon('logout')}Sair da conta</button>` : ''}
      </section>
    </div>
    ${user ? '<button type="button" class="nav-logout" onclick="handleLogout()">Sair</button>' : ''}
    <button type="button" class="menu-toggle" id="menu-toggle" onclick="toggleMobileMenu()" aria-label="Abrir menu" aria-controls="nav-links" aria-expanded="false">${svgIcon('menu', 'menu-open-icon')}${svgIcon('close', 'menu-close-icon')}<span class="menu-toggle-label">Menu</span></button>`;
  document.getElementById('nav-links')?.setAttribute('aria-label', 'Navegação principal');
  const currentPath = location.pathname === '/' ? '/index.html' : location.pathname;
  document.querySelectorAll('.navbar a:not(.logo)').forEach(link => {
    const active = new URL(link.href).pathname === currentPath;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setMobileMenu(false);
  syncNavigationLayout();
}

function toggleAccountMenu() { setAccountMenu(document.getElementById('account-menu')?.hidden); }
function setAccountMenu(open, restoreFocus = false) {
  const panel = document.getElementById('account-menu');
  const button = document.getElementById('account-toggle');
  if (!panel || !button) return;
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(Boolean(open)));
  if (open) setMobileMenu(false);
  else if (restoreFocus) button.focus();
}
function toggleNotifications() {
  const panel = document.getElementById('notif-panel');
  const user = Auth.getCurrentUser();
  if (!panel || !user) return;
  const open = panel.hidden;
  if (open) {
    try {
      const notifications = Store.getNotifications(user.id);
      panel.innerHTML = notifications.length
        ? notifications.slice(0, 8).map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">${escapeHTML(n.message)}</div>`).join('')
        : '<div class="notif-item">Você não tem notificações.</div>';
      Store.markNotificationsRead(user.id);
      const count = document.querySelector('#notif-toggle .notification-count');
      if (count) count.hidden = true;
    } catch { panel.innerHTML = '<div class="notif-item">Não foi possível carregar os avisos. Tente novamente.</div>'; }
  }
  panel.hidden = !open;
  document.getElementById('notif-toggle')?.setAttribute('aria-expanded', String(open));
}
function handleLogout() { Auth.logout(); window.location.href = 'index.html'; }
function toggleMobileMenu() { setMobileMenu(!document.getElementById('nav-links')?.classList.contains('open')); }
function setMobileMenu(open, restoreFocus = false) {
  const navigation = document.getElementById('nav-links');
  const button = document.getElementById('menu-toggle');
  if (!navigation || !button) return;
  const expanded = Boolean(open && mobileNavigation.matches);
  navigation.classList.toggle('open', expanded);
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Fechar menu' : 'Abrir menu');
  button.querySelector('.menu-toggle-label').textContent = expanded ? 'Fechar' : 'Menu';
  document.documentElement.classList.toggle('nav-menu-open', expanded);
  document.body.classList.toggle('nav-menu-open', expanded);
  if (expanded) setAccountMenu(false);
  if (!expanded && restoreFocus && mobileNavigation.matches) button.focus();
}
function syncNavigationLayout() {
  const header = document.querySelector('.navbar');
  if (!header) return;
  document.documentElement.style.setProperty('--nav-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
  if (!mobileNavigation.matches) setMobileMenu(false);
}
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), 3200);
}
document.addEventListener('DOMContentLoaded', () => {
  seedDatabase();
  renderNav();
  const header = document.querySelector('.navbar');
  if (header && typeof ResizeObserver !== 'undefined') new ResizeObserver(syncNavigationLayout).observe(header);
  window.addEventListener('resize', syncNavigationLayout);
  window.visualViewport?.addEventListener('resize', syncNavigationLayout);
  document.addEventListener('click', event => {
    // O caminho original continua válido quando um botão atualiza o SVG clicado.
    const elements = event.composedPath().filter(node => node instanceof Element);
    if (elements.some(node => node.matches('#nav-links a'))) setMobileMenu(false);
    else if (!elements.some(node => node.matches('.navbar'))) setMobileMenu(false);
    if (!elements.some(node => node.matches('.account-wrap'))) setAccountMenu(false);
  });
  document.addEventListener('keydown', event => {
    const menuOpen = mobileNavigation.matches && document.getElementById('nav-links')?.classList.contains('open');
    const accountOpen = document.getElementById('account-menu')?.hidden === false;
    if (event.key === 'Escape' && (menuOpen || accountOpen)) {
      event.preventDefault();
      if (menuOpen) setMobileMenu(false, true);
      if (accountOpen) setAccountMenu(false, true);
    } else if (event.key === 'Tab' && menuOpen && header) {
      const focusable = [...header.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener('focusin', event => { if (!event.target.closest('.account-wrap')) setAccountMenu(false); });
});
