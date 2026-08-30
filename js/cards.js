function animalCardHTML(animal, isFavorite) {
  const cover = safeImageSrc(animal.photos && animal.photos[0]);
  const ageLabel = { filhote: 'Filhote', adulto: 'Adulto', idoso: 'Idoso' }[animal.age_group] || animal.age_group || '';
  const sizeLabel = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' }[animal.size] || animal.size || '';
  const attention = animalNeedsAttention(animal);
  return `
    <div class="card animal-card">
      <div class="animal-photo">
        ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(animal.name)}">` : '<div class="no-photo">Sem foto</div>'}
        <span class="badge">${animal.species === 'cachorro' ? 'Cão' : 'Gato'}</span>
        ${animal.featured ? '<span class="badge badge-featured">★ Destaque</span>' : ''}
        <button class="fav-btn" onclick="handleToggleFavorite(${Number(animal.id)})" aria-label="Favoritar" style="color:${isFavorite ? '#c0392b' : '#999'};font-size:1.2rem;">${isFavorite ? '♥' : '♡'}</button>
      </div>
      <div class="animal-body">
        <h3>${escapeHTML(animal.name)}</h3>${animal.verified ? '<span class="verified-seal" title="Dados conferidos pela administração">✓ Anúncio verificado</span>' : ''}
        <div class="animal-meta"><span>${escapeHTML(ageLabel)}</span><span>·</span><span>${escapeHTML(sizeLabel)}</span><span>·</span><span>${escapeHTML(animal.city)}</span></div>
        ${attention ? '<span class="tag tag-attention">Caso prioritário</span>' : ''}
        <p class="animal-desc">${escapeHTML((animal.description || '').slice(0, 90))}</p>
        <a href="animal.html?id=${Number(animal.id)}" class="btn btn-primary btn-sm" style="margin-top:auto;align-self:flex-start;">Ver detalhes</a>
      </div>
    </div>`;
}

function handleToggleFavorite(animalId) {
  const user = Auth.getCurrentUser();
  if (!user) { showToast('Entre na sua conta para favoritar animais.'); return; }
  try {
    Store.toggleFavorite(user.id, animalId);
    if (typeof renderFeatured === 'function' && document.getElementById('featured-animals')) renderFeatured();
    if (typeof applyFilters === 'function' && document.getElementById('results')) applyFilters();
    if (typeof renderRecommended === 'function' && document.getElementById('recommended-animals')) renderRecommended();
    if (typeof renderAnimalDetail === 'function' && document.getElementById('animal-container')) renderAnimalDetail(false);
  } catch (err) {
    showToast(err.message);
  }
}
