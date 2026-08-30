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

function requestAnswer(value, labels = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'Não informado';
  return labels[normalized] || normalized;
}

function yesNoAnswer(value) {
  if (value === true || value === 'sim') return 'Sim';
  if (value === false || value === 'nao') return 'Não';
  return 'Não informado';
}

function requestQuestionnaireHTML(request) {
  const questionnaire = request.questionnaire || {};
  const housingLabels = { casa: 'Casa', apartamento: 'Apartamento', sitio: 'Sítio / chácara' };
  const aloneTimeLabels = {
    menos_2h: 'Menos de 2 horas',
    '2_4h': '2 a 4 horas',
    '4_8h': '4 a 8 horas',
    mais_8h: 'Mais de 8 horas'
  };
  const answer = (label, value) => `
    <div class="request-questionnaire-item">
      <span>${escapeHTML(label)}</span>
      <b>${escapeHTML(value)}</b>
    </div>`;

  return `
    <div class="request-questionnaire-grid">
      ${answer('Idade', requestAnswer(request.age))}
      ${answer('Cidade', requestAnswer(request.city))}
      ${answer('Tipo de moradia', requestAnswer(request.housing, housingLabels))}
      ${answer('Possui quintal', yesNoAnswer(request.has_yard))}
      ${answer('Possui outros animais', yesNoAnswer(request.has_pets))}
      ${answer('Experiência com animais', yesNoAnswer(request.experience))}
      ${answer('Todos da residência concordam', yesNoAnswer(questionnaire.household_agrees))}
      ${answer('Possui condições financeiras', yesNoAnswer(questionnaire.financial_conditions))}
      ${answer('Tempo que ficará sozinho', requestAnswer(questionnaire.alone_time, aloneTimeLabels))}
      ${answer('Já teve animais anteriormente', yesNoAnswer(questionnaire.had_pets_before))}
      ${answer('Compromisso com cuidados veterinários', yesNoAnswer(questionnaire.vet_commitment))}
      ${answer('Compromisso com adoção responsável', yesNoAnswer(request.responsibility_confirmed))}
    </div>
    <div class="request-questionnaire-text">
      <span>Motivo da adoção</span>
      <p>${escapeHTML(requestAnswer(request.reason))}</p>
    </div>
    <div class="request-questionnaire-text">
      <span>Plano em caso de dificuldade de adaptação</span>
      <p>${escapeHTML(requestAnswer(questionnaire.adaptation_plan))}</p>
    </div>`;
}

function renderSolicitacoesTab() {
  const requests = Store.getRequests().filter(r => {
    const animal = Store.getAnimal(r.animalId);
    return animal && Number(animal.ownerId) === currentUser.id;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const content = document.getElementById('tab-content');
  if (!requests.length) {
    content.innerHTML = '<div class="empty-state"><h3>Nenhuma solicitação recebida ainda.</h3><p>Quando alguém demonstrar interesse em um animal, a solicitação aparecerá aqui.</p></div>';
    return;
  }

  content.innerHTML = `<div class="request-review-list">${requests.map(request => {
    const animal = Store.getAnimal(request.animalId);
    const requestId = Number(request.id);
    const requestDate = request.createdAt ? new Date(request.createdAt).toLocaleDateString('pt-BR') : 'Não informada';
    let actions = '';

    if (request.status === 'pendente' && request.stage === 'em_analise') {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="markInterview(${requestId})">Marcar entrevista</button>
        <button class="btn btn-outline btn-sm" onclick="respondRequest(${requestId}, 'recusada')">Recusar solicitação</button>`;
    } else if (request.status === 'pendente' && request.stage === 'entrevista') {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="respondRequest(${requestId}, 'aceita')">Aprovar adoção</button>
        <button class="btn btn-outline btn-sm" onclick="respondRequest(${requestId}, 'recusada')">Recusar solicitação</button>`;
    } else if (request.status === 'aceita') {
      actions = `<a class="btn btn-outline btn-sm" href="contrato.html?request=${requestId}">Ver termo</a>`;
    }

    return `
      <article class="card request-review-card">
        <div class="request-review-summary">
          <div><span>Animal</span><b>${escapeHTML(animal ? animal.name : 'Não encontrado')}</b></div>
          <div><span>Interessado</span><b>${escapeHTML(request.full_name || 'Não informado')}</b></div>
          <div><span>Solicitação</span><b>${escapeHTML(requestDate)}</b></div>
          <div><span>Status</span><b>${escapeHTML(REQUEST_STATUS[request.status] || request.status)}</b></div>
          <div><span>Etapa</span><b>${escapeHTML(REQUEST_STAGE_LABEL[request.stage] || request.stage || 'Não informada')}</b></div>
        </div>
        <details class="request-questionnaire">
          <summary>Ver questionário respondido</summary>
          <div class="request-questionnaire-content">
            <h3>Respostas do interessado</h3>
            ${requestQuestionnaireHTML(request)}
          </div>
        </details>
        ${actions ? `<div class="request-actions">${actions}</div>` : ''}
      </article>`;
  }).join('')}</div>`;
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
  const message = status === 'aceita'
    ? 'Confirma a aprovação desta adoção? As outras solicitações para o animal serão encerradas.'
    : 'Confirma que deseja recusar esta solicitação?';
  if (!confirm(message)) return;
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
