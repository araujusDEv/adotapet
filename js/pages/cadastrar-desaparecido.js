const MAX_MISSING_PHOTO_BYTES = 2 * 1024 * 1024;
const MISSING_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!MISSING_ALLOWED_TYPES.includes(file.type)) return reject(new Error('Use uma foto JPG, PNG ou WebP.'));
    if (file.size > MAX_MISSING_PHOTO_BYTES) return reject(new Error('A foto deve ter no máximo 2 MB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a foto selecionada.'));
    reader.readAsDataURL(file);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.requireAuth();
  if (!user) return;

  document.getElementById('missing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let alert = document.getElementById('missing-form-alert');
    if (!alert) {
      alert = document.createElement('div'); alert.id = 'missing-form-alert';
      e.currentTarget.prepend(alert);
    }
    alert.innerHTML = '';
    try {
      const photo = await fileToBase64(document.getElementById('m-photo').files[0]);
      const record = Store.createMissing({
        name: document.getElementById('m-name').value,
        species: document.getElementById('m-species').value,
        breed: document.getElementById('m-breed').value,
        color: document.getElementById('m-color').value,
        approx_age: document.getElementById('m-age').value,
        missing_date: document.getElementById('m-date').value,
        features: document.getElementById('m-features').value,
        last_seen_location: document.getElementById('m-location').value,
        city: document.getElementById('m-city').value,
        state: document.getElementById('m-state').value,
        contact: document.getElementById('m-contact').value,
        reward: document.getElementById('m-reward').value,
        photo
      });
      window.location.href = `desaparecido.html?id=${record.id}`;
    } catch (err) {
      alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
    }
  });
});
