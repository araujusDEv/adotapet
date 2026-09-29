let currentAnimalPhotos = [];
let currentAnimalName = '';

function renderAnimalDetail(trackView = true) {
  const id = getParam('id');
  const animal = Store.getAnimal(id);
  const container = document.getElementById('animal-container');
  if (!animal) {
    container.innerHTML = '<div class="empty-state"><h3>Animal não encontrado</h3></div>';
    return;
  }

  if (trackView) {
    try { Store.incrementAnimalView(animal.id); } catch { /* visualização não deve impedir a página de abrir */ }
  }

  const owner = Store.getAnimalOwnerName(animal.id);
  const photos = Array.isArray(animal.photos) ? animal.photos.map(safeImageSrc).filter(Boolean) : [];
  setRecordMetadata(`${animal.name} · AdotaPet`, `${animal.name} em ${animal.city}. ${animal.description || 'Conheça este animal no AdotaPet.'}`, photos[0]);
  currentAnimalPhotos = photos;
  currentAnimalName = animal.name || 'Animal';
  const ageLabel = { filhote: 'Filhote', adulto: 'Adulto', idoso: 'Idoso' }[animal.age_group] || animal.age_group || 'Não informado';
  const naoInformado = (v) => (v === undefined || v === null || v === '') ? '<i>Não informado</i>' : escapeHTML(v);

  const user = Auth.getCurrentUser();
  const isFav = user ? Store.getFavorites().some(f => f.userId === user.id && f.animalId === animal.id) : false;
  const available = Store.isAnimalAvailable(animal);

  const PERSONALITY_LABELS = { energy: 'Energia', sociability: 'Sociabilidade', affection: 'Carinho', independence: 'Independência', playful: 'Brincalhão', calm: 'Tranquilidade' };
  const personalityHTML = animal.personality
    ? `<div class="personality-grid">${Object.entries(PERSONALITY_LABELS).map(([key, label]) => {
        const score = Math.max(0, Math.min(5, Number(animal.personality[key]) || 0));
        return `<div class="personality-row"><span>${label}</span><div class="personality-bar"><div class="personality-bar-fill" style="width:${score * 20}%"></div></div></div>`;
      }).join('')}</div>`
    : '<p><i>Não informado.</i></p>';

  const coexistenceHTML = animal.coexistence
    ? `<div class="info-list">
        <div class="info-item"><span>Crianças</span><b>${escapeHTML(COEXISTENCE_LABEL[animal.coexistence.kids] || 'Não informado')}</b></div>
        <div class="info-item"><span>Cães</span><b>${escapeHTML(COEXISTENCE_LABEL[animal.coexistence.dogs] || 'Não informado')}</b></div>
        <div class="info-item"><span>Gatos</span><b>${escapeHTML(COEXISTENCE_LABEL[animal.coexistence.cats] || 'Não informado')}</b></div>
      </div>`
    : '<p><i>Não informado.</i></p>';

  container.innerHTML = `
    <div class="animal-detail">
      <div>
        <div class="gallery-main" id="gallery-main" style="position:relative;">
          ${photos[0] ? `<img src="${escapeAttr(photos[0])}" alt="${escapeAttr(animal.name)}" style="width:100%;height:100%;object-fit:cover;">` : '<div class="no-photo">Sem foto</div>'}
          ${favoriteButtonHTML(animal.id, isFav)}
        </div>
        ${photos.length > 1 ? `<div class="gallery-thumbs">${photos.map((p, i) => `<img src="${escapeAttr(p)}" alt="Foto de ${escapeAttr(animal.name)}" class="${i === 0 ? 'active' : ''}" data-action="setActivePhoto" data-arg-0="${i}">`).join('')}</div>` : ''}
      </div>
      <div>
        <span class="eyebrow">${animal.species === 'cachorro' ? 'Cão' : 'Gato'} · ${escapeHTML(animal.city)}/${escapeHTML(animal.state)}${animal.neighborhood ? ' — ' + escapeHTML(animal.neighborhood) : ''}</span>
        <h1>${escapeHTML(animal.name)} ${animal.verified ? '<span class="tag" title="Dados conferidos pela administração">' + svgIcon('shield-check') + ' Anúncio verificado</span>' : ''} ${animal.featured ? '<span class="tag">' + svgIcon('star') + ' Destaque</span>' : ''}</h1>
        <div class="tag-row">
          <span class="tag">${animal.sex === 'macho' ? 'Macho' : 'Fêmea'}</span>
          <span class="tag">${escapeHTML(ageLabel)}</span>
          <span class="tag">Porte ${escapeHTML(animal.size || 'não informado')}</span>
          <span class="tag">${escapeHTML(ANIMAL_STATUS[animal.status] || animal.status)}</span>
        </div>
        ${animalNeedsAttention(animal) ? '<span class="tag tag-attention">Precisa de mais atenção</span>' : ''}
        <p>${escapeHTML(animal.description || '')}</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <a href="cartaz.html?id=${Number(animal.id)}" class="btn btn-outline btn-sm" target="_blank" rel="noopener">Gerar cartaz / QR Code</a>
          <button class="btn btn-outline btn-sm" id="btn-share-profile">Compartilhar</button>
        </div>

        <h3 style="font-size:1.05rem;margin-top:22px;">Informações básicas</h3>
        <div class="info-list">
          <div class="info-item"><span>Raça</span><b>${naoInformado(animal.breed)}</b></div>
          <div class="info-item"><span>Responsável</span><b>${escapeHTML(owner ? owner.name : 'AdotaPet')}</b></div>
        </div>

        <h3 style="font-size:1.05rem;margin-top:22px;">Saúde</h3>
        <div class="info-list">
          <div class="info-item"><span>Vacinado</span><b>${animal.vaccinated ? 'Sim' : 'Não'}</b></div>
          <div class="info-item"><span>Vermifugado</span><b>${animal.dewormed ? 'Sim' : 'Não'}</b></div>
          <div class="info-item"><span>Castrado</span><b>${animal.neutered ? 'Sim' : 'Não'}</b></div>
          <div class="info-item"><span>Necessidades especiais</span><b>${naoInformado(animal.special_needs)}</b></div>
        </div>
        ${animal.health_notes ? `<p style="font-size:.9rem;">${escapeHTML(animal.health_notes)}</p>` : ''}

        <h3 style="font-size:1.05rem;margin-top:22px;">Personalidade</h3>${personalityHTML}
        <h3 style="font-size:1.05rem;margin-top:22px;">Convivência</h3>${coexistenceHTML}
        ${animal.history ? `<h3 style="font-size:1.05rem;margin-top:22px;">História</h3><p>${escapeHTML(animal.history)}</p>` : ''}

        <div id="interest-area">
          ${available ? '<button class="btn btn-primary" id="btn-interesse">Tenho Interesse</button>'
            : `<div class="alert alert-error">Este animal não está disponível para novas solicitações (${escapeHTML((ANIMAL_STATUS[animal.status] || animal.status).toLowerCase())}).</div>`}
        </div>
        <div style="margin-top:18px;" id="report-area">
          <button class="btn btn-outline btn-sm" id="btn-open-report" style="color:var(--color-danger);border-color:var(--color-danger);">Denunciar este anúncio</button>
        </div>
      </div>
    </div>`;

  if (available) document.getElementById('btn-interesse')?.addEventListener('click', () => showInterestForm(animal));

  document.getElementById('btn-open-report')?.addEventListener('click', () => {
    const area = document.getElementById('report-area');
    area.innerHTML = `
      <form class="form-card" style="padding:18px;margin:0;" id="report-form">
        <div class="form-field"><label for="rp-category">Motivo da denúncia</label><select id="rp-category">
          ${Object.entries(REPORT_CATEGORY_LABEL).map(([k, v]) => `<option value="${escapeAttr(k)}">${escapeHTML(v)}</option>`).join('')}
        </select></div>
        <div class="form-field"><label for="rp-details">Detalhes</label><textarea rows="2" id="rp-details" required></textarea></div>
        <button class="btn btn-danger btn-sm" type="submit">Enviar denúncia</button>
      </form>`;
    document.getElementById('report-form').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        Store.createReport({
          target_type: 'animal', target_id: animal.id,
          category: document.getElementById('rp-category').value,
          reason: `[${animal.name}] ${document.getElementById('rp-details').value}`
        });
        area.innerHTML = '<div class="alert alert-success">Denúncia enviada. Nossa equipe vai analisar.</div>';
      } catch (err) {
        area.insertAdjacentHTML('afterbegin', `<div class="alert alert-error">${escapeHTML(err.message)}</div>`);
      }
    });
  });

  document.getElementById('btn-share-profile')?.addEventListener('click', async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `Conheça ${animal.name}`, text: `${animal.name} está disponível para adoção no AdotaPet.`, url }); } catch { }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url); showToast('Link copiado para a área de transferência!');
    }
  });
}

