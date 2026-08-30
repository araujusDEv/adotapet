let currentUser = null;

function renderAnimaisTab() {
  const animals = Store.getAnimals().filter(a => Number(a.ownerId) === currentUser.id);
  const content = document.getElementById('tab-content');
  if (animals.length === 0) {
    content.innerHTML = '<div class="empty-state"><h3>Você ainda não publicou animais</h3><a href="cadastrar-animal.html" class="btn btn-primary" style="margin-top:12px;">Cadastrar animal</a></div>';
    return;
  }
  content.innerHTML = `
    <table>
      <thead><tr><th>Animal</th><th>Cidade</th><th>Visualizações</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>${animals.map(a => `
        <tr>
          <td>${escapeHTML(a.name)}</td><td>${escapeHTML(a.city)}</td><td>${Number(a.views) || 0}</td><td>${escapeHTML(ANIMAL_STATUS[a.status] || a.status)}</td>
          <td>
            <a class="btn btn-outline btn-sm" href="animal.html?id=${Number(a.id)}">Abrir</a>
            ${a.seed ? '<span class="tag">Demonstração</span>' : `<button class="btn btn-danger btn-sm" onclick="removeAnimal(${Number(a.id)})">Excluir</button>`}
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function renderSolicitacoesTab() {
  const requests = Store.getRequests().filter(r => {
    const animal = Store.getAnimal(r.animalId);
    return animal && Number(animal.ownerId) === currentUser.id;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <table>
      <thead><tr><th>Animal</th><th>Interessado</th><th>Cidade</th><th>Status</th><th>Etapa</th><th>Ações</th></tr></thead>
      <tbody>${requests.map(r => {
        const animal = Store.getAnimal(r.animalId);
        return `<tr>
          <td>${escapeHTML(animal ? animal.name : '-')}</td><td>${escapeHTML(r.full_name || '-')}</td><td>${escapeHTML(r.city || '-')}</td>
          <td>${escapeHTML(REQUEST_STATUS[r.status] || r.status)}</td><td>${escapeHTML(REQUEST_STAGE_LABEL[r.stage] || '-')}</td>
          <td>${r.status === 'pendente' ? `
            ${r.stage === 'em_analise' ? `<button class="btn btn-outline btn-sm" onclick="markInterview(${Number(r.id)})">Marcar entrevista</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="respondRequest(${Number(r.id)}, 'aceita')">Aceitar</button>
            <button class="btn btn-outline btn-sm" onclick="respondRequest(${Number(r.id)}, 'recusada')">Recusar</button>` : r.status === 'aceita' ? `<a class="btn btn-outline btn-sm" href="contrato.html?request=${Number(r.id)}">Ver termo</a>` : '-'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">Nenhuma solicitação recebida ainda.</td></tr>'}</tbody>
    </table>`;
}

function renderAcompanhamentosTab() {
  const requests = Store.getRequests().filter(r => r.status === 'aceita');
  const followups = Store.getFollowups().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const ownedAnimalIds = new Set(Store.getAnimals().filter(a => Number(a.ownerId) === currentUser.id).map(a => a.id));
  const visible = followups.filter(f => ownedAnimalIds.has(f.animalId));
  const content = document.getElementById('tab-content');
  content.innerHTML = visible.length ? visible.map(f => {
    const animal = Store.getAnimal(f.animalId); const request = requests.find(r => r.id === f.requestId);
    const photo = safeImageSrc(f.photo);
    const adaptation = { otima:'Ótima', boa:'Boa, em adaptação', dificil:'Difícil' }[f.adaptation] || f.adaptation;
    return `<article class="card followup-report"><div>${photo ? `<img src="${escapeAttr(photo)}" alt="Atualização de ${escapeAttr(animal?.name || 'animal')}">` : ''}</div><div>
      <span class="tag">${Number(f.day)} dias</span><h3>${escapeHTML(animal?.name || 'Animal')}</h3>
      <p><b>Adotante:</b> ${escapeHTML(request?.full_name || '-')} · <b>Adaptação:</b> ${escapeHTML(adaptation)}</p>
      ${f.health ? `<p><b>Saúde:</b> ${escapeHTML(f.health)}</p>` : ''}${f.behavior ? `<p><b>Comportamento:</b> ${escapeHTML(f.behavior)}</p>` : ''}
      ${f.needsHelp ? '<div class="alert alert-error">A família informou que precisa de orientação ou apoio.</div>' : '<div class="alert alert-success">A família não solicitou ajuda neste acompanhamento.</div>'}
    </div></article>`;
  }).join('') : '<div class="empty-state"><h3>Nenhum acompanhamento recebido</h3><p>As famílias poderão enviar atualizações após 7, 30 e 90 dias da adoção.</p></div>';
}

function renderDesaparecidosTab() {
  const records = Store.getMissing().filter(m => Number(m.ownerId) === currentUser.id);
  let sightings = [];
  try { sightings = Store.getSightings(); } catch { }
  const content = document.getElementById('tab-content');
  content.innerHTML = records.length ? `
    <table>
      <thead><tr><th>Animal</th><th>Cidade</th><th>Status</th><th>Avistamentos</th><th>Ações</th></tr></thead>
      <tbody>${records.map(m => {
        const count = sightings.filter(s => s.missingAnimalId === m.id).length;
        return `<tr>
          <td>${escapeHTML(m.name || 'Sem nome')}</td><td>${escapeHTML(m.city)}/${escapeHTML(m.state)}</td>
          <td>${m.found ? 'Encontrado' : 'Desaparecido'}</td><td>${count}</td>
          <td><a href="desaparecido.html?id=${Number(m.id)}" class="btn btn-outline btn-sm">Ver registro</a></td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : '<div class="empty-state"><h3>Nenhum animal desaparecido cadastrado por você.</h3><a href="cadastrar-desaparecido.html" class="btn btn-primary" style="margin-top:12px;">Cadastrar desaparecido</a></div>';
}

function markInterview(id) {
  try { Store.advanceRequestStage(id, 'entrevista'); renderSolicitacoesTab(); }
  catch (err) { showToast(err.message); }
}

function removeAnimal(id) {
  if (!confirm('Excluir este anúncio?')) return;
  try { Store.deleteAnimal(id); renderAnimaisTab(); }
  catch (err) { showToast(err.message); }
}

function respondRequest(id, status) {
  try {
    if (status === 'aceita') Store.acceptRequest(id);
    else Store.rejectRequest(id);
    renderSolicitacoesTab();
  } catch (err) { showToast(err.message); }
}

function activateDonorTab(tabId, renderer) {
  ['tab-animais', 'tab-solicitacoes', 'tab-desaparecidos', 'tab-acompanhamentos'].forEach(id => document.getElementById(id)?.classList.toggle('active', id === tabId));
  renderer();
}

document.addEventListener('DOMContentLoaded', () => {
  currentUser = Auth.requireAuth(['doador', 'admin']);
  if (!currentUser) return;
  document.getElementById('tab-animais')?.addEventListener('click', () => activateDonorTab('tab-animais', renderAnimaisTab));
  document.getElementById('tab-solicitacoes')?.addEventListener('click', () => activateDonorTab('tab-solicitacoes', renderSolicitacoesTab));
  document.getElementById('tab-desaparecidos')?.addEventListener('click', () => activateDonorTab('tab-desaparecidos', renderDesaparecidosTab));
  document.getElementById('tab-acompanhamentos')?.addEventListener('click', () => activateDonorTab('tab-acompanhamentos', renderAcompanhamentosTab));
  renderAnimaisTab();
});
