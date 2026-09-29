'use strict';
const CAMPAIGN_CATEGORIES = { cirurgia: 'Cirurgia', tratamento: 'Tratamento', alimentacao: 'Alimentação', acolhimento: 'Acolhimento' };
const CAMPAIGN_KEY_TYPES = { aleatoria: 'Chave aleatória', email: 'E-mail', telefone: 'Telefone', cpf: 'CPF', cnpj: 'CNPJ' };
const campaignMoney = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const campaignDate = value => new Date(value).toLocaleDateString('pt-BR');
let fundraisingCampaigns = [];
let fundraisingAdmin = false;
let editingCampaign = null;

function campaignStatus(campaign) {
  return campaign.status === 'draft' ? 'Rascunho' : campaign.status === 'closed' ? 'Encerrada' : campaign.canDonate ? 'Aberta' : 'Pausada';
}
function campaignProgress(campaign) {
  const percent = Math.min(100, Math.round(campaign.raisedCents / campaign.goalCents * 100));
  return `<div class="fund-progress-label"><strong>${campaignMoney(campaign.raisedCents)}</strong><span>meta ${campaignMoney(campaign.goalCents)}</span></div>
    <progress class="fund-progress" max="100" value="${percent}" aria-label="${percent}% da meta informados como arrecadados">${percent}%</progress>
    <div class="fund-card-meta"><span>${percent}% da meta</span><span>Total atualizado manualmente</span></div>`;
}
function renderCampaigns() {
  const search = document.getElementById('campaign-search').value.trim().toLocaleLowerCase('pt-BR');
  const category = document.getElementById('campaign-category').value;
  const status = document.getElementById('campaign-status').value;
  const visible = fundraisingCampaigns.filter(c => {
    const haystack = `${c.title} ${c.animalName} ${c.organizer} ${c.city}`.toLocaleLowerCase('pt-BR');
    const matchesStatus = status === 'all' || (status === 'active' ? c.canDonate : status === 'closed' ? c.status === 'closed' || (c.status === 'active' && !c.canDonate) : c.status === 'draft');
    return matchesStatus && (!category || c.category === category) && (!search || haystack.includes(search));
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('campaign-count').textContent = `${visible.length} ${visible.length === 1 ? 'campanha encontrada' : 'campanhas encontradas'}`;
  const published = fundraisingCampaigns.filter(c => c.status !== 'draft');
  document.getElementById('fund-active').textContent = published.filter(c => c.canDonate).length;
  document.getElementById('fund-raised').textContent = campaignMoney(published.reduce((sum, c) => sum + c.raisedCents, 0));
  document.getElementById('campaign-results').innerHTML = visible.length ? visible.map(c => {
    const photo = safeImageSrc(c.photo);
    return `<article class="fund-card">
      <div class="fund-card-cover">${photo ? `<img src="${escapeAttr(photo)}" alt="${escapeAttr(c.animalName)}" loading="lazy">` : svgIcon('paw')}<span class="fund-card-category">${escapeHTML(CAMPAIGN_CATEGORIES[c.category])}</span></div>
      <div class="fund-card-body"><p class="fund-card-location">${escapeHTML(c.animalName)} · ${escapeHTML(c.city)}/${escapeHTML(c.state)}</p>
        <h3>${escapeHTML(c.title)}</h3><p class="fund-card-summary">${escapeHTML(c.description)}</p>
        <div class="fund-progress-block">${campaignProgress(c)}</div>
        <button type="button" class="btn ${c.canDonate ? 'btn-primary' : 'btn-outline'}" data-fund-open="${c.id}">${c.canDonate ? svgIcon('heart') + ' Quero ajudar' : campaignStatus(c) + ' · Ver detalhes'}</button>
        ${fundraisingAdmin ? `<button type="button" class="btn btn-ghost fund-edit" data-fund-edit="${c.id}">Editar campanha</button>` : ''}
      </div></article>`;
  }).join('') : `<div class="fund-empty">${svgIcon('heart')}<h3>${fundraisingCampaigns.length ? 'Nenhuma campanha com esses filtros' : 'O próximo gesto de cuidado pode começar aqui'}</h3><p>${fundraisingCampaigns.length ? 'Tente outra causa, situação ou nome para encontrar um pet.' : 'Ainda não há campanhas publicadas. Conhece um pet que precisa de ajuda? Envie a história para nossa equipe.'}</p>${fundraisingCampaigns.length ? '<button type="button" class="btn btn-outline" id="clear-fund-filters">Limpar filtros</button>' : '<a class="btn btn-outline" href="contato.html">Sugerir uma campanha</a>'}</div>`;
  document.getElementById('clear-fund-filters')?.addEventListener('click', () => {
    document.getElementById('campaign-search').value = '';
    document.getElementById('campaign-category').value = '';
    document.getElementById('campaign-status').value = 'all';
    renderCampaigns();
  });
}
async function loadCampaigns() {
  const results = document.getElementById('campaign-results');
  const alert = document.getElementById('campaign-error');
  results.setAttribute('aria-busy', 'true');
  try {
    fundraisingCampaigns = await Store.getCampaigns();
    alert.hidden = true;
    renderCampaigns();
    return true;
  } catch (error) {
    results.innerHTML = '';
    alert.className = 'fund-error'; alert.hidden = false;
    alert.textContent = error.message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'btn btn-outline btn-sm'; retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', loadCampaigns); alert.append(' ', retry);
    return false;
  } finally { results.setAttribute('aria-busy', 'false'); }
}
async function openDonation(id, refresh = true) {
  if (refresh && !await loadCampaigns()) return;
  const c = fundraisingCampaigns.find(item => item.id === Number(id));
  if (!c) { showToast('Esta campanha não está disponível.'); return; }
  const dialog = document.getElementById('donation-dialog');
  document.getElementById('donation-detail').innerHTML = `
    <div class="fund-dialog-head"><div><span class="eyebrow">${escapeHTML(CAMPAIGN_CATEGORIES[c.category])} · ${campaignStatus(c)}</span><h2 id="donation-title">${escapeHTML(c.title)}</h2></div><button class="fund-close" id="close-donation" type="button" aria-label="Fechar campanha">×</button></div>
    <div class="fund-detail-body"><p class="fund-small">Para ${escapeHTML(c.animalName)} · ${escapeHTML(c.city)}/${escapeHTML(c.state)}</p>
    <p class="fund-story">${escapeHTML(c.description)}</p>${campaignProgress(c)}
    <p class="fund-contact"><strong>Organização ou responsável:</strong> ${escapeHTML(c.organizer)}<br><strong>Contato:</strong> ${escapeHTML(c.contact)}</p>
    ${c.canDonate ? `<section class="fund-payment" aria-labelledby="pix-title"><h3 id="pix-title">Ajude com um Pix</h3><p>Escolha o valor no aplicativo do seu banco.</p><p><strong>Beneficiário:</strong> ${escapeHTML(c.beneficiary)}</p>
      <label for="campaign-pix-key">${escapeHTML(CAMPAIGN_KEY_TYPES[c.pixKeyType])}</label><div class="fund-key-row"><input id="campaign-pix-key" value="${escapeAttr(c.pixKey)}" readonly spellcheck="false"><button type="button" id="copy-pix" class="btn btn-primary">Copiar chave</button></div>
      <p class="fund-pix-check">Antes de confirmar o Pix, confira se o nome do recebedor no banco corresponde a <strong>${escapeHTML(c.beneficiary)}</strong>. Em caso de diferença, fale com o responsável.</p><p id="copy-pix-status" class="fund-small" role="status"></p></section>` : '<div class="fund-payment"><h3>Esta campanha não está recebendo doações</h3><p>Você pode acompanhar as atualizações e conhecer outras campanhas abertas.</p></div>'}
    <h3>Atualizações da arrecadação</h3>${c.updates.length ? `<ul class="fund-updates">${[...c.updates].reverse().map(u => `<li><time datetime="${escapeAttr(u.createdAt)}">${campaignDate(u.createdAt)}</time> · <strong>${campaignMoney(u.raisedCents)} informados</strong><p>${escapeHTML(u.note)}</p></li>`).join('')}</ul>` : '<p class="fund-small">Ainda não há atualizações publicadas pelo responsável.</p>'}
    <div class="fund-detail-actions">${c.animalUrl ? `<a class="btn btn-outline btn-sm" href="${escapeAttr(c.animalUrl)}">Conhecer o pet</a>` : ''}<button type="button" id="share-campaign" class="btn btn-outline btn-sm">Compartilhar campanha</button></div>
    <p class="fund-small">Última atualização: ${campaignDate(c.updatedAt)}. O total é informado manualmente pela administração. Copiar a chave ou compartilhar não registra uma doação.</p></div>`;
  document.getElementById('close-donation').addEventListener('click', () => dialog.close());
  document.getElementById('copy-pix')?.addEventListener('click', async () => {
    const status = document.getElementById('copy-pix-status');
    try {
      await navigator.clipboard.writeText(c.pixKey);
      status.textContent = 'Chave copiada. Abra seu banco e confira o beneficiário antes de confirmar.';
    } catch {
      const input = document.getElementById('campaign-pix-key'); input.focus(); input.select();
      status.textContent = 'Selecione e copie a chave acima para usar no seu banco.';
    }
  });
  document.getElementById('share-campaign').addEventListener('click', async () => {
    const url = new URL('doacoes.html', location.href); url.searchParams.set('campanha', c.id);
    try {
      if (navigator.share) await navigator.share({ title: c.title, text: `Ajude ${c.animalName}`, url: url.href });
      else { await navigator.clipboard.writeText(url.href); showToast('Link da campanha copiado.'); }
    } catch (error) {
      if (error.name !== 'AbortError') {
        const link = document.createElement('input'); link.value = url.href; link.readOnly = true; link.setAttribute('aria-label', 'Link para compartilhar');
        document.querySelector('.fund-detail-actions').appendChild(link); link.focus(); link.select();
        showToast('Copie o link selecionado para compartilhar.');
      }
    }
  });
  if (!dialog.open) dialog.showModal();
}
function openCampaignEditor(id = null) {
  if (!fundraisingAdmin) return;
  const campaign = id === null ? null : fundraisingCampaigns.find(c => c.id === Number(id));
  if (id !== null && !campaign) return;
  let animals;
  try { animals = Store.getAnimals().filter(a => ['disponivel', 'em_processo', 'adotado'].includes(a.status)); }
  catch (error) { showToast(error.message); return; }
  editingCampaign = campaign;
  const form = document.getElementById('campaign-form'); form.reset();
  document.getElementById('editor-error').hidden = true;
  document.getElementById('editor-title').textContent = campaign ? 'Editar campanha' : 'Nova campanha';
  const animalSelect = document.getElementById('cf-animal');
  animalSelect.innerHTML = '<option value="">Selecione um pet</option>' + animals.map(a => `<option value="${a.id}">${escapeHTML(a.name)} · ${escapeHTML(a.city)}</option>`).join('');
  if (campaign && !animals.some(a => a.id === campaign.animalId)) {
    const option = document.createElement('option'); option.value = campaign.animalId; option.textContent = `${campaign.animalName} (perfil indisponível)`; animalSelect.appendChild(option);
  }
  animalSelect.disabled = Boolean(campaign);
  if (campaign) {
    const fields = { animal: campaign.animalId, title: campaign.title, description: campaign.description, category: campaign.category, status: campaign.status,
      goal: (campaign.goalCents / 100).toFixed(2), raised: (campaign.raisedCents / 100).toFixed(2), organizer: campaign.organizer, contact: campaign.contact,
      beneficiary: campaign.beneficiary, 'key-type': campaign.pixKeyType, key: campaign.pixKey };
    for (const [key, value] of Object.entries(fields)) document.getElementById(`cf-${key}`).value = value;
  }
  document.getElementById('campaign-editor').showModal();
}
function campaignCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('Informe os valores com até duas casas decimais.');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
async function saveCampaign(event) {
  event.preventDefault();
  const button = document.getElementById('save-campaign'), alert = document.getElementById('editor-error');
  button.disabled = true; alert.hidden = true;
  try {
    const value = key => document.getElementById(`cf-${key}`).value;
    const data = { animalId: Number(value('animal')), title: value('title'), description: value('description'), category: value('category'), status: value('status'),
      goalCents: campaignCents(value('goal')), raisedCents: campaignCents(value('raised')), progressNote: value('note'), organizer: value('organizer'),
      contact: value('contact'), beneficiary: value('beneficiary'), pixKeyType: value('key-type'), pixKey: value('key'), recipientConfirmed: document.getElementById('cf-confirm').checked };
    if (editingCampaign) await Store.updateCampaign(editingCampaign.id, { ...data, revision: editingCampaign.revision });
    else await Store.createCampaign(data);
    document.getElementById('campaign-editor').close();
    document.getElementById('campaign-status').value = data.status === 'draft' ? 'draft' : 'all';
    await loadCampaigns(); showToast('Campanha salva.');
  } catch (error) {
    alert.className = 'fund-error'; alert.textContent = error.message; alert.hidden = false; alert.scrollIntoView({ block: 'nearest' });
  } finally { button.disabled = false; }
}
document.addEventListener('DOMContentLoaded', async () => {
  try { fundraisingAdmin = Auth.getCurrentUser()?.role === 'admin'; } catch { fundraisingAdmin = false; }
  document.getElementById('new-campaign').hidden = !fundraisingAdmin;
  document.getElementById('draft-filter').hidden = !fundraisingAdmin;
  document.getElementById('campaign-search').addEventListener('input', renderCampaigns);
  for (const id of ['campaign-category', 'campaign-status']) document.getElementById(id).addEventListener('change', renderCampaigns);
  document.getElementById('new-campaign').addEventListener('click', () => openCampaignEditor());
  document.getElementById('campaign-results').addEventListener('click', event => {
    const open = event.target.closest('[data-fund-open]'), edit = event.target.closest('[data-fund-edit]');
    if (open) openDonation(open.dataset.fundOpen);
    if (edit) openCampaignEditor(edit.dataset.fundEdit);
  });
  document.getElementById('campaign-form').addEventListener('submit', saveCampaign);
  for (const id of ['close-editor', 'cancel-editor']) document.getElementById(id).addEventListener('click', () => document.getElementById('campaign-editor').close());
  if (await loadCampaigns()) {
    const id = new URLSearchParams(location.search).get('campanha');
    if (id) await openDonation(Number(id), false);
  }
});
