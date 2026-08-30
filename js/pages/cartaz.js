document.addEventListener('DOMContentLoaded', () => {
  const id = Number(getParam('id'));
  const animal = Store.getAnimal(id);
  const container = document.getElementById('poster-container');
  if (!animal) { container.innerHTML = '<p>Animal não encontrado.</p>'; return; }

  const animalUrl = `${window.location.origin}${window.location.pathname.replace('cartaz.html', 'animal.html')}?id=${animal.id}`;
  const cover = safeImageSrc(animal.photos && animal.photos[0]);
  container.innerHTML = `<div class="poster">
    <span class="eyebrow">Adote-me!</span>
    ${cover ? `<img src="${escapeAttr(cover)}" class="poster-photo" alt="${escapeAttr(animal.name)}">` : ''}
    <h1>${escapeHTML(animal.name)}</h1>
    <div class="poster-tags"><span class="tag">${animal.species === 'cachorro' ? 'Cão' : 'Gato'}</span><span class="tag">Porte ${escapeHTML(animal.size)}</span><span class="tag">${escapeHTML(animal.city)}/${escapeHTML(animal.state)}</span></div>
    <p>${escapeHTML(animal.description || '')}</p>
    <div class="poster-qr" id="qr-code"></div>
    <p style="font-size:.85rem;">Aponte a câmera do celular para ver o perfil completo</p>
    <p style="font-weight:700;">Contato: ${escapeHTML(animal.contact || 'via plataforma AdotaPet')}</p>
  </div>`;

  if (typeof QRCode !== 'undefined') {
    new QRCode(document.getElementById('qr-code'), { text: animalUrl, width: 140, height: 140 });
  } else {
    document.getElementById('qr-code').innerHTML = `<p style="font-size:.8rem;word-break:break-all;">${escapeHTML(animalUrl)}</p>`;
    showToast('QR Code indisponível sem internet; o link foi exibido no cartaz.');
  }

  document.getElementById('btn-share')?.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `Adote o(a) ${animal.name}!`, text: `Conheça o(a) ${animal.name}, disponível para adoção no AdotaPet.`, url: animalUrl }); } catch { }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(animalUrl); showToast('Link copiado para a área de transferência!');
    }
  });
});
