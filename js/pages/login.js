document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    Auth.login(email, password);
    window.location.href = 'index.html';
  } catch (err) {
    document.getElementById('alert-area').innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
  }
});
