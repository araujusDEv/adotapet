document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const wrapper = document.getElementById('contact-wrapper');
  try {
    Store.createReport({
      target_type: 'outro',
      category: 'outro',
      reason: `[Contato] ${document.getElementById('c-name').value} <${document.getElementById('c-email').value}>: ${document.getElementById('c-message').value}`
    });
    wrapper.innerHTML = '<div class="alert alert-success">Mensagem registrada com sucesso e encaminhada ao painel administrativo.</div>';
  } catch (err) {
    let alert = document.getElementById('contact-alert');
    if (!alert) { alert = document.createElement('div'); alert.id = 'contact-alert'; e.currentTarget.prepend(alert); }
    alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
  }
});
