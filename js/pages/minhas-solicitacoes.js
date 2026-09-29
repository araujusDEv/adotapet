function renderMinhasSolicitacoes() {
  const user = Auth.requireAuth();
  if (!user) return;
  const requests = Store.getRequests().filter(r => r.requesterId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const followups = Store.getFollowups();
  const content = document.getElementById('content');
  if (requests.length === 0) {
    content.innerHTML = '<div class="empty-state"><h3>Você ainda não solicitou nenhuma adoção.</h3><a href="adotar.html" class="btn btn-primary" style="margin-top:12px;">Ver animais disponíveis</a></div>';
    return;
  }

  const steps = [
    { key: 'enviada', label: 'Interesse enviado' },
    { key: 'em_analise', label: 'Em análise' },
    { key: 'aprovada', label: 'Aprovada' },
    { key: 'entrevista', label: 'Entrevista / contato' },
    { key: 'concluida', label: 'Adoção concluída' }
  ];

  content.innerHTML = requests.map(r => {
    const animal = Store.getAnimal(r.animalId);
    const stalled = r.status === 'reprovada' || r.status === 'cancelada';
    const concluded = r.status === 'concluida' && r.stage === 'concluida';
    const normalizedStage = r.stage === 'enviado' ? 'enviada' : r.stage;
    const currentIdx = Math.max(0, steps.findIndex(s => s.key === normalizedStage));

    const stepperHTML = stalled
      ? `<div class="alert alert-error"><b>${escapeHTML(REQUEST_STATUS[r.status] || r.status)}</b>${r.rejectionReason ? `<br><span>Motivo informado: ${escapeHTML(r.rejectionReason)}</span>` : ''}</div>`
      : `<div class="request-stepper">${steps.map((s, i) => `
          <div class="request-step ${i <= currentIdx ? 'done' : ''}">
            <span class="request-step-dot">${i < currentIdx || (r.stage === 'concluida' && i <= currentIdx) ? svgIcon('check') : svgIcon('circle', i === currentIdx ? 'is-current' : '')}</span>
            <span>${s.label}</span>
          </div>`).join('')}</div>`;

    const storyHTML = !concluded ? '' : (r.story
      ? `<div id="story-block-${Number(r.id)}" style="margin-top:14px;padding:12px 14px;background:var(--color-bg-alt);border-radius:var(--radius-sm);">
          <b style="font-size:.85rem;">Sua história publicada:</b>
          <p style="margin:6px 0 0;font-size:.9rem;">${escapeHTML(r.story)}</p>
          <button class="btn btn-outline btn-sm" style="margin-top:8px;" data-action="editStory" data-arg-0="${Number(r.id)}">Editar história</button>
        </div>`
      : `<div id="story-form-${Number(r.id)}" style="margin-top:14px;"><button class="btn btn-outline btn-sm" data-action="showStoryForm" data-arg-0="${Number(r.id)}">Compartilhar minha história de adoção</button></div>`);

    const requestFollowups = followups.filter(f => f.requestId === r.id);
    const followupHTML = !concluded ? '' : `<div class="followup-panel">
      <b>Acompanhamento pós-adoção</b>
      <p style="font-size:.84rem;margin:5px 0;">Conte como está a adaptação em três momentos importantes. Se precisar de ajuda, o responsável será avisado.</p>
      <div class="followup-timeline">${[7, 30, 90].map(day => {
        const done = requestFollowups.find(f => f.day === day);
        const dueAt = new Date(new Date(r.completedAt || r.acceptedAt).getTime() + day * 86400000);
        const due = Date.now() >= dueAt.getTime();
        return `<div class="followup-step ${done ? 'done' : ''}" id="followup-step-${Number(r.id)}-${day}">
          <b>${day} dias ${done ? svgIcon('check') : ''}</b>
          <span>${done ? `Enviado em ${new Date(done.createdAt).toLocaleDateString('pt-BR')}` : due ? 'Disponível agora' : `Disponível em ${dueAt.toLocaleDateString('pt-BR')}`}</span>
          ${!done && due ? `<button class="btn btn-outline btn-sm" data-action="showFollowupForm" data-arg-0="${Number(r.id)}" data-arg-1="${day}">Responder</button>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;

    return `
      <div class="card" style="padding:20px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;font-size:1.1rem;">${escapeHTML(animal ? animal.name : 'Animal removido')}</h3>
          <span style="font-size:.82rem;color:var(--color-ink-soft);">Enviado em ${new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
        ${stepperHTML}
        ${r.status === 'aprovada' ? '<div class="alert alert-success" style="margin-top:14px"><b>Sua solicitação foi aprovada.</b><br>O responsável deverá entrar em contato para combinar entrevista, visita e próximos passos. A adoção só estará concluída após a confirmação final.</div>' : ''}
        ${concluded && (r.completedAt || r.acceptedAt) ? `<p style="font-size:.82rem;color:var(--color-ink-soft);margin:10px 0 0;">Adoção concluída em ${new Date(r.completedAt || r.acceptedAt).toLocaleDateString('pt-BR')}</p>` : ''}
        ${concluded ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><a href="contrato.html?request=${Number(r.id)}" class="btn btn-primary btn-sm">Abrir termo de adoção</a></div>` : ''}
        ${['pendente','em_analise','aprovada'].includes(r.status) ? `<button class="btn btn-outline btn-sm" style="margin-top:12px" data-action="cancelMyRequest" data-arg-0="${Number(r.id)}">Cancelar solicitação</button>` : ''}
        ${followupHTML}
        ${storyHTML}
      </div>`;
  }).join('');
}

function cancelMyRequest(id) {
  if (!confirm('Deseja cancelar esta solicitação?')) return;
  try { Store.cancelRequest(id); renderMinhasSolicitacoes(); showToast('Solicitação cancelada.'); }
  catch (err) { showToast(err.message); }
}

function showFollowupForm(requestId, day) {
  const el = document.getElementById(`followup-step-${requestId}-${day}`); if (!el) return;
  el.outerHTML = `<div class="followup-step" id="followup-step-${requestId}-${day}">
    <b>Acompanhamento de ${day} dias</b><div id="followup-alert-${requestId}-${day}"></div>
    <label>Como está a adaptação?<select id="followup-adaptation-${requestId}-${day}"><option value="otima">Ótima</option><option value="boa">Boa, ainda adaptando</option><option value="dificil">Difícil</option></select></label>
    <label>Saúde<textarea rows="2" id="followup-health-${requestId}-${day}" placeholder="Vacinas, consultas, alimentação..."></textarea></label>
    <label>Comportamento<textarea rows="2" id="followup-behavior-${requestId}-${day}" placeholder="Rotina, convivência, dificuldades..."></textarea></label>
    <label class="checkbox-row"><input type="checkbox" id="followup-help-${requestId}-${day}"> Preciso de orientação ou apoio</label>
    <label>Foto opcional<input type="file" accept="image/png,image/jpeg,image/webp" id="followup-photo-${requestId}-${day}"></label>
    <button class="btn btn-primary btn-sm" data-action="submitFollowup" data-arg-0="${requestId}" data-arg-1="${day}">Enviar acompanhamento</button>
  </div>`;
}

function followupFileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 3 * 1024 * 1024) return reject(new Error('A foto deve ter no máximo 3 MB.'));
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler a foto.')); reader.readAsDataURL(file);
  });
}

