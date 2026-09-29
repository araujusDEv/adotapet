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

  async login(email, password, remember = false) {
    const result = await apiRequestAsync('POST', '/api/auth/login', { email, password, remember });
    this._currentUser = result.user;
    return result.user;
  },

  async register({ name, email, password, passwordConfirmation, accountType, city, state, phone, termsAccepted, remember }) {
    const result = await apiRequestAsync('POST', '/api/auth/register', { name, email, password, passwordConfirmation, accountType, city, state, phone, termsAccepted, remember });
    this._currentUser = result.pendingApproval ? null : result.user;
    return result;
  },

  forgotPassword(email) {
    return apiRequestAsync('POST', '/api/auth/forgot-password', { email });
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
