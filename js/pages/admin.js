let adminUser = null;

function renderStats() {
  const animals = Store.getAnimals();
  const requests = Store.getRequests();
  const acceptedWithDate = requests.filter(r => r.status === 'aceita' && r.acceptedAt && r.createdAt);
  const avgDays = acceptedWithDate.length
    ? Math.round(acceptedWithDate.reduce((sum, r) => {
        const ms = new Date(r.acceptedAt).getTime() - new Date(r.createdAt).getTime();
        return sum + Math.max(0, ms / 86400000);
      }, 0) / acceptedWithDate.length)
    : null;

  const stats = {
    totalUsers: Store.getUsers().length,
    totalAnimals: animals.length,
    adopted: animals.filter(a => a.status === 'adotado').length,
    pendingAnimals: animals.filter(a => a.status === 'aguardando_aprovacao').length,
    pendingRequests: requests.filter(r => r.status === 'pendente').length,
    missing: Store.getMissing().filter(m => !m.found).length,
    openReports: Store.getReports().filter(r => r.status === 'aberta').length,
    verified: animals.filter(a => a.verified).length
  };
  document.getElementById('stats-grid').innerHTML = `
    <div class="dashboard-stat"><b>${stats.totalUsers}</b>Usuários</div>
    <div class="dashboard-stat"><b>${stats.totalAnimals}</b>Animais cadastrados</div>
    <div class="dashboard-stat"><b>${stats.adopted}</b>Adotados</div>
    <div class="dashboard-stat"><b>${stats.verified}</b>Perfis verificados</div>
    <div class="dashboard-stat"><b>${stats.pendingAnimals}</b>Anúncios pendentes</div>
    <div class="dashboard-stat"><b>${stats.pendingRequests}</b>Solicitações pendentes</div>
    <div class="dashboard-stat"><b>${stats.missing}</b>Animais desaparecidos</div>
    <div class="dashboard-stat"><b>${stats.openReports}</b>Denúncias/mensagens abertas</div>
    <div class="dashboard-stat"><b>${avgDays !== null ? avgDays : '-'}</b>Dias médios da solicitação à adoção</div>`;
}

function renderPendentesTab() {
  const pending = Store.getAnimals().filter(a => a.status === 'aguardando_aprovacao');
  const users = Store.getUsers();
  const content = document.getElementById('tab-content');
  if (!pending.length) { content.innerHTML = '<p>Nenhum anúncio aguardando aprovação.</p>'; return; }
  content.innerHTML = `<table>
    <thead><tr><th>Animal</th><th>Tutor</th><th>Cidade</th><th>Ações</th></tr></thead>
    <tbody>${pending.map(a => {
      const owner = users.find(u => u.id === a.ownerId);
      return `<tr><td>${escapeHTML(a.name)}</td><td>${escapeHTML(owner ? owner.name : '-')}</td><td>${escapeHTML(a.city)}</td>
        <td><button class="btn btn-primary btn-sm" onclick="approveAnimal(${Number(a.id)})">Aprovar</button>
        <button class="btn btn-outline btn-sm" onclick="rejectAnimal(${Number(a.id)})">Recusar</button></td></tr>`;
    }).join('')}</tbody></table>`;
}

function renderAnimaisTab() {
  const animals = Store.getAnimals();
  document.getElementById('tab-content').innerHTML = `<table>
    <thead><tr><th>Animal</th><th>Status</th><th>Verificado</th><th>Destaque</th><th>Ações</th></tr></thead>
    <tbody>${animals.map(a => `<tr>
      <td>${escapeHTML(a.name)}</td><td>${escapeHTML(ANIMAL_STATUS[a.status] || a.status)}</td>
      <td>${a.verified ? '✓ Sim' : 'Não'}</td><td>${a.featured ? '★ Sim' : 'Não'}</td>
      <td><a class="btn btn-outline btn-sm" href="animal.html?id=${Number(a.id)}">Abrir</a>
      <button class="btn btn-outline btn-sm" onclick="toggleVerified(${Number(a.id)})">${a.verified ? 'Remover verificação' : 'Verificar perfil'}</button>
      <button class="btn btn-outline btn-sm" onclick="toggleFeatured(${Number(a.id)})">${a.featured ? 'Remover destaque' : 'Destacar'}</button></td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum animal cadastrado.</td></tr>'}</tbody></table>`;
}

