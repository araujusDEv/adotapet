'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'adotapet.db');
const SEED_PATH = path.join(ROOT, 'data', 'seed.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BODY_LIMIT = 12 * 1024 * 1024;
const RATE_LIMITS = new Map();
let bootstrapCredentials = null;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('adotante','doador','admin')),
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const COLLECTIONS = ['animals', 'missing', 'sightings', 'requests', 'favorites', 'reports', 'adoptionProfiles', 'notifications', 'adminLog', 'contracts', 'followups', 'supportPoints'];

function now() { return new Date().toISOString(); }
function cleanText(value, max = 5000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function normalizeEmail(value) { return cleanText(value, 254).toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(String(password), salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}
function validPasswordLength(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}
function randomBootstrapPassword() { return crypto.randomBytes(12).toString('base64url'); }
function rateLimit(req, res, bucket, max, windowMs) {
  const forwarded = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const ip = forwarded || req.socket.remoteAddress || 'local';
  const key = `${bucket}:${ip}`; const current = RATE_LIMITS.get(key); const time = Date.now();
  if (!current || current.resetAt <= time) { RATE_LIMITS.set(key, { count: 1, resetAt: time + windowMs }); return false; }
  current.count += 1;
  if (current.count > max) { res.setHeader('Retry-After', String(Math.ceil((current.resetAt - time) / 1000))); error(res, 429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'); return true; }
  return false;
}
function publicUser(row, includePrivate = false) {
  if (!row) return null;
  const base = {
    id: row.id,
    name: row.name,
    role: row.role,
    city: row.city || '',
    state: row.state || '',
    createdAt: row.created_at,
    protected: row.id === 2
  };
  if (includePrivate) {
    base.email = row.email;
    base.phone = row.phone || '';
  }
  return base;
}
function loadState(key) {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key);
  if (!row) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}
function saveState(key, value) {
  db.prepare(`INSERT INTO app_state(key,value,updated_at) VALUES(?,?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(key, JSON.stringify(value), now());
}
function newId(list) {
  return list.length ? Math.max(...list.map(x => Number(x.id) || 0)) + 1 : 1;
}
function getAnimal(id) { return loadState('animals').find(a => a.id === Number(id)) || null; }
function getMissing(id) { return loadState('missing').find(m => m.id === Number(id)) || null; }
function getRequest(id) { return loadState('requests').find(r => r.id === Number(id)) || null; }
function addNotification(userId, message) {
  if (!userId) return;
  const list = loadState('notifications');
  list.push({ id: newId(list), userId: Number(userId), message: cleanText(message, 1000), read: false, createdAt: now() });
  saveState('notifications', list);
}
function addAdminLog(admin, message) {
  if (!admin || admin.role !== 'admin') return;
  const list = loadState('adminLog');
  list.push({ id: newId(list), adminId: admin.id, adminName: admin.name, message: cleanText(message, 1500), createdAt: now() });
  saveState('adminLog', list);
}
function canManageAnimal(user, animal) {
  return Boolean(user && animal && (user.role === 'admin' || Number(animal.ownerId) === user.id));
}
function canManageRequest(user, request) {
  if (!user || !request) return false;
  if (user.role === 'admin') return true;
  const animal = getAnimal(request.animalId);
  return Boolean(animal && Number(animal.ownerId) === user.id && user.role === 'doador');
}
function recalcAnimalProcessStatus(animalId) {
  const animals = loadState('animals');
  const idx = animals.findIndex(a => a.id === Number(animalId));
  if (idx < 0 || animals[idx].status === 'adotado' || animals[idx].status === 'indisponivel' || animals[idx].status === 'aguardando_aprovacao') return;
  const requests = loadState('requests');
  const hasInterview = requests.some(r => r.animalId === Number(animalId) && r.status === 'pendente' && r.stage === 'entrevista');
  animals[idx].status = hasInterview ? 'em_processo' : 'disponivel';
  saveState('animals', animals);
}

function ensureSeed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (!count) {
    const insert = db.prepare(`INSERT INTO users(name,email,password_hash,password_salt,role,city,state,phone,created_at)
                               VALUES(?,?,?,?,?,?,?,?,?)`);
    const demo = process.env.SEED_DEMO_ACCOUNTS === '1';
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@adotapet.com');
    const adminPassword = process.env.ADMIN_PASSWORD || (demo ? 'admin123' : randomBootstrapPassword());
    const donorEmail = normalizeEmail(process.env.DONOR_EMAIL || 'ong@adotapet.com');
    const donorPassword = process.env.DONOR_PASSWORD || (demo ? 'doador123' : randomBootstrapPassword());
    const a = hashPassword(adminPassword);
    insert.run('Administrador', adminEmail, a.hash, a.salt, 'admin', '', '', '', now());
    const d = hashPassword(donorPassword);
    insert.run('Protetores de Apodi', donorEmail, d.hash, d.salt, 'doador', 'Apodi', 'RN', '', now());
    bootstrapCredentials = {
      adminEmail, adminPassword: process.env.ADMIN_PASSWORD ? null : adminPassword,
      donorEmail, donorPassword: process.env.DONOR_PASSWORD ? null : donorPassword
    };
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  for (const key of COLLECTIONS) {
    const row = db.prepare('SELECT key FROM app_state WHERE key = ?').get(key);
    if (!row) {
      const value = key === 'animals' ? seed.animals : key === 'missing' ? seed.missing : key === 'supportPoints' ? (seed.supportPoints || []) : [];
      saveState(key, value);
    }
  }
}
ensureSeed();
db.prepare('DELETE FROM sessions WHERE created_at < ?').run(new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString());

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
function error(res, status, message) { json(res, status, { error: message }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Dados enviados são grandes demais.'), { status: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function tokenFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)petadopt_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `petadopt_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`);
}
function clearSessionCookie(res) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `petadopt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}
function authUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const row = db.prepare(`SELECT s.token,s.created_at AS session_created,u.*
                          FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(token);
  if (!row) return null;
  if (Date.now() - new Date(row.session_created).getTime() > SESSION_MAX_AGE_MS) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  return row;
}
function requireUser(req, res, roles = null) {
  const user = authUser(req);
  if (!user) { error(res, 401, 'Você precisa entrar na sua conta.'); return null; }
  if (roles && !roles.includes(user.role)) { error(res, 403, 'Você não tem permissão para esta ação.'); return null; }
  return user;
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').run(token, userId, now());
  return token;
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, database: 'SQLite', time: now() });
  }

  if (method === 'GET' && pathname === '/api/stats') {
    const animals = loadState('animals');
    const missing = loadState('missing');
    const requests = loadState('requests');
    const followups = loadState('followups');
    return json(res, 200, {
      available: animals.filter(a => a.status === 'disponivel').length,
      adopted: animals.filter(a => a.status === 'adotado').length,
      urgent: animals.filter(a => a.status === 'disponivel' && (a.special_needs || a.age_group === 'idoso' || (Date.now() - new Date(a.createdAt).getTime()) > 60 * 86400000)).length,
      missing: missing.filter(m => !m.found).length,
      found: missing.filter(m => m.found).length,
      completedAdoptions: requests.filter(r => r.status === 'aceita').length,
      postAdoptionUpdates: followups.length,
      supportPoints: loadState('supportPoints').length
    });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    if (rateLimit(req, res, 'login', 10, 15 * 60 * 1000)) return;
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (typeof body.password !== 'string' || body.password.length > 128) {
      return error(res, 401, 'E-mail ou senha inválidos.');
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!user || !verifyPassword(body.password || '', user.password_salt, user.password_hash)) {
      return error(res, 401, 'E-mail ou senha inválidos.');
    }
    const token = createSession(user.id);
    setSessionCookie(res, token);
    return json(res, 200, { user: publicUser(user, true) });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    if (rateLimit(req, res, 'register', 8, 60 * 60 * 1000)) return;
    const body = await readBody(req);
    const name = cleanText(body.name, 120);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const role = body.role === 'doador' ? 'doador' : 'adotante';
    if (name.length < 2) return error(res, 400, 'Informe um nome válido.');
    if (!validEmail(email)) return error(res, 400, 'Informe um e-mail válido.');
    if (!validPasswordLength(password)) return error(res, 400, 'A senha precisa ter entre 6 e 128 caracteres.');
    if (db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) return error(res, 409, 'Já existe uma conta com este e-mail.');
    const { salt, hash } = hashPassword(password);
    const result = db.prepare(`INSERT INTO users(name,email,password_hash,password_salt,role,city,state,phone,created_at)
                               VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(name, email, hash, salt, role, cleanText(body.city, 120), cleanText(body.state, 40), cleanText(body.phone, 50), now());
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
    const token = createSession(user.id);
    setSessionCookie(res, token);
    return json(res, 201, { user: publicUser(user, true) });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = authUser(req);
    if (!user) return error(res, 401, 'Sessão inválida ou expirada.');
    return json(res, 200, { user: publicUser(user, true) });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/users') {
    const requester = authUser(req);
    const includePrivate = requester?.role === 'admin';
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    return json(res, 200, rows.map(r => publicUser(r, includePrivate)));
  }

  let match = pathname.match(/^\/api\/users\/(\d+)$/);
  if (method === 'DELETE' && match) {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const id = Number(match[1]);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!target) return error(res, 404, 'Usuário não encontrado.');
    if (target.role === 'admin') return error(res, 400, 'Contas administrativas não podem ser removidas por esta tela.');
    const ownsDemoData = loadState('animals').some(a => a.seed && Number(a.ownerId) === id) || loadState('missing').some(m => m.seed && Number(m.ownerId) === id);
    if (ownsDemoData) return error(res, 400, 'O usuário responsável pelos dados de demonstração não pode ser removido.');
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    for (const key of ['favorites', 'adoptionProfiles', 'notifications']) {
      const list = loadState(key).filter(x => Number(x.userId) !== id);
      saveState(key, list);
    }
    const animals = loadState('animals').map(a => Number(a.ownerId) === id && !a.seed ? { ...a, status: 'indisponivel' } : a);
    saveState('animals', animals);
    addAdminLog(admin, `Removeu o usuário ${target.name}.`);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/animals') {
    const user = authUser(req);
    const animals = loadState('animals');
    if (user?.role === 'admin') return json(res, 200, animals);
    const publicStatuses = new Set(['disponivel', 'em_processo', 'adotado']);
    return json(res, 200, animals.filter(a => publicStatuses.has(a.status) || Number(a.ownerId) === user?.id));
  }

  if (method === 'POST' && pathname === '/api/animals') {
    const user = requireUser(req, res, ['doador', 'admin']); if (!user) return;
    const body = await readBody(req);
    const list = loadState('animals');
    const photos = Array.isArray(body.photos) ? body.photos.filter(p => typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('img/'))).slice(0, 3) : [];
    const record = {
      id: newId(list),
      name: cleanText(body.name, 120), species: body.species === 'gato' ? 'gato' : 'cachorro',
      breed: cleanText(body.breed, 120), sex: body.sex === 'femea' ? 'femea' : 'macho',
      size: ['pequeno','medio','grande'].includes(body.size) ? body.size : 'medio',
      age_group: ['filhote','adulto','idoso'].includes(body.age_group) ? body.age_group : 'adulto',
      city: cleanText(body.city, 120), state: cleanText(body.state, 40), neighborhood: cleanText(body.neighborhood, 120),
      description: cleanText(body.description, 2000), history: cleanText(body.history, 3000),
      neutered: Boolean(body.neutered), vaccinated: Boolean(body.vaccinated), dewormed: Boolean(body.dewormed),
      special_needs: cleanText(body.special_needs, 1200), health_notes: cleanText(body.health_notes, 1600), contact: cleanText(body.contact, 120),
      photos, status: user.role === 'admin' ? 'disponivel' : 'aguardando_aprovacao', verified: false, featured: false,
      views: 0, ownerId: user.id, createdAt: now(),
      personality: body.personality && typeof body.personality === 'object' ? body.personality : null,
      energy_level: ['baixo','medio','alto'].includes(body.energy_level) ? body.energy_level : 'medio',
      coexistence: body.coexistence && typeof body.coexistence === 'object' ? body.coexistence : { kids:'nao_informado', dogs:'nao_informado', cats:'nao_informado' }
    };
    if (!record.name || !record.city || !record.state) return error(res, 400, 'Preencha nome, cidade e estado do animal.');
    list.push(record); saveState('animals', list);
    return json(res, 201, record);
  }

  match = pathname.match(/^\/api\/animals\/(\d+)\/view$/);
  if (method === 'POST' && match) {
    const id = Number(match[1]); const list = loadState('animals'); const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return error(res, 404, 'Animal não encontrado.');
    list[idx].views = (Number(list[idx].views) || 0) + 1; saveState('animals', list);
    return json(res, 200, { views: list[idx].views });
  }

  match = pathname.match(/^\/api\/animals\/(\d+)$/);
  if (method === 'PATCH' && match) {
    const user = requireUser(req, res, ['doador','admin']); if (!user) return;
    const id = Number(match[1]); const body = await readBody(req);
    const list = loadState('animals'); const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return error(res, 404, 'Animal não encontrado.');
    if (!canManageAnimal(user, list[idx])) return error(res, 403, 'Você não pode alterar este animal.');
    if (user.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'status') && ['aguardando_aprovacao','disponivel','em_processo','adotado','indisponivel'].includes(body.status)) list[idx].status = body.status;
    if (user.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'verified')) {
      list[idx].verified = Boolean(body.verified);
      list[idx].verifiedAt = list[idx].verified ? now() : null;
      list[idx].verifiedBy = list[idx].verified ? user.id : null;
    }
    if (user.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'featured')) list[idx].featured = Boolean(body.featured);
    const textFields = { name:120, breed:120, city:120, state:40, neighborhood:120, description:2000, history:3000, contact:120, special_needs:1200, health_notes:1600 };
    for (const [key, limit] of Object.entries(textFields)) if (Object.prototype.hasOwnProperty.call(body, key)) list[idx][key] = cleanText(body[key], limit);
    for (const key of ['neutered','vaccinated','dewormed']) if (Object.prototype.hasOwnProperty.call(body, key)) list[idx][key] = Boolean(body[key]);
    if (Object.prototype.hasOwnProperty.call(body, 'energy_level') && ['baixo','medio','alto'].includes(body.energy_level)) list[idx].energy_level = body.energy_level;
    if (body.personality && typeof body.personality === 'object' && !Array.isArray(body.personality)) list[idx].personality = body.personality;
    if (body.coexistence && typeof body.coexistence === 'object' && !Array.isArray(body.coexistence)) list[idx].coexistence = body.coexistence;
    if (user.role !== 'admin' && list[idx].status !== 'aguardando_aprovacao') {
      list[idx].status = 'aguardando_aprovacao';
      list[idx].verified = false;
      list[idx].featured = false;
    }
    saveState('animals', list);
    return json(res, 200, list[idx]);
  }
  if (method === 'DELETE' && match) {
    const user = requireUser(req, res, ['doador','admin']); if (!user) return;
    const id = Number(match[1]); const list = loadState('animals'); const animal = list.find(a => a.id === id);
    if (!animal) return error(res, 404, 'Animal não encontrado.');
    if (!canManageAnimal(user, animal)) return error(res, 403, 'Você não pode excluir este animal.');
    if (animal.seed) return error(res, 400, 'Os animais de demonstração não podem ser excluídos; altere o status para indisponível se necessário.');
    saveState('animals', list.filter(a => a.id !== id));
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/requests') {
    const user = requireUser(req, res); if (!user) return;
    const list = loadState('requests');
    if (user.role === 'admin') return json(res, 200, list);
    if (user.role === 'doador') {
      const owned = new Set(loadState('animals').filter(a => Number(a.ownerId) === user.id).map(a => a.id));
      return json(res, 200, list.filter(r => owned.has(r.animalId)));
    }
    return json(res, 200, list.filter(r => Number(r.requesterId) === user.id));
  }

  if (method === 'GET' && pathname === '/api/stories') {
    const stories = loadState('requests').filter(r => r.status === 'aceita' && r.story).map(r => ({
      id: r.id, animalId: r.animalId, full_name: r.full_name, story: r.story, acceptedAt: r.acceptedAt || null
    }));
    return json(res, 200, stories);
  }

  if (method === 'POST' && pathname === '/api/requests') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const animal = getAnimal(body.animalId);
    if (!animal) return error(res, 404, 'Animal não encontrado.');
    if (animal.status !== 'disponivel') return error(res, 409, 'Este animal não está disponível para novas solicitações.');
    if (Number(animal.ownerId) === user.id) return error(res, 400, 'Você não pode solicitar a adoção de um animal publicado pela sua própria conta.');
    const list = loadState('requests');
    if (list.some(r => r.animalId === animal.id && r.requesterId === user.id && ['pendente','aceita'].includes(r.status))) {
      return error(res, 409, 'Você já possui uma solicitação ativa para este animal.');
    }
    const record = {
      id: newId(list), animalId: animal.id, requesterId: user.id,
      full_name: cleanText(body.full_name || user.name, 120), age: cleanText(body.age, 10), city: cleanText(body.city, 120),
      housing: cleanText(body.housing, 50), has_yard: Boolean(body.has_yard), has_pets: Boolean(body.has_pets), experience: Boolean(body.experience),
      reason: cleanText(body.reason, 2000), responsibility_confirmed: Boolean(body.responsibility_confirmed),
      questionnaire: body.questionnaire && typeof body.questionnaire === 'object' ? {
        household_agrees: cleanText(body.questionnaire.household_agrees, 10),
        financial_conditions: cleanText(body.questionnaire.financial_conditions, 10),
        alone_time: cleanText(body.questionnaire.alone_time, 30),
        had_pets_before: cleanText(body.questionnaire.had_pets_before, 10),
        vet_commitment: cleanText(body.questionnaire.vet_commitment, 10),
        adaptation_plan: cleanText(body.questionnaire.adaptation_plan, 1000)
      } : {},
      status: 'pendente', stage: 'em_analise', createdAt: now()
    };
    if (!record.responsibility_confirmed) return error(res, 400, 'Confirme o compromisso com a adoção responsável.');
    list.push(record); saveState('requests', list);
    addNotification(user.id, `Sua solicitação para ${animal.name} foi recebida e está em análise.`);
    addNotification(animal.ownerId, `${user.name} enviou uma solicitação de adoção para ${animal.name}.`);
    return json(res, 201, record);
  }

  match = pathname.match(/^\/api\/requests\/(\d+)\/(interview|accept|reject|story)$/);
  if (method === 'POST' && match) {
    const id = Number(match[1]); const action = match[2]; const request = getRequest(id);
    if (!request) return error(res, 404, 'Solicitação não encontrada.');
    const body = await readBody(req);
    if (action === 'story') {
      const user = requireUser(req, res); if (!user) return;
      if (request.requesterId !== user.id || request.status !== 'aceita') return error(res, 403, 'Você não pode editar esta história.');
      const list = loadState('requests'); const idx = list.findIndex(r => r.id === id);
      list[idx].story = cleanText(body.story, 3000); list[idx].storyUpdatedAt = now(); saveState('requests', list);
      return json(res, 200, list[idx]);
    }
    const user = requireUser(req, res, ['doador','admin']); if (!user) return;
    if (!canManageRequest(user, request)) return error(res, 403, 'Você não pode responder a esta solicitação.');
    const animal = getAnimal(request.animalId);
    if (!animal) return error(res, 404, 'Animal não encontrado.');
    const requests = loadState('requests'); const idx = requests.findIndex(r => r.id === id);
    if (action === 'interview') {
      if (requests[idx].status !== 'pendente') return error(res, 409, 'Esta solicitação já foi encerrada.');
      requests[idx].stage = 'entrevista'; requests[idx].interviewAt = now(); saveState('requests', requests);
      const animals = loadState('animals'); const ai = animals.findIndex(a => a.id === animal.id);
      if (ai >= 0 && animals[ai].status === 'disponivel') { animals[ai].status = 'em_processo'; saveState('animals', animals); }
      addNotification(request.requesterId, `O responsável por ${animal.name} quer avançar para entrevista/contato com você.`);
      return json(res, 200, requests[idx]);
    }
    if (action === 'accept') {
      if (requests[idx].status !== 'pendente') return error(res, 409, 'Esta solicitação já foi encerrada.');
      if (!['disponivel', 'em_processo'].includes(animal.status)) return error(res, 409, 'Este animal não está disponível para concluir a adoção.');
      const acceptedAt = now();
      requests[idx] = { ...requests[idx], status: 'aceita', stage: 'concluida', acceptedAt };
      for (let i = 0; i < requests.length; i++) {
        const r = requests[i];
        if (r.animalId === request.animalId && r.id !== id && r.status === 'pendente') {
          requests[i] = { ...r, status: 'cancelada', closedAt: acceptedAt };
          addNotification(r.requesterId, `${animal.name} já foi adotado por outra pessoa. Sua solicitação foi encerrada.`);
        }
      }
      saveState('requests', requests);
      const animals = loadState('animals'); const ai = animals.findIndex(a => a.id === animal.id);
      if (ai >= 0) { animals[ai].status = 'adotado'; animals[ai].adoptedAt = acceptedAt; saveState('animals', animals); }
      const contracts = loadState('contracts').filter(c => c.requestId !== id);
      const adopter = db.prepare('SELECT * FROM users WHERE id=?').get(request.requesterId);
      const owner = db.prepare('SELECT * FROM users WHERE id=?').get(animal.ownerId);
      contracts.push({
        id: newId(contracts), requestId: id, code: `ADT-${id}-${Date.now().toString(36).toUpperCase()}`,
        animalId: animal.id, animalName: animal.name, species: animal.species, breed: animal.breed || '',
        adopterId: adopter?.id || request.requesterId, adopterName: adopter?.name || request.full_name, adopterCity: adopter?.city || request.city || '',
        ownerId: owner?.id || animal.ownerId, ownerName: owner?.name || 'Responsável pelo animal', ownerCity: owner?.city || animal.city || '',
        acceptedAt, ownerAcknowledgedAt: acceptedAt, adopterAcknowledgedAt: null,
        clauses: [
          'Garantir alimentação, abrigo, cuidados veterinários e tratamento sem maus-tratos.',
          'Manter vacinação e medidas preventivas de saúde adequadas.',
          'Não abandonar, vender ou transferir o animal sem comunicar o responsável pela adoção.',
          'Procurar apoio e organizar devolução responsável caso a adaptação não seja possível.'
        ]
      });
      saveState('contracts', contracts);
      addNotification(request.requesterId, `Sua adoção de ${animal.name} foi aprovada. Parabéns pelo novo membro da família!`);
      loadState('favorites').filter(f => f.animalId === animal.id && f.userId !== request.requesterId)
        .forEach(f => addNotification(f.userId, `Um animal que você favoritou (${animal.name}) foi adotado.`));
      return json(res, 200, requests.find(r => r.id === id));
    }
    if (action === 'reject') {
      if (requests[idx].status !== 'pendente') return error(res, 409, 'Esta solicitação já foi encerrada.');
      requests[idx] = { ...requests[idx], status: 'recusada', rejectedAt: now() }; saveState('requests', requests);
      addNotification(request.requesterId, `Sua solicitação para ${animal.name} não foi aprovada desta vez.`);
      recalcAnimalProcessStatus(animal.id);
      return json(res, 200, requests[idx]);
    }
  }

  if (method === 'GET' && pathname === '/api/favorites') {
    const user = requireUser(req, res); if (!user) return;
    return json(res, 200, loadState('favorites').filter(f => f.userId === user.id));
  }
  if (method === 'POST' && pathname === '/api/favorites/toggle') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const animalId = Number(body.animalId);
    if (!getAnimal(animalId)) return error(res, 404, 'Animal não encontrado.');
    let list = loadState('favorites'); const exists = list.some(f => f.userId === user.id && f.animalId === animalId);
    if (exists) list = list.filter(f => !(f.userId === user.id && f.animalId === animalId));
    else list.push({ userId: user.id, animalId });
    saveState('favorites', list); return json(res, 200, { favorite: !exists });
  }

  if (method === 'GET' && pathname === '/api/missing') return json(res, 200, loadState('missing'));
  if (method === 'POST' && pathname === '/api/missing') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const list = loadState('missing');
    const photo = typeof body.photo === 'string' && (body.photo.startsWith('data:image/') || body.photo.startsWith('img/')) ? body.photo : null;
    const record = {
      id: newId(list), ownerId: user.id, name: cleanText(body.name, 120), species: body.species === 'gato' ? 'gato' : 'cachorro',
      breed: cleanText(body.breed, 120), color: cleanText(body.color, 120), approx_age: cleanText(body.approx_age, 80),
      missing_date: cleanText(body.missing_date, 20), last_seen_location: cleanText(body.last_seen_location, 300), city: cleanText(body.city, 120),
      state: cleanText(body.state, 40), contact: cleanText(body.contact, 120), features: cleanText(body.features, 1600), reward: cleanText(body.reward, 120),
      found: false, photo, createdAt: now()
    };
    if (!record.city || !record.state || !record.missing_date) return error(res, 400, 'Preencha data, cidade e estado.');
    list.push(record); saveState('missing', list);
    const nearbyUsers = db.prepare('SELECT id FROM users WHERE id <> ? AND city = ? COLLATE NOCASE AND state = ? COLLATE NOCASE').all(user.id, record.city, record.state);
    for (const nearby of nearbyUsers) addNotification(nearby.id, `Alerta local: ${record.name || 'um animal'} desapareceu em ${record.city}/${record.state}.`);
    return json(res, 201, record);
  }
  match = pathname.match(/^\/api\/missing\/(\d+)$/);
  if (method === 'PATCH' && match) {
    const user = requireUser(req, res); if (!user) return;
    const id = Number(match[1]); const body = await readBody(req); const list = loadState('missing'); const idx = list.findIndex(m => m.id === id);
    if (idx < 0) return error(res, 404, 'Registro não encontrado.');
    if (user.role !== 'admin' && Number(list[idx].ownerId) !== user.id) return error(res, 403, 'Você não pode alterar este registro.');
    if (Object.prototype.hasOwnProperty.call(body, 'found')) {
      list[idx].found = Boolean(body.found); list[idx].foundAt = body.found ? now() : null;
    }
    saveState('missing', list); return json(res, 200, list[idx]);
  }

  if (method === 'POST' && pathname === '/api/sightings') {
    if (rateLimit(req, res, 'sightings', 20, 10 * 60 * 1000)) return;
    const body = await readBody(req); const missing = getMissing(body.missingAnimalId);
    if (!missing) return error(res, 404, 'Registro de animal desaparecido não encontrado.');
    if (missing.found) return error(res, 409, 'Este animal já foi marcado como encontrado.');
    const list = loadState('sightings');
    const record = { id: newId(list), missingAnimalId: missing.id, reporter_name: cleanText(body.reporter_name, 120), reporter_contact: cleanText(body.reporter_contact, 120), location: cleanText(body.location, 300), message: cleanText(body.message, 2000), createdAt: now() };
    if (!record.location) return error(res, 400, 'Informe onde o animal foi visto.');
    list.push(record); saveState('sightings', list);
    if (missing.ownerId) addNotification(missing.ownerId, `Novo avistamento informado para ${missing.name || 'seu animal desaparecido'} em ${record.location}.`);
    return json(res, 201, record);
  }
  if (method === 'GET' && pathname === '/api/sightings') {
    const user = requireUser(req, res); if (!user) return;
    const missing = loadState('missing'); const allowed = new Set(missing.filter(m => user.role === 'admin' || Number(m.ownerId) === user.id).map(m => m.id));
    return json(res, 200, loadState('sightings').filter(s => allowed.has(s.missingAnimalId)));
  }

  if (method === 'POST' && pathname === '/api/reports') {
    if (rateLimit(req, res, 'reports', 12, 10 * 60 * 1000)) return;
    const body = await readBody(req); const user = authUser(req); const list = loadState('reports');
    const record = { id: newId(list), reporterUserId: user?.id || null, target_type: cleanText(body.target_type, 30) || 'outro', target_id: body.target_id ? Number(body.target_id) : null, category: cleanText(body.category, 50) || 'outro', reason: cleanText(body.reason, 3000), status: 'aberta', createdAt: now() };
    if (!record.reason) return error(res, 400, 'Informe os detalhes da mensagem/denúncia.');
    list.push(record); saveState('reports', list); return json(res, 201, record);
  }
  if (method === 'GET' && pathname === '/api/reports') {
    const user = requireUser(req, res, ['admin']); if (!user) return;
    return json(res, 200, loadState('reports'));
  }
  match = pathname.match(/^\/api\/reports\/(\d+)\/resolve$/);
  if (method === 'POST' && match) {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const id = Number(match[1]); const list = loadState('reports'); const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return error(res, 404, 'Denúncia não encontrada.');
    list[idx].status = 'resolvida'; list[idx].resolvedAt = now(); saveState('reports', list);
    return json(res, 200, list[idx]);
  }

  if (method === 'GET' && pathname === '/api/adoption-profile') {
    const user = requireUser(req, res); if (!user) return;
    const record = loadState('adoptionProfiles').find(p => p.userId === user.id) || null;
    return json(res, 200, record);
  }
  if (method === 'POST' && pathname === '/api/adoption-profile') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const list = loadState('adoptionProfiles').filter(p => p.userId !== user.id);
    const record = { userId: user.id, housing: cleanText(body.housing, 30), has_yard: cleanText(body.has_yard, 20), has_kids: cleanText(body.has_kids, 20), other_pets: cleanText(body.other_pets, 30), alone_time: cleanText(body.alone_time, 30), experience: cleanText(body.experience, 30), species: cleanText(body.species, 30), age: cleanText(body.age, 30), size: cleanText(body.size, 30), energy: cleanText(body.energy, 30), availability: cleanText(body.availability, 30), updatedAt: now() };
    list.push(record); saveState('adoptionProfiles', list); return json(res, 200, record);
  }

  if (method === 'GET' && pathname === '/api/notifications') {
    const user = requireUser(req, res); if (!user) return;
    const list = loadState('notifications').filter(n => n.userId === user.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    return json(res, 200, list);
  }
  if (method === 'POST' && pathname === '/api/notifications/read') {
    const user = requireUser(req, res); if (!user) return;
    const list = loadState('notifications').map(n => n.userId === user.id ? { ...n, read: true } : n); saveState('notifications', list);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/admin-log') {
    const user = requireUser(req, res, ['admin']); if (!user) return;
    return json(res, 200, loadState('adminLog').sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)));
  }
  if (method === 'POST' && pathname === '/api/admin-log') {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const body = await readBody(req); addAdminLog(admin, body.message || 'Ação administrativa.');
    return json(res, 201, { ok: true });
  }

  match = pathname.match(/^\/api\/contracts\/(\d+)(\/acknowledge)?$/);
  if (match) {
    const user = requireUser(req, res); if (!user) return;
    const requestId = Number(match[1]);
    const contracts = loadState('contracts'); const idx = contracts.findIndex(c => c.requestId === requestId);
    if (idx < 0) return error(res, 404, 'Termo de adoção não encontrado.');
    const contract = contracts[idx];
    if (user.role !== 'admin' && user.id !== contract.adopterId && user.id !== contract.ownerId) return error(res, 403, 'Você não pode acessar este termo.');
    if (method === 'GET' && !match[2]) return json(res, 200, contract);
    if (method === 'POST' && match[2]) {
      if (user.id !== contract.adopterId) return error(res, 403, 'Somente o adotante pode confirmar este termo.');
      contracts[idx].adopterAcknowledgedAt = contracts[idx].adopterAcknowledgedAt || now();
      saveState('contracts', contracts);
      addNotification(contract.ownerId, `${contract.adopterName} confirmou o termo de adoção de ${contract.animalName}.`);
      return json(res, 200, contracts[idx]);
    }
  }

  if (method === 'GET' && pathname === '/api/followups') {
    const user = requireUser(req, res); if (!user) return;
    const requests = loadState('requests');
    const allowed = new Set(requests.filter(r => user.role === 'admin' || r.requesterId === user.id || canManageRequest(user, r)).map(r => r.id));
    return json(res, 200, loadState('followups').filter(f => allowed.has(f.requestId)));
  }
  if (method === 'POST' && pathname === '/api/followups') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const request = getRequest(body.requestId);
    if (!request || request.status !== 'aceita') return error(res, 404, 'Adoção concluída não encontrada.');
    if (request.requesterId !== user.id) return error(res, 403, 'Somente o adotante pode enviar este acompanhamento.');
    const day = Number(body.day);
    if (![7, 30, 90].includes(day)) return error(res, 400, 'Etapa de acompanhamento inválida.');
    const dueAt = new Date(new Date(request.acceptedAt).getTime() + day * 86400000);
    if (Date.now() < dueAt.getTime()) return error(res, 409, `Este acompanhamento ficará disponível em ${dueAt.toLocaleDateString('pt-BR')}.`);
    const list = loadState('followups');
    if (list.some(f => f.requestId === request.id && f.day === day)) return error(res, 409, 'Este acompanhamento já foi enviado.');
    const record = {
      id: newId(list), requestId: request.id, animalId: request.animalId, adopterId: user.id, day,
      adaptation: ['otima','boa','dificil'].includes(body.adaptation) ? body.adaptation : 'boa',
      health: cleanText(body.health, 1200), behavior: cleanText(body.behavior, 1200), needsHelp: Boolean(body.needsHelp),
      photo: typeof body.photo === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(body.photo) ? body.photo.slice(0, 4 * 1024 * 1024) : null,
      createdAt: now()
    };
    list.push(record); saveState('followups', list);
    const animal = getAnimal(request.animalId);
    if (animal?.ownerId) addNotification(animal.ownerId, `${user.name} enviou o acompanhamento de ${day} dias de ${animal.name}.${record.needsHelp ? ' A família informou que precisa de apoio.' : ''}`);
    return json(res, 201, record);
  }

  if (method === 'GET' && pathname === '/api/support-points') return json(res, 200, loadState('supportPoints'));
  if (method === 'POST' && pathname === '/api/support-points') {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const body = await readBody(req); const list = loadState('supportPoints');
    const record = {
      id: newId(list), name: cleanText(body.name, 160), category: cleanText(body.category, 50),
      city: cleanText(body.city, 120), state: cleanText(body.state, 40), address: cleanText(body.address, 300),
      contact: cleanText(body.contact, 120), services: cleanText(body.services, 1000), verified: true, createdAt: now()
    };
    if (!record.name || !record.category || !record.city || !record.state) return error(res, 400, 'Preencha nome, categoria, cidade e estado.');
    list.push(record); saveState('supportPoints', list); addAdminLog(admin, `Adicionou ${record.name} à rede de apoio.`);
    return json(res, 201, record);
  }
  match = pathname.match(/^\/api\/support-points\/(\d+)$/);
  if (method === 'DELETE' && match) {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const id = Number(match[1]); const list = loadState('supportPoints'); const point = list.find(p => p.id === id);
    if (!point) return error(res, 404, 'Ponto de apoio não encontrado.');
    saveState('supportPoints', list.filter(p => p.id !== id)); addAdminLog(admin, `Removeu ${point.name} da rede de apoio.`);
    return json(res, 200, { ok: true });
  }

  return error(res, 404, 'Rota da API não encontrada.');
}

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.json':'application/json; charset=utf-8'
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const target = path.resolve(ROOT, '.' + rel);
  const relative = path.relative(ROOT, target);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
    res.writeHead(403, { 'Content-Type':'text/plain; charset=utf-8' });
    return res.end('Acesso negado.');
  }
  const normalized = relative.split(path.sep).join('/').toLowerCase();
  const protectedFiles = new Set(['server.js', 'package.json', 'iniciar.bat', 'iniciar.sh', 'readme.md', 'relatorio_correcoes.md']);
  if (normalized.startsWith('data/') || protectedFiles.has(normalized)) {
    res.writeHead(403, { 'Content-Type':'text/plain; charset=utf-8' });
    return res.end('Acesso negado.');
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Arquivo não encontrado.'); }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'same-origin',
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET','HEAD'].includes(req.method)) return error(res, 405, 'Método não permitido.');
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) error(res, err.status || 500, err.status ? err.message : 'Erro interno do servidor.');
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AdotaPet rodando em http://127.0.0.1:${PORT}`);
  try {
    const os = require('node:os');
    const addresses = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal);
    for (const info of addresses) console.log(`Na mesma rede: http://${info.address}:${PORT}`);
  } catch { }
  console.log(`Banco SQLite: ${DB_PATH}`);
  if (bootstrapCredentials) {
    console.log('Contas iniciais criadas. Guarde estes dados agora:');
    console.log(`Administrador: ${bootstrapCredentials.adminEmail}${bootstrapCredentials.adminPassword ? ` / ${bootstrapCredentials.adminPassword}` : ' / senha definida por ADMIN_PASSWORD'}`);
    console.log(`Doador: ${bootstrapCredentials.donorEmail}${bootstrapCredentials.donorPassword ? ` / ${bootstrapCredentials.donorPassword}` : ' / senha definida por DONOR_PASSWORD'}`);
  }
});
