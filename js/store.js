/* ==========================================================================
   store.js — Cliente da API do AdotaPet.
   Os dados agora ficam em um banco SQLite no servidor (server.js).
   A sessão é mantida por cookie HttpOnly; o JavaScript não acessa senhas nem tokens.
   ========================================================================== */

const DB_KEYS = {}; // sessão autenticada por cookie HttpOnly no servidor

const ANIMAL_STATUS = {
  aguardando_aprovacao: 'Aguardando aprovação',
  disponivel: 'Disponível',
  em_processo: 'Em processo de adoção',
  adotado: 'Adotado',
  indisponivel: 'Indisponível'
};

const REQUEST_STATUS = {
  pendente: 'Pendente',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  reprovada: 'Reprovada',
  cancelada: 'Cancelada',
  concluida: 'Adoção concluída'
};

const REQUEST_STAGES = ['enviada', 'em_analise', 'aprovada', 'entrevista', 'concluida'];
const REQUEST_STAGE_LABEL = {
  enviada: 'Interesse enviado',
  enviado: 'Interesse enviado',
  em_analise: 'Em análise',
  aprovada: 'Solicitação aprovada',
  entrevista: 'Entrevista / contato',
  concluida: 'Adoção concluída'
};

const COEXISTENCE_LABEL = { sim: 'Sim', nao: 'Não', nao_informado: 'Não informado' };
const ENERGY_LABEL = { baixo: 'Baixa', medio: 'Média', alto: 'Alta' };
const REPORT_CATEGORY_LABEL = {
  informacao_falsa: 'Informação falsa',
  maus_tratos: 'Suspeita de maus-tratos',
  ja_adotado: 'Animal já foi adotado',
  duplicado: 'Anúncio duplicado',
  spam: 'Spam / conteúdo indevido',
  outro: 'Outro'
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[c]);
}
function escapeAttr(value) { return escapeHTML(value); }
function safeImageSrc(value) {
  const src = String(value || '');
  if (/^img\/[A-Za-z0-9._/-]+$/.test(src)) return src;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(src)) return src;
  return '';
}

function animalNeedsAttention(animal) {
  if (!animal) return false;
  const created = new Date(animal.createdAt).getTime();
  const daysWaiting = Number.isFinite(created) ? (Date.now() - created) / 86400000 : 0;
  return Boolean(animal.special_needs) || animal.age_group === 'idoso' || daysWaiting > 60;
}

function apiRequest(method, url, body, options = {}) {
  if (window.location.protocol === 'file:') {
    throw new Error('Esta versão usa servidor e SQLite. Execute "node server.js" e abra http://127.0.0.1:3000.');
  }
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false);
  xhr.setRequestHeader('Accept', 'application/json');
  if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
  try {
    xhr.send(body === undefined ? null : JSON.stringify(body));
  } catch {
    throw new Error('Não foi possível conectar ao servidor do AdotaPet. Confirme se "node server.js" está em execução.');
  }
  let payload = null;
  try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { payload = null; }
  if (xhr.status >= 200 && xhr.status < 300) return payload;
  if (options.allow401 && xhr.status === 401) return null;
  const err = new Error(payload?.error || `Erro ${xhr.status || 'de conexão'} ao acessar o servidor.`);
  err.status = xhr.status;
  throw err;
}

async function apiRequestAsync(method, url, body, options = {}) {
  if (window.location.protocol === 'file:') throw new Error('Execute o servidor e acesse o endereço local informado no terminal.');
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin'
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor do AdotaPet.');
  }
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.ok) return payload;
  if (options.allow401 && response.status === 401) return null;
  const err = new Error(payload?.error || `Erro ${response.status} ao acessar o servidor.`);
  err.status = response.status;
  throw err;
}