function renderUsuariosTab() {
  const users = Store.getUsers();
  document.getElementById('tab-content').innerHTML = `<table>
    <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Cidade</th><th></th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td>${escapeHTML(u.name)}</td><td>${escapeHTML(u.email || '-')}</td><td>${escapeHTML(u.role)}</td><td>${escapeHTML(u.city || '-')}</td>
      <td>${u.role !== 'admin' && !u.protected ? `<button class="btn btn-danger btn-sm" onclick="removeUser(${Number(u.id)})">Remover</button>` : (u.protected ? '<span class="muted">Dados de demonstração</span>' : '')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderDenunciasTab() {
  const reports = Store.getReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const content = document.getElementById('tab-content');
  if (!reports.length) { content.innerHTML = '<p>Nenhuma denúncia ou mensagem registrada.</p>'; return; }
  content.innerHTML = `<table>
    <thead><tr><th>Categoria</th><th>Detalhes</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
    <tbody>${reports.map(r => `<tr>
      <td>${escapeHTML(REPORT_CATEGORY_LABEL[r.category] || (r.target_type === 'outro' ? 'Contato' : 'Outro'))}</td>
      <td style="max-width:320px;white-space:pre-wrap;">${escapeHTML(r.reason)}</td><td>${r.status === 'aberta' ? 'Aberta' : 'Resolvida'}</td>
      <td>${new Date(r.createdAt).toLocaleDateString('pt-BR')}</td>
      <td>${r.status === 'aberta' ? `<button class="btn btn-primary btn-sm" onclick="handleResolveReport(${Number(r.id)})">Marcar como resolvida</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderHistoricoTab() {
  const log = Store.getAdminLog();
  document.getElementById('tab-content').innerHTML = log.length
    ? `<div class="request-stepper" style="flex-direction:column;align-items:flex-start;gap:10px;">${log.slice(0, 50).map(l => `
        <div style="font-size:.88rem;border-bottom:1px solid var(--color-border);padding-bottom:8px;width:100%;">
          <b>${escapeHTML(l.adminName)}</b> · <span style="color:var(--color-ink-soft);">${new Date(l.createdAt).toLocaleString('pt-BR')}</span><br>${escapeHTML(l.message)}
        </div>`).join('')}</div>`
    : '<p>Nenhuma ação registrada ainda.</p>';
}

function renderApoioTab() {
  const points = Store.getSupportPoints();
  document.getElementById('tab-content').innerHTML = `<div class="admin-split">
    <form class="card admin-inline-form" id="support-admin-form">
      <h2>Cadastrar ponto verificado</h2><div id="support-admin-alert"></div>
      <div class="form-field"><label>Nome</label><input id="sp-name" required maxlength="160"></div>
      <div class="form-row"><div class="form-field"><label>Categoria</label><select id="sp-category" required><option value="ong">ONG ou protetor</option><option value="veterinario">Veterinário</option><option value="castracao">Castração</option><option value="lar_temporario">Lar temporário</option><option value="transporte">Transporte solidário</option><option value="doacao">Doações</option></select></div><div class="form-field"><label>Contato</label><input id="sp-contact" maxlength="120"></div></div>
      <div class="form-row"><div class="form-field"><label>Cidade</label><input id="sp-city" required maxlength="120"></div><div class="form-field"><label>Estado</label><input id="sp-state" required maxlength="40" value="RN"></div></div>
      <div class="form-field"><label>Endereço</label><input id="sp-address" maxlength="300"></div>
      <div class="form-field"><label>Serviços oferecidos</label><textarea id="sp-services" rows="3" maxlength="1000"></textarea></div>
      <button class="btn btn-primary" type="submit">Publicar na rede</button>
    </form>
    <div><h2>Pontos publicados</h2>${points.length ? points.map(p => `<div class="card admin-support-row"><div><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.city)}/${escapeHTML(p.state)} · ${escapeHTML(p.category)}</small></div><button class="btn btn-danger btn-sm" onclick="removeSupportPoint(${Number(p.id)})">Remover</button></div>`).join('') : '<p>Nenhum ponto cadastrado. Não publique dados sem antes conferi-los.</p>'}</div>
  </div>`;
  document.getElementById('support-admin-form')?.addEventListener('submit', submitSupportPoint);
}

function submitSupportPoint(event) {
  event.preventDefault();
  try {
    Store.createSupportPoint({ name: document.getElementById('sp-name').value, category: document.getElementById('sp-category').value, contact: document.getElementById('sp-contact').value, city: document.getElementById('sp-city').value, state: document.getElementById('sp-state').value, address: document.getElementById('sp-address').value, services: document.getElementById('sp-services').value });
    renderApoioTab();
  } catch (err) { document.getElementById('support-admin-alert').innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`; }
}

function removeSupportPoint(id) {
  if (!confirm('Remover este ponto da rede de apoio?')) return;
  adminAction(() => Store.deleteSupportPoint(id), renderApoioTab);
}

function adminAction(action, success) {
  try { action(); success(); } catch (err) { showToast(err.message); }
}
function approveAnimal(id) {
  const animal = Store.getAnimal(id);
  adminAction(() => { Store.updateAnimal(id, { status: 'disponivel' }); Store.logAction(adminUser.id, `Aprovou o anúncio de ${animal ? animal.name : '#' + id}.`); }, () => { renderStats(); renderPendentesTab(); });
}
function rejectAnimal(id) {
  const animal = Store.getAnimal(id);
  adminAction(() => { Store.updateAnimal(id, { status: 'indisponivel' }); Store.logAction(adminUser.id, `Recusou o anúncio de ${animal ? animal.name : '#' + id}.`); }, () => { renderStats(); renderPendentesTab(); });
}
function toggleVerified(id) {
  const animal = Store.getAnimal(id); if (!animal) return;
  adminAction(() => { Store.updateAnimal(id, { verified: !animal.verified }); Store.logAction(adminUser.id, `${animal.verified ? 'Removeu a verificação' : 'Verificou o perfil'} de ${animal.name}.`); }, () => { renderStats(); renderAnimaisTab(); });
}
function toggleFeatured(id) {
  const animal = Store.getAnimal(id); if (!animal) return;
  adminAction(() => { Store.updateAnimal(id, { featured: !animal.featured }); Store.logAction(adminUser.id, `${animal.featured ? 'Removeu o destaque' : 'Destacou'} o perfil de ${animal.name}.`); }, renderAnimaisTab);
}
function handleResolveReport(id) {
  adminAction(() => { Store.resolveReport(id); Store.logAction(adminUser.id, `Marcou a denúncia/mensagem #${id} como resolvida.`); }, () => { renderStats(); renderDenunciasTab(); });
}
function removeUser(id) {
  if (!confirm('Remover este usuário?')) return;
  adminAction(() => Store.deleteUser(id), () => { renderStats(); renderUsuariosTab(); });
}

const TABS = {
  'tab-pendentes': renderPendentesTab,
  'tab-animais': renderAnimaisTab,
  'tab-usuarios': renderUsuariosTab,
  'tab-denuncias': renderDenunciasTab,
  'tab-historico': renderHistoricoTab,
  'tab-apoio': renderApoioTab
};

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.requireAuth(['admin']);
  if (!user) return;
  adminUser = user;
  Object.keys(TABS).forEach(tabId => document.getElementById(tabId)?.addEventListener('click', () => {
    Object.keys(TABS).forEach(id => document.getElementById(id)?.classList.toggle('active', id === tabId));
    TABS[tabId]();
  }));
  renderStats();
  renderPendentesTab();
});
