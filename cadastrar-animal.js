const MAX_ANIMAL_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function filesToBase64(fileList) {
  const files = Array.from(fileList);
  if (files.length > MAX_ANIMAL_PHOTOS) throw new Error(`Selecione no máximo ${MAX_ANIMAL_PHOTOS} fotos.`);
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Use apenas imagens JPG, PNG ou WebP.');
    if (file.size > MAX_PHOTO_BYTES) throw new Error(`A foto "${file.name}" ultrapassa 2 MB.`);
  }
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Não foi possível ler a foto ${file.name}.`));
    reader.readAsDataURL(file);
  })));
}

function showAnimalFormError(message) {
  let el = document.getElementById('animal-form-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'animal-form-alert';
    document.getElementById('animal-form')?.prepend(el);
  }
  if (el) el.innerHTML = `<div class="alert alert-error">${escapeHTML(message)}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.requireAuth(['doador', 'admin']);
  if (!user) return;

  const citySelect = document.getElementById('a-city');
  const cityOther = document.getElementById('a-city-other');
  citySelect?.addEventListener('change', () => {
    cityOther.style.display = citySelect.value === 'Outra' ? 'block' : 'none';
    cityOther.required = citySelect.value === 'Outra';
  });

  document.getElementById('animal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const photos = await filesToBase64(document.getElementById('a-photos').files);
      const city = document.getElementById('a-city').value === 'Outra'
        ? document.getElementById('a-city-other').value.trim()
        : document.getElementById('a-city').value;
      if (!city) throw new Error('Informe a cidade do animal.');

      const record = Store.createAnimal({
        name: document.getElementById('a-name').value,
        species: document.getElementById('a-species').value,
        breed: document.getElementById('a-breed').value,
        sex: document.getElementById('a-sex').value,
        size: document.getElementById('a-size').value,
        age_group: document.getElementById('a-age').value,
        city,
        state: document.getElementById('a-state').value,
        neighborhood: document.getElementById('a-neighborhood').value,
        description: document.getElementById('a-description').value,
        history: document.getElementById('a-history').value,
        special_needs: document.getElementById('a-special').value,
        health_notes: document.getElementById('a-health-notes').value,
        neutered: document.getElementById('a-neutered').checked,
        vaccinated: document.getElementById('a-vaccinated').checked,
        dewormed: document.getElementById('a-dewormed').checked,
        energy_level: document.getElementById('a-energy-level').value,
        personality: {
          energy: Number(document.getElementById('a-p-energy').value),
          sociability: Number(document.getElementById('a-p-sociability').value),
          affection: Number(document.getElementById('a-p-affection').value),
          independence: Number(document.getElementById('a-p-independence').value),
          playful: Number(document.getElementById('a-p-playful').value),
          calm: Number(document.getElementById('a-p-calm').value)
        },
        coexistence: {
          kids: document.getElementById('a-co-kids').value,
          dogs: document.getElementById('a-co-dogs').value,
          cats: document.getElementById('a-co-cats').value
        },
        contact: document.getElementById('a-contact').value,
        photos
      });

      const approvalText = record.status === 'disponivel'
        ? 'O anúncio foi publicado.'
        : 'O anúncio está aguardando aprovação do administrador antes de aparecer publicamente.';
      document.getElementById('form-wrapper').innerHTML = `
        <div style="text-align:center;">
          <h1 style="font-size:1.6rem;">Anúncio enviado!</h1>
          <p>${approvalText}</p>
          <a href="painel-doador.html" class="btn btn-primary">Ir para meu painel</a>
        </div>`;
    } catch (err) {
      showAnimalFormError(err.message);
    }
  });
});
