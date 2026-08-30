document.getElementById('registro-form').addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    Auth.register({
      name: document.getElementById('r-name').value,
      email: document.getElementById('r-email').value,
      password: document.getElementById('r-password').value,
      role: document.getElementById('r-role').value,
      city: document.getElementById('r-city').value,
      state: document.getElementById('r-state').value,
      phone: document.getElementById('r-phone').value
    });
    window.location.href = 'index.html';
  } catch (err) {
    document.getElementById('alert-area').innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
  }
});
