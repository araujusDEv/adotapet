function renderFeatured() {
  const el = document.getElementById('featured-animals');
  if (!el) return;
  const user = Auth.getCurrentUser();
  const favs = user ? Store.getFavorites().map(f => f.animalId) : [];
  const available = Store.getAnimals().filter(a => Store.isAnimalAvailable(a));
  const featured = available.filter(a => a.featured);
  const rest = available.filter(a => !a.featured);
  const animals = [...featured, ...rest].slice(0, 4);
  el.innerHTML = animals.length
    ? animals.map(a => animalCardHTML(a, favs.includes(a.id))).join('')
    : '<p>Nenhum animal disponível no momento — volte em breve.</p>';
}

function renderStats() {
  if (!document.getElementById('stat-animais')) return;
  const animals = Store.getAnimals();
  const publicStats = Store.getPublicStats();
  document.getElementById('stat-animais').textContent = Number(publicStats.available) || 0;
  document.getElementById('stat-adocoes').textContent = Number(publicStats.completedAdoptions) || animals.filter(a => a.status === 'adotado').length;
  document.getElementById('stat-usuarios').textContent = Number(publicStats.users) || 0;
  document.getElementById('stat-ongs').textContent = Number(publicStats.organizations) || 0;
}

function renderRecommended() {
  const section = document.getElementById('recommended-section');
  if (!section) return;
  const user = Auth.getCurrentUser();
  const profile = user ? Store.getAdoptionProfile(user.id) : null;
  if (!profile) { section.style.display = 'none'; return; }

  const favs = Store.getFavorites().map(f => f.animalId);
  const ranked = Store.getAnimals().filter(a => Store.isAnimalAvailable(a))
    .map(a => ({ animal: a, ...computeCompatibility(profile, a) }))
    .sort((a, b) => b.score - a.score).slice(0, 4);

  if (!ranked.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  document.getElementById('recommended-animals').innerHTML = ranked.map(({ animal, score }) => {
    const cover = safeImageSrc(animal.photos && animal.photos[0]);
    return `<div class="card animal-card">
      <div class="animal-photo">
        ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(animal.name)}">` : '<div class="no-photo">Sem foto</div>'}
        <span class="badge">${Number(score)}% compatível</span>
        ${favoriteButtonHTML(animal.id, favs.includes(animal.id))}
      </div>
      <div class="animal-body"><h3>${escapeHTML(animal.name)}</h3><div class="animal-meta"><span>${escapeHTML(animal.city)}</span></div>
      <a href="animal.html?id=${Number(animal.id)}" class="btn btn-primary btn-sm" style="margin-top:auto;align-self:flex-start;">Ver detalhes</a></div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderFeatured(); renderStats(); renderRecommended();
});