const Store = {
  getAnimalOwnerName(id) { return apiRequest('GET', `/api/animals/${Number(id)}/public-name`); },
  getUsers() { return apiRequest('GET', '/api/users') || []; },
  deleteUser(id) { return apiRequest('DELETE', `/api/users/${Number(id)}`); },
  approveUser(id) { return apiRequest('POST', `/api/users/${Number(id)}/approve`, {}); },
  rejectUser(id, reason = '') { return apiRequest('POST', `/api/users/${Number(id)}/reject`, { reason }); },
  updateMyProfile(changes) { return apiRequest('PATCH', '/api/users/me', changes || {}); },

  getAnimals() { return apiRequest('GET', '/api/animals') || []; },
  getAnimal(id) { return this.getAnimals().find(a => a.id === Number(id)) || null; },
  createAnimal(animal) { return apiRequest('POST', '/api/animals', animal); },
  updateAnimal(id, changes) {
    if (changes && Object.keys(changes).length === 1 && Object.prototype.hasOwnProperty.call(changes, 'views')) {
      apiRequest('POST', `/api/animals/${Number(id)}/view`, {});
      return this.getAnimal(id);
    }
    return apiRequest('PATCH', `/api/animals/${Number(id)}`, changes || {});
  },
  incrementAnimalView(id) { return apiRequest('POST', `/api/animals/${Number(id)}/view`, {}); },
  deleteAnimal(id) { return apiRequest('DELETE', `/api/animals/${Number(id)}`); },
  isAnimalAvailable(animal) { return Boolean(animal && animal.status === 'disponivel'); },

  getRequests() { return apiRequest('GET', '/api/requests') || []; },
  getPublicStories() { return apiRequest('GET', '/api/stories') || []; },
  createRequest(reqData) { return apiRequest('POST', '/api/requests', reqData); },
  analyzeRequest(id) { return apiRequest('POST', `/api/requests/${Number(id)}/analyze`, {}); },
  approveRequest(id) { return apiRequest('POST', `/api/requests/${Number(id)}/approve`, {}); },
  acceptRequest(id) { return this.approveRequest(id); },
  rejectRequest(id, reason = '') { return apiRequest('POST', `/api/requests/${Number(id)}/reject`, { reason }); },
  completeRequest(id) { return apiRequest('POST', `/api/requests/${Number(id)}/complete`, {}); },
  cancelRequest(id, reason = '') { return apiRequest('POST', `/api/requests/${Number(id)}/cancel`, { reason }); },
  advanceRequestStage(id, stage) {
    if (stage !== 'entrevista') throw new Error('Etapa inválida.');
    return apiRequest('POST', `/api/requests/${Number(id)}/interview`, {});
  },
  addAdoptionStory(id, story) { return apiRequest('POST', `/api/requests/${Number(id)}/story`, { story }); },

  getFavorites() { return apiRequest('GET', '/api/favorites') || []; },
  toggleFavorite(userId, animalId) {
    const result = apiRequest('POST', '/api/favorites/toggle', { animalId: Number(animalId) });
    return Boolean(result?.favorite);
  },

  getMissing() { return apiRequest('GET', '/api/missing') || []; },
  getMissingById(id) { return this.getMissing().find(m => m.id === Number(id)) || null; },
  createMissing(data) { return apiRequest('POST', '/api/missing', data); },
  updateMissing(id, changes) { return apiRequest('PATCH', `/api/missing/${Number(id)}`, changes || {}); },

  getSightings() { return apiRequest('GET', '/api/sightings') || []; },
  createSighting(data) { return apiRequest('POST', '/api/sightings', data); },

  getReports() { return apiRequest('GET', '/api/reports') || []; },
  createReport(data) { return apiRequest('POST', '/api/reports', data); },
  resolveReport(id) { return apiRequest('POST', `/api/reports/${Number(id)}/resolve`, {}); },

  getAdoptionProfile(userId) { return apiRequest('GET', '/api/adoption-profile', undefined, { allow401: true }); },
  saveAdoptionProfile(userId, answers) { return apiRequest('POST', '/api/adoption-profile', answers || {}); },

  getNotifications(userId) { return apiRequest('GET', '/api/notifications') || []; },
  markNotificationsRead(userId) { return apiRequest('POST', '/api/notifications/read', {}); },

  getAdminLog() { return apiRequest('GET', '/api/admin-log') || []; },
  logAction(adminId, message) { return apiRequest('POST', '/api/admin-log', { message }); },

  getPublicStats() { return apiRequest('GET', '/api/stats') || {}; },
  getContract(requestId) { return apiRequest('GET', `/api/contracts/${Number(requestId)}`); },
  acknowledgeContract(requestId) { return apiRequest('POST', `/api/contracts/${Number(requestId)}/acknowledge`, {}); },
  getFollowups() { return apiRequest('GET', '/api/followups') || []; },
  createFollowup(data) { return apiRequest('POST', '/api/followups', data); },
  getCampaigns() { return apiRequestAsync('GET', '/api/campaigns'); },
  createCampaign(data) { return apiRequestAsync('POST', '/api/campaigns', data); },
  updateCampaign(id, data) { return apiRequestAsync('PATCH', '/api/campaigns/' + Number(id), data); },
  getSupportPoints() { return apiRequest('GET', '/api/support-points') || []; },
  createSupportPoint(data) { return apiRequest('POST', '/api/support-points', data); },
  deleteSupportPoint(id) { return apiRequest('DELETE', `/api/support-points/${Number(id)}`); }
};