function setActivePhoto(index) {
  const src = currentAnimalPhotos[Number(index)];
  if (!src) return;
  const gallery = document.getElementById('gallery-main');
  let img = gallery?.querySelector('img');
  if (!img && gallery) {
    img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    gallery.prepend(img);
  }
  if (img) { img.src = src; img.alt = currentAnimalName; }
  document.querySelectorAll('.gallery-thumbs img').forEach((thumb, i) => thumb.classList.toggle('active', i === Number(index)));
}

function showInterestForm(animal) {
  const user = Auth.getCurrentUser();
  const area = document.getElementById('interest-area');
  if (!user) {
    area.innerHTML = '<div class="alert alert-error">Você precisa entrar na sua conta para demonstrar interesse. <a href="login.html">Entrar</a></div>';
    return;
  }
  area.innerHTML = `
    <form class="form-card" style="padding:24px;margin:20px 0 0;" id="interest-form">
      <h3 style="font-size:1.1rem;">Formulário de interesse</h3>
      <div id="interest-alert"></div>
      <div class="form-row">
        <div class="form-field"><label for="i-name">Nome completo</label><input required id="i-name" value="${escapeAttr(user.name)}"></div>
        <div class="form-field"><label for="i-age">Idade</label><input type="number" min="18" max="120" id="i-age"></div>
      </div>
      <div class="form-field"><label for="i-city">Cidade onde mora</label><input id="i-city" value="${escapeAttr(user.city || '')}" required></div>
      <div class="form-field"><label for="i-housing">Tipo de moradia</label><select id="i-housing">
        <option value="casa">Casa</option><option value="apartamento">Apartamento</option><option value="sitio">Sítio / Chácara</option>
      </select></div>
      <div class="checkbox-row"><input type="checkbox" id="i-yard"><label for="i-yard">Possui quintal</label></div>
      <div class="checkbox-row"><input type="checkbox" id="i-pets"><label for="i-pets">Possui outros animais</label></div>
      <div class="checkbox-row"><input type="checkbox" id="i-exp"><label for="i-exp">Já teve experiência com pets</label></div>
      <div class="form-field"><label for="i-reason">Motivo da adoção</label><textarea rows="3" id="i-reason" required></textarea></div>

      <h3 style="font-size:1.05rem;margin-top:22px;">Questionário de adoção responsável</h3>
      <div class="form-field"><label for="q-agree">Todos os moradores concordam com a adoção?</label><select id="q-agree" required><option value="sim">Sim</option><option value="nao">Não</option></select></div>
      <div class="form-field"><label for="q-financial">Possui condições financeiras para alimentação e cuidados veterinários?</label><select id="q-financial" required><option value="sim">Sim</option><option value="nao">Não</option></select></div>
      <div class="form-field"><label for="q-alone">O animal ficará sozinho por quanto tempo, em média?</label><select id="q-alone" required>
        <option value="menos_2h">Menos de 2 horas</option><option value="2_4h">2 a 4 horas</option><option value="4_8h">4 a 8 horas</option><option value="mais_8h">Mais de 8 horas</option>
      </select></div>
      <div class="form-field"><label for="q-had-pets">Já teve animais anteriormente?</label><select id="q-had-pets"><option value="sim">Sim</option><option value="nao">Não</option></select></div>
      <div class="form-field"><label for="q-vet">Está disposto(a) a manter vacinação e acompanhamento veterinário?</label><select id="q-vet" required><option value="sim">Sim</option><option value="nao">Não</option></select></div>
      <div class="form-field"><label for="q-adaptation">O que fará caso tenha dificuldades de adaptação?</label><textarea rows="2" id="q-adaptation" required></textarea></div>
      <div class="checkbox-row" style="align-items:flex-start;margin:14px 0;"><input type="checkbox" id="q-declaration" required style="margin-top:4px;"><label for="q-declaration">Declaro estar ciente de que a adoção é um compromisso de longo prazo e que o animal não deve ser abandonado.</label></div>
      <button class="btn btn-primary" type="submit">Enviar solicitação</button>
    </form>`;

  document.getElementById('interest-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const alert = document.getElementById('interest-alert');
    if (!document.getElementById('q-declaration').checked) {
      alert.innerHTML = '<div class="alert alert-error">Confirme a declaração de compromisso.</div>'; return;
    }
    try {
      Store.createRequest({
        animalId: animal.id,
        full_name: document.getElementById('i-name').value,
        age: document.getElementById('i-age').value,
        city: document.getElementById('i-city').value,
        housing: document.getElementById('i-housing').value,
        has_yard: document.getElementById('i-yard').checked,
        has_pets: document.getElementById('i-pets').checked,
        experience: document.getElementById('i-exp').checked,
        reason: document.getElementById('i-reason').value,
        responsibility_confirmed: true,
        questionnaire: {
          household_agrees: document.getElementById('q-agree').value,
          financial_conditions: document.getElementById('q-financial').value,
          alone_time: document.getElementById('q-alone').value,
          had_pets_before: document.getElementById('q-had-pets').value,
          vet_commitment: document.getElementById('q-vet').value,
          adaptation_plan: document.getElementById('q-adaptation').value
        }
      });
      area.innerHTML = '<div class="alert alert-success">Solicitação enviada! Acompanhe em <a href="minhas-solicitacoes.html">Minhas Solicitações</a>.</div>';
    } catch (err) {
      alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => renderAnimalDetail(true));