async function submitFollowup(requestId, day) {
  const alert = document.getElementById(`followup-alert-${requestId}-${day}`);
  try {
    const file = document.getElementById(`followup-photo-${requestId}-${day}`)?.files?.[0];
    Store.createFollowup({
      requestId, day, adaptation: document.getElementById(`followup-adaptation-${requestId}-${day}`).value,
      health: document.getElementById(`followup-health-${requestId}-${day}`).value,
      behavior: document.getElementById(`followup-behavior-${requestId}-${day}`).value,
      needsHelp: document.getElementById(`followup-help-${requestId}-${day}`).checked,
      photo: await followupFileToBase64(file)
    });
    renderMinhasSolicitacoes();
  } catch (err) { if (alert) alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`; }
}

function storyFormHTML(id, value = '', buttonLabel = 'Publicar história') {
  return `
    <div id="story-form-${Number(id)}" style="margin-top:14px;">
      <div id="story-alert-${Number(id)}"></div>
      <textarea rows="3" id="story-text-${Number(id)}" placeholder="Conte como está a adaptação e a convivência com o novo membro da família...">${escapeHTML(value)}</textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:8px;" data-action="submitStory" data-arg-0="${Number(id)}">${buttonLabel}</button>
    </div>`;
}

function showStoryForm(id) {
  const el = document.getElementById(`story-form-${id}`);
  if (el) el.outerHTML = storyFormHTML(id);
}

function editStory(id) {
  const request = Store.getRequests().find(r => r.id === Number(id));
  const block = document.getElementById(`story-block-${id}`);
  if (!request || !block) return;
  block.outerHTML = storyFormHTML(id, request.story || '', 'Salvar');
}

function submitStory(id) {
  const text = document.getElementById(`story-text-${id}`)?.value.trim() || '';
  if (!text) {
    const alert = document.getElementById(`story-alert-${id}`);
    if (alert) alert.innerHTML = '<div class="alert alert-error">Escreva uma mensagem antes de publicar.</div>';
    return;
  }
  try {
    Store.addAdoptionStory(id, text);
    renderMinhasSolicitacoes();
  } catch (err) {
    const alert = document.getElementById(`story-alert-${id}`);
    if (alert) alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', renderMinhasSolicitacoes);
