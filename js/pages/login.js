function setLoading(button, loading, label) {
  button.disabled = loading; button.setAttribute('aria-busy', String(loading)); button.textContent = loading ? 'Aguarde' : label;
}
function showAuthMessage(message, type = 'error') {
  document.getElementById('alert-area').innerHTML = `<div class="alert alert-${type}">${escapeHTML(message)}</div>`;
}
document.querySelectorAll('[data-password-target]').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.passwordTarget); const show = input.type === 'password'; input.type = show ? 'text' : 'password';
  button.innerHTML = svgIcon(show ? 'eye-off' : 'eye'); button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); input.focus();
}));
document.getElementById('forgot-toggle').addEventListener('click', () => {
  document.getElementById('forgot-email').value = document.getElementById('email').value;
  document.getElementById('login-form').hidden = true; document.getElementById('forgot-form').hidden = false; document.getElementById('forgot-email').focus();
});
document.getElementById('login-back').addEventListener('click', () => {
  document.getElementById('forgot-form').hidden = true; document.getElementById('login-form').hidden = false; document.getElementById('email').focus();
});
document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = document.getElementById('login-submit'); document.getElementById('alert-area').innerHTML = ''; setLoading(button, true, 'Entrar');
  try {
    const user = await Auth.login(document.getElementById('email').value, document.getElementById('password').value, document.getElementById('remember').checked);
    window.location.href = user.role === 'admin' ? 'admin.html' : 'index.html';
  } catch (err) { showAuthMessage(err.message); setLoading(button, false, 'Entrar'); }
});
document.getElementById('forgot-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = document.getElementById('forgot-submit'); setLoading(button, true, 'Solicitar recuperação');
  try { const result = await Auth.forgotPassword(document.getElementById('forgot-email').value); showAuthMessage(result.message, 'success'); }
  catch (err) { showAuthMessage(err.message); }
  finally { setLoading(button, false, 'Solicitar recuperação'); }
});
