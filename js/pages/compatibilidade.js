function readProfileFromForm() {
  return {
    housing: document.getElementById('q-housing').value,
    has_yard: document.getElementById('q-yard').value,
    has_kids: document.getElementById('q-kids').value,
    other_pets: document.getElementById('q-other-pets').value,
    alone_time: document.getElementById('q-alone').value,
    experience: document.getElementById('q-experience').value,
    species: document.getElementById('q-species').value,
    age: document.getElementById('q-age').value,
    size: document.getElementById('q-size').value,
    energy: document.getElementById('q-energy').value,
    availability: document.getElementById('q-availability').value
  };
}

function fillFormFromProfile(profile) {
  const map = { housing: 'q-housing', has_yard: 'q-yard', has_kids: 'q-kids', other_pets: 'q-other-pets', alone_time: 'q-alone', experience: 'q-experience', species: 'q-species', age: 'q-age', size: 'q-size', energy: 'q-energy', availability: 'q-availability' };
  Object.entries(map).forEach(([key, id]) => { if (profile[key] !== undefined) document.getElementById(id).value = profile[key]; });
}

function renderMatches(profile) {
  const ranked = Store.getAnimals().filter(a => Store.isAnimalAvailable(a))
    .map(a => ({ animal: a, ...computeCompatibility(profile, a) })).sort((a, b) => b.score - a.score);
  const el = document.getElementById('match-results');
  if (!ranked.length) {
    el.innerHTML = '<div class="empty-state"><h3>Nenhum animal disponível no momento.</h3></div>'; return;
  }
  el.innerHTML = ranked.map(({ animal, score, reasons, warnings }) => {
    const cover = safeImageSrc(animal.photos && animal.photos[0]);
    return `<div class="card animal-card">
      <div class="animal-photo">${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(animal.name)}">` : '<div class="no-photo">Sem foto</div>'}<span class="badge">${animal.species === 'cachorro' ? 'Cão' : 'Gato'}</span></div>
      <div class="animal-body"><div style="display:flex;justify-content:space-between;align-items:baseline;"><h3>${escapeHTML(animal.name)}</h3><span class="match-score">${Number(score)}%</span></div>
      <div class="animal-meta"><span>${escapeHTML(animal.city)}</span></div>
      <div class="match-reasons">${reasons.slice(0,3).map(r => `<div>${svgIcon('check')} ${escapeHTML(r)}</div>`).join('')}${warnings.slice(0,2).map(w => `<div class="match-warning">${svgIcon('warning')} ${escapeHTML(w)}</div>`).join('')}</div>
      <a href="animal.html?id=${Number(animal.id)}" class="btn btn-primary btn-sm" style="margin-top:12px;align-self:flex-start;">Ver perfil completo</a></div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getCurrentUser();
  const existing = user ? Store.getAdoptionProfile(user.id) : null;
  if (existing) {
    fillFormFromProfile(existing);
    document.getElementById('quiz-area').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';
    renderMatches(existing);
  }
  document.getElementById('quiz-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const profile = readProfileFromForm();
    try { if (user) Store.saveAdoptionProfile(user.id, profile); }
    catch (err) { showToast(err.message); return; }
    document.getElementById('quiz-area').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';
    renderMatches(profile);
  });
  document.getElementById('btn-redo-quiz').addEventListener('click', () => {
    document.getElementById('results-area').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
  });
});