function computeCompatibility(profile, animal) {
  let earned = 0;
  let total = 0;
  const reasons = [];
  const warnings = [];

  total += 3;
  if (!profile.species || profile.species === 'qualquer') earned += 3;
  else if (profile.species === animal.species) { earned += 3; reasons.push('Espécie combina com sua preferência'); }
  else warnings.push(`Você prefere ${profile.species === 'cachorro' ? 'cães' : 'gatos'}, e este animal é ${animal.species === 'cachorro' ? 'um cão' : 'um gato'}.`);

  total += 2;
  if (!profile.size || profile.size === 'qualquer' || profile.size === animal.size) { earned += 2; if (profile.size && profile.size !== 'qualquer') reasons.push('Porte compatível'); }
  else warnings.push('Porte diferente do que você prefere.');

  total += 2;
  if (!profile.age || profile.age === 'qualquer' || profile.age === animal.age_group) { earned += 2; if (profile.age && profile.age !== 'qualquer') reasons.push('Faixa etária compatível'); }
  else warnings.push('Faixa etária diferente do que você prefere.');

  total += 3;
  const energyOrder = { baixo: 0, medio: 1, alto: 2 };
  if (profile.energy && animal.energy_level && profile.energy in energyOrder && animal.energy_level in energyOrder) {
    const diff = Math.abs(energyOrder[profile.energy] - energyOrder[animal.energy_level]);
    if (diff === 0) { earned += 3; reasons.push('Nível de energia compatível'); }
    else if (diff === 1) earned += 1.5;
    else warnings.push(`${animal.name} possui nível de energia ${(ENERGY_LABEL[animal.energy_level] || animal.energy_level).toLowerCase()} e pode não combinar com o ritmo que você procura.`);
  } else earned += 1.5;

  total += 2;
  if (profile.has_kids === 'sim' && animal.coexistence) {
    if (animal.coexistence.kids === 'sim') { earned += 2; reasons.push('Convive bem com crianças'); }
    else if (animal.coexistence.kids === 'nao') warnings.push(`${animal.name} pode não se adaptar bem à convivência com crianças.`);
    else earned += 1;
  } else earned += 2;

  total += 2;
  if (profile.other_pets && profile.other_pets !== 'nao' && animal.coexistence) {
    const key = profile.other_pets === 'cachorro' ? 'dogs' : profile.other_pets === 'gato' ? 'cats' : null;
    if (key && animal.coexistence[key] === 'sim') { earned += 2; reasons.push('Pode viver com os outros animais que você já tem'); }
    else if (key && animal.coexistence[key] === 'nao') warnings.push(`${animal.name} pode não se adaptar bem com outros animais em casa.`);
    else earned += 1;
  } else earned += 2;

  total += 2;
  if (profile.alone_time === 'mais_8h' && (animal.energy_level === 'alto' || (animal.personality && animal.personality.sociability >= 4))) {
    warnings.push(`${animal.name} é bastante sociável/ativo e pode sofrer ficando muito tempo sozinho.`);
  } else { earned += 2; reasons.push('Pode viver em ambiente semelhante ao informado'); }

  total += 2;
  if (profile.housing === 'apartamento' && (animal.size === 'grande' || animal.energy_level === 'alto')) {
    if (animal.size === 'grande') warnings.push(`${animal.name} é de porte grande — avalie se seu apartamento comporta o espaço necessário.`);
    else earned += 1;
  } else { earned += 2; reasons.push('Ambiente de moradia adequado ao perfil do animal'); }

  const score = Math.round((earned / total) * 100);
  return { score: Math.max(0, Math.min(100, score)), reasons, warnings };
}

// Mantido por compatibilidade com as páginas antigas. O seed agora é feito pelo servidor.
function seedDatabase() {}

// Delegated handlers also support buttons rendered dynamically, without inline scripts.
const clickActions = {
  'handleToggleFavorite': (...args) => handleToggleFavorite(...args),
  'approveAnimal': (...args) => approveAnimal(...args),
  'rejectAnimal': (...args) => rejectAnimal(...args),
  'toggleVerified': (...args) => toggleVerified(...args),
  'toggleFeatured': (...args) => toggleFeatured(...args),
  'approveOrganization': (...args) => approveOrganization(...args),
  'rejectOrganization': (...args) => rejectOrganization(...args),
  'removeUser': (...args) => removeUser(...args),
  'handleResolveReport': (...args) => handleResolveReport(...args),
  'removeSupportPoint': (...args) => removeSupportPoint(...args),
  'setActivePhoto': (...args) => setActivePhoto(...args),
  'shareMissing': (...args) => shareMissing(...args),
  'editStory': (...args) => editStory(...args),
  'showStoryForm': (...args) => showStoryForm(...args),
  'showFollowupForm': (...args) => showFollowupForm(...args),
  'cancelMyRequest': (...args) => cancelMyRequest(...args),
  'submitFollowup': (...args) => submitFollowup(...args),
  'submitStory': (...args) => submitStory(...args),
  'removeAnimal': (...args) => removeAnimal(...args),
  'openProfile': (...args) => openProfile(...args),
  'analyzeRequest': (...args) => analyzeRequest(...args),
  'approveRequest': (...args) => approveRequest(...args),
  'openReject': (...args) => openReject(...args),
  'markInterview': (...args) => markInterview(...args),
  'completeRequest': (...args) => completeRequest(...args),
  'print': () => window.print(),
  'close-profile-dialog': () => document.getElementById('profile-dialog').close()
};
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || !Object.prototype.hasOwnProperty.call(clickActions, target.dataset.action)) return;
  const args = [];
  for (let i = 0; target.hasAttribute('data-arg-' + i); i++) {
    const value = Number(target.getAttribute('data-arg-' + i));
    if (!Number.isFinite(value)) return;
    args.push(value);
  }
  clickActions[target.dataset.action](...args);
});
