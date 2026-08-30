/* ==========================================================================
   auth.js — Autenticação via cookie HttpOnly criado pelo servidor.
   Senhas e tokens de sessão não ficam acessíveis ao JavaScript do navegador.
   ========================================================================== */

const Auth = {
  _currentUser: undefined,

  getCurrentUser() {
    if (this._currentUser !== undefined) return this._currentUser;
    const result = apiRequest('GET', '/api/auth/me', undefined, { allow401: true });
    this._currentUser = result ? result.user : null;
    return this._currentUser;
  },

  login(email, password) {
    const result = apiRequest('POST', '/api/auth/login', { email, password });
    this._currentUser = result.user;
    return result.user;
  },

  register({ name, email, password, role, city, state, phone }) {
    const result = apiRequest('POST', '/api/auth/register', { name, email, password, role, city, state, phone });
    this._currentUser = result.user;
    return result.user;
  },

  logout() {
    try { apiRequest('POST', '/api/auth/logout', {}); } catch { }
    this._currentUser = null;
  },

  requireAuth(roles) {
    const user = this.getCurrentUser();
    if (!user) { window.location.href = 'login.html'; return null; }
    if (roles && !roles.includes(user.role)) { window.location.href = 'index.html'; return null; }
    return user;
  }
};
