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
setInterval(() => {
  const time = Date.now();
  for (const [key, entry] of RATE_LIMITS) {
    if (entry.resetAt <= time) RATE_LIMITS.delete(key);
  }
}, 15 * 60 * 1000).unref();
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
  CREATE TABLE IF NOT EXISTS id_sequences (
    collection TEXT PRIMARY KEY,
    last_id INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensureUserColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}
ensureUserColumn('account_type', "TEXT NOT NULL DEFAULT 'usuario'");
ensureUserColumn('approval_status', "TEXT NOT NULL DEFAULT 'aprovado'");
ensureUserColumn('approved_by', 'INTEGER');
ensureUserColumn('approved_at', 'TEXT');
ensureUserColumn('approval_reason', "TEXT NOT NULL DEFAULT ''");
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_account_approval ON users(account_type, approval_status);`);
db.prepare(`UPDATE users SET account_type = CASE role WHEN 'admin' THEN 'admin' WHEN 'doador' THEN 'ong' ELSE 'usuario' END
            WHERE account_type IS NULL OR account_type = '' OR (account_type = 'usuario' AND role IN ('admin','doador'))`).run();
db.prepare(`UPDATE users SET approval_status='aprovado' WHERE approval_status IS NULL OR approval_status=''`).run();

const COLLECTIONS = ['animals', 'missing', 'sightings', 'requests', 'favorites', 'reports', 'adoptionProfiles', 'notifications', 'adminLog', 'contracts', 'followups', 'supportPoints', 'campaigns'];

function now() { return new Date().toISOString(); }
function cleanText(value, max = 5000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function normalizeEmail(value) { return cleanText(value, 254).toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validExternalUrl(value) {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(String(password), salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}
function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128 && /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password);
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
    accountType: row.account_type || (row.role === 'admin' ? 'admin' : row.role === 'doador' ? 'ong' : 'usuario'),
    approvalStatus: row.approval_status || 'aprovado',
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    approvalReason: row.approval_reason || '',
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
function highestKnownId(collection) {
  if (!COLLECTIONS.includes(collection)) throw new Error('Coleção inválida.');
  let highest = 0;
  const include = value => {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > highest) highest = id;
  };
  for (const record of loadState(collection)) include(record.id);
  // Reserve IDs still referenced in databases created before persistent counters.
  const references = {
    animals: [['campaigns', 'animalId'], ['requests', 'animalId'], ['favorites', 'animalId'], ['contracts', 'animalId'], ['followups', 'animalId']],
    requests: [['contracts', 'requestId'], ['followups', 'requestId']],
    missing: [['sightings', 'missingAnimalId']]
  };
  for (const [key, field] of references[collection] || []) {
    for (const record of loadState(key)) include(record[field]);
  }
  if (collection === 'animals' || collection === 'missing') {
    for (const report of loadState('reports')) {
      if (report.target_type === (collection === 'animals' ? 'animal' : 'missing')) include(report.target_id);
    }
  }
  return highest;
}
function newId(collection) {
  const highest = highestKnownId(collection);
  // The counter advances atomically and survives deletion and server restarts.
  const row = db.prepare(
    'INSERT INTO id_sequences(collection, last_id) VALUES (?, ?) ' +
    'ON CONFLICT(collection) DO UPDATE SET last_id = MAX(last_id + 1, excluded.last_id) RETURNING last_id'
  ).get(collection, highest + 1);
  if (!Number.isSafeInteger(row.last_id)) throw new Error('Limite de identificadores atingido.');
  return row.last_id;
}
function getAnimal(id) { return loadState('animals').find(a => a.id === Number(id)) || null; }
function getMissing(id) { return loadState('missing').find(m => m.id === Number(id)) || null; }
function getRequest(id) { return loadState('requests').find(r => r.id === Number(id)) || null; }
function addNotification(userId, message) {
  if (!userId) return;
  const list = loadState('notifications');
  list.push({ id: newId('notifications'), userId: Number(userId), message: cleanText(message, 1000), read: false, createdAt: now() });
  saveState('notifications', list);
}
function addAdminLog(admin, message) {
  if (!admin || admin.role !== 'admin') return;
  const list = loadState('adminLog');
  list.push({ id: newId('adminLog'), adminId: admin.id, adminName: admin.name, message: cleanText(message, 1500), createdAt: now() });
  saveState('adminLog', list);
}
function canManageAnimal(user, animal) {
  return Boolean(user && animal && (user.role === 'admin' || (Number(animal.ownerId) === user.id && canPublish(user))));
}
function accountType(user) {
  if (!user) return '';
  return user.account_type || (user.role === 'admin' ? 'admin' : user.role === 'doador' ? 'ong' : 'usuario');
}
function canPublish(user) {
  if (!user) return false;
  if (accountType(user) === 'admin' || accountType(user) === 'usuario') return true;
  return accountType(user) === 'ong' && (user.approval_status || 'aprovado') === 'aprovado';
}
function canManageRequest(user, request) {
  if (!user || !request) return false;
  if (user.role === 'admin') return true;
  const animal = getAnimal(request.animalId);
  if (!animal || Number(animal.ownerId) !== user.id || !canPublish(user)) return false;
  if (request.ownerId !== undefined) return Number(request.ownerId) === user.id;
  // Older requests must not grant access to an animal created after the request.
  const requestedAt = Date.parse(request.createdAt);
  const animalCreatedAt = Date.parse(animal.createdAt);
  return Number.isFinite(requestedAt) && Number.isFinite(animalCreatedAt) && requestedAt >= animalCreatedAt;
}
function recalcAnimalProcessStatus(animalId) {
  const animals = loadState('animals');
  const idx = animals.findIndex(a => a.id === Number(animalId));
  if (idx < 0 || animals[idx].status === 'adotado' || animals[idx].status === 'indisponivel' || animals[idx].status === 'aguardando_aprovacao') return;
  const requests = loadState('requests');
  const hasActiveApproval = requests.some(r => r.animalId === Number(animalId) && r.status === 'aprovada');
  animals[idx].status = hasActiveApproval ? 'em_processo' : 'disponivel';
  saveState('animals', animals);
}

function ensureSeed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (!count) {
    const insert = db.prepare(`INSERT INTO users(name,email,password_hash,password_salt,role,city,state,phone,created_at,account_type,approval_status,approved_at)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    const demo = process.env.SEED_DEMO_ACCOUNTS === '1';
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@adotapet.com');
    const adminPassword = process.env.ADMIN_PASSWORD || (demo ? 'admin123' : randomBootstrapPassword());
    const donorEmail = normalizeEmail(process.env.DONOR_EMAIL || 'ong@adotapet.com');
    const donorPassword = process.env.DONOR_PASSWORD || (demo ? 'doador123' : randomBootstrapPassword());
    const a = hashPassword(adminPassword);
    insert.run('Administrador', adminEmail, a.hash, a.salt, 'admin', '', '', '', now(), 'admin', 'aprovado', now());
    const d = hashPassword(donorPassword);
    insert.run('Protetores de Apodi', donorEmail, d.hash, d.salt, 'doador', 'Apodi', 'RN', '', now(), 'ong', 'aprovado', now());
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

  // Inclui uma única vez os pontos oficiais adicionados ao catálogo sem
  // apagar pontos cadastrados pelo administrador em bancos já existentes.
  const supportMigrationKey = 'migration:support_points_rn_20260909_v2';
  const supportMigration = db.prepare('SELECT key FROM app_state WHERE key = ?').get(supportMigrationKey);
  if (!supportMigration) {
    const current = loadState('supportPoints');
    for (const seededPoint of (seed.supportPoints || [])) {
      const seededIndex = current.findIndex(point => point.seedKey && point.seedKey === seededPoint.seedKey);
      if (seededIndex >= 0) {
        current[seededIndex] = { ...current[seededIndex], ...seededPoint, id: current[seededIndex].id };
        continue;
      }
      const alreadyExists = current.some(point =>
        cleanText(point.name, 160).toLowerCase() === cleanText(seededPoint.name, 160).toLowerCase() &&
        cleanText(point.city, 120).toLowerCase() === cleanText(seededPoint.city, 120).toLowerCase()
      );
      if (!alreadyExists) current.push({ ...seededPoint, id: newId('supportPoints') });
    }
    saveState('supportPoints', current);
    saveState(supportMigrationKey, { appliedAt: now() });
  }
}
ensureSeed();
// Capture existing IDs before any record can be deleted on an upgraded database.
const initializeSequence = db.prepare(
  'INSERT INTO id_sequences(collection, last_id) VALUES (?, ?) ' +
  'ON CONFLICT(collection) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)'
);
for (const collection of COLLECTIONS) initializeSequence.run(collection, highestKnownId(collection));

function migrateLegacyState() {
  const requests = loadState('requests');
  let changed = false;
  const migrated = requests.map(item => {
    const request = { ...item };
    if (request.status === 'aceita') {
      request.status = 'concluida';
      request.stage = 'concluida';
      request.completedAt = request.completedAt || request.acceptedAt || request.updatedAt || request.createdAt;
      request.approvedAt = request.approvedAt || request.acceptedAt || request.completedAt;
      changed = true;
    } else if (request.status === 'recusada') {
      request.status = 'reprovada';
      request.stage = 'encerrada';
      changed = true;
    } else if (request.status === 'pendente' && request.stage === 'entrevista') {
      request.status = 'aprovada';
      changed = true;
    } else if (request.status === 'pendente' && request.stage === 'em_analise') {
      request.status = 'em_analise';
      changed = true;
    }
    return request;
  });
  if (changed) saveState('requests', migrated);
}
migrateLegacyState();
db.exec('PRAGMA optimize;');
db.prepare('DELETE FROM sessions WHERE created_at < ?').run(new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString());

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'");
  if (process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, payload) {
  securityHeaders(res);
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
      try {
        const body = JSON.parse(data);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Objeto JSON esperado.');
        resolve(body);
      }
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
  try { return match ? decodeURIComponent(match[1]) : ''; } catch { return ''; }
}
function setSessionCookie(res, token, remember = false) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  const maxAge = remember ? '; Max-Age=604800' : '';
  res.setHeader('Set-Cookie', `petadopt_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/${maxAge}${secure}`);
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
  if (accountType(user) === 'ong' && user.approval_status !== 'aprovado') {
    error(res, 403, 'O cadastro desta ONG ainda não está aprovado.'); return null;
  }
  if (roles && !roles.includes(user.role)) { error(res, 403, 'Você não tem permissão para esta ação.'); return null; }
  return user;
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').run(token, userId, now());
  return token;
}

function campaignView(campaign, admin = false) {
  const animal = getAnimal(campaign.animalId);
  const visibleAnimal = animal && ['disponivel', 'em_processo', 'adotado'].includes(animal.status);
  const canDonate = campaign.status === 'active' && Boolean(visibleAnimal);
  const { createdBy, ...publicFields } = campaign;
  return { ...publicFields, pixKey: admin || canDonate ? campaign.pixKey : '', canDonate,
    animalName: visibleAnimal || admin ? animal?.name || campaign.animalName : campaign.animalName,
    animalUrl: visibleAnimal ? `animal.html?id=${campaign.animalId}` : null,
    ...(admin ? { createdBy } : {}) };
}
function campaignData(body, previous = null) {
  const fields = ['title', 'description', 'category', 'organizer', 'beneficiary', 'contact', 'pixKeyType', 'pixKey', 'status', 'goalCents', 'raisedCents'];
  const data = previous ? { ...previous } : { raisedCents: 0, status: 'draft' };
  for (const field of fields) if (Object.hasOwn(body, field)) data[field] = body[field];
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  for (const [key, max] of Object.entries({ title: 120, description: 4000, organizer: 120, beneficiary: 120, contact: 160, pixKey: 254 })) {
    if (typeof data[key] !== 'string' || data[key].length > max) invalid(`Confira o campo ${key}.`);
    data[key] = cleanText(data[key], max);
  }
  if (data.title.length < 5 || data.description.length < 30 || !data.organizer || !data.beneficiary || !data.contact) invalid('Preencha o título, a história do pet, o responsável, o beneficiário e o contato.');
  if (!['cirurgia', 'tratamento', 'alimentacao', 'acolhimento'].includes(data.category)) invalid('Escolha a finalidade da campanha.');
  if (!['draft', 'active', 'closed'].includes(data.status)) invalid('Situação da campanha inválida.');
  if (!Number.isSafeInteger(data.goalCents) || data.goalCents < 100 || data.goalCents > 100000000 ||
      !Number.isSafeInteger(data.raisedCents) || data.raisedCents < 0 || data.raisedCents > 100000000) invalid('Informe valores válidos, entre R$ 1 e R$ 1.000.000 para a meta.');
  if (['cpf', 'cnpj'].includes(data.pixKeyType)) data.pixKey = data.pixKey.replace(/[.\-/\s]/g, '');
  if (data.pixKeyType === 'email') data.pixKey = data.pixKey.toLowerCase();
  const keyValid = data.pixKeyType === 'email' ? validEmail(data.pixKey)
    : data.pixKeyType === 'telefone' ? /^\+[1-9]\d{9,14}$/.test(data.pixKey)
    : data.pixKeyType === 'cpf' ? /^\d{11}$/.test(data.pixKey)
    : data.pixKeyType === 'cnpj' ? /^\d{14}$/.test(data.pixKey)
    : data.pixKeyType === 'aleatoria' ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.pixKey) : false;
  if (!keyValid) invalid('A chave Pix não corresponde ao tipo escolhido. Telefone deve incluir + e código do país.');
  if ((!previous || data.pixKey !== previous.pixKey || data.pixKeyType !== previous.pixKeyType || data.beneficiary !== previous.beneficiary) && body.recipientConfirmed !== true) invalid('Confirme o beneficiário e a autorização para publicar a chave Pix.');
  if (!previous) {
    const animal = Number.isSafeInteger(body.animalId) ? getAnimal(body.animalId) : null;
    if (!animal || !['disponivel', 'em_processo', 'adotado'].includes(animal.status)) invalid('Selecione um animal com perfil público.');
    data.animalId = animal.id;
    data.animalName = animal.name;
    data.city = animal.city;
    data.state = animal.state;
    const photo = animal.photos?.[0] || '';
    data.photo = /^(img\/[A-Za-z0-9._/-]+|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+)$/i.test(photo) && photo.length <= 3 * 1024 * 1024 ? photo : '';
    data.updates = [];
  }
  if (data.status === 'active') {
    const animal = getAnimal(data.animalId);
    if (!animal || !['disponivel', 'em_processo', 'adotado'].includes(animal.status)) invalid('O perfil do animal precisa estar público para receber doações.');
  }
  if (data.raisedCents !== (previous?.raisedCents || 0)) {
    const note = cleanText(body.progressNote, 1000);
    if (note.length < 10) invalid('Explique a atualização do valor arrecadado para os apoiadores.');
    data.updates = [...(data.updates || []), { raisedCents: data.raisedCents, note, createdAt: now() }].slice(-50);
  }
  return data;
}


async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;
  let match;

  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, database: 'SQLite', time: now() });
  }

  if (method === 'GET' && pathname === '/api/stats') {
    const animals = loadState('animals');
    const missing = loadState('missing');
    const requests = loadState('requests');
    const followups = loadState('followups');
    return json(res, 200, {
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      organizations: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'doador'").get().n,
      available: animals.filter(a => a.status === 'disponivel').length,
      adopted: animals.filter(a => a.status === 'adotado').length,
      urgent: animals.filter(a => a.status === 'disponivel' && (a.special_needs || a.age_group === 'idoso' || (Date.now() - new Date(a.createdAt).getTime()) > 60 * 86400000)).length,
      missing: missing.filter(m => !m.found).length,
      found: missing.filter(m => m.found).length,
      completedAdoptions: requests.filter(r => r.status === 'concluida').length,
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
    if (accountType(user) === 'ong' && user.approval_status !== 'aprovado') {
      const message = user.approval_status === 'reprovado'
        ? `O cadastro desta ONG não foi aprovado.${user.approval_reason ? ` Motivo: ${user.approval_reason}` : ''}`
        : 'O cadastro da ONG está aguardando a análise de um administrador.';
      return error(res, 403, message);
    }
    const token = createSession(user.id);
    setSessionCookie(res, token, Boolean(body.remember));
    return json(res, 200, { user: publicUser(user, true) });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    if (rateLimit(req, res, 'register', 8, 60 * 60 * 1000)) return;
    const body = await readBody(req);
    const name = cleanText(body.name, 120);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const passwordConfirmation = String(body.passwordConfirmation ?? body.password_confirmation ?? '');
    const type = body.accountType === 'ong' || body.role === 'doador' ? 'ong' : 'usuario';
    const role = type === 'ong' ? 'doador' : 'adotante';
    const city = cleanText(body.city, 120);
    const state = cleanText(body.state, 40);
    const phone = cleanText(body.phone, 50);
    if (name.length < 2) return error(res, 400, 'Informe um nome válido.');
    if (!validEmail(email)) return error(res, 400, 'Informe um e-mail válido.');
    if (!city) return error(res, 400, 'Informe sua cidade.');
    if (phone.replace(/\D/g, '').length < 10) return error(res, 400, 'Informe um telefone válido com DDD.');
    if (!validPassword(password)) return error(res, 400, 'A senha deve ter ao menos 8 caracteres, uma letra e um número.');
    if (password !== passwordConfirmation) return error(res, 400, 'A confirmação da senha não confere.');
    if (body.termsAccepted !== true && body.terms_accepted !== true) return error(res, 400, 'Você precisa aceitar os termos de uso e a política de privacidade.');
    if (db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) return error(res, 409, 'Já existe uma conta com este e-mail.');
    const { salt, hash } = hashPassword(password);
    const approvalStatus = type === 'ong' ? 'pendente' : 'aprovado';
    const approvedAt = type === 'ong' ? null : now();
    const result = db.prepare(`INSERT INTO users(name,email,password_hash,password_salt,role,city,state,phone,created_at,account_type,approval_status,approved_at)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(name, email, hash, salt, role, city, state, phone, now(), type, approvalStatus, approvedAt);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
    if (type === 'ong') {
      const admins = db.prepare("SELECT id FROM users WHERE role='admin'").all();
      admins.forEach(admin => addNotification(admin.id, `Nova ONG aguardando análise: ${name}.`));
      return json(res, 201, { user: publicUser(user, true), pendingApproval: true, message: 'Cadastro enviado. Um administrador precisa aprovar a ONG antes do primeiro acesso.' });
    }
    const token = createSession(user.id);
    setSessionCookie(res, token, Boolean(body.remember));
    return json(res, 201, { user: publicUser(user, true) });
  }

  if (method === 'POST' && pathname === '/api/auth/forgot-password') {
    if (rateLimit(req, res, 'forgot-password', 6, 30 * 60 * 1000)) return;
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (validEmail(email)) {
      const target = db.prepare('SELECT id,name,email FROM users WHERE email=? COLLATE NOCASE').get(email);
      if (target) {
        const reports = loadState('reports');
        reports.push({ id: newId('reports'), reporterUserId: target.id, target_type: 'usuario', target_id: target.id, category: 'recuperacao_senha', reason: `Pedido de recuperação de acesso para ${target.email}.`, status: 'aberta', createdAt: now() });
        saveState('reports', reports);
        db.prepare("SELECT id FROM users WHERE role='admin'").all().forEach(admin => addNotification(admin.id, `Pedido de recuperação de acesso: ${target.name}.`));
      }
    }
    return json(res, 200, { ok: true, message: 'Se o e-mail estiver cadastrado, o pedido de recuperação foi registrado para a equipe responsável.' });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = authUser(req);
    if (!user) return error(res, 401, 'Sessão inválida ou expirada.');
    if (accountType(user) === 'ong' && user.approval_status !== 'aprovado') return error(res, 403, 'O cadastro desta ONG ainda não está aprovado.');
    return json(res, 200, { user: publicUser(user, true) });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  match = pathname.match(/^\/api\/animals\/(\d+)\/public-name$/);
  if (method === 'GET' && match) {
    const animal = getAnimal(match[1]);
    const user = authUser(req);
    if (!animal || (!['disponivel', 'em_processo', 'adotado'].includes(animal.status) && !canManageAnimal(user, animal)))
      return error(res, 404, 'Animal não encontrado.');
    const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(Number(animal.ownerId));
    return json(res, 200, { name: owner?.name || '' });
  }

  if (method === 'GET' && pathname === '/api/users') {
    const requester = requireUser(req, res, ['admin']); if (!requester) return;
    const includePrivate = requester?.role === 'admin';
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    return json(res, 200, rows.map(r => publicUser(r, includePrivate)));
  }

  if (method === 'PATCH' && pathname === '/api/users/me') {
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req);
    const name = cleanText(body.name, 120);
    const city = cleanText(body.city, 120);
    const state = cleanText(body.state, 40);
    const phone = cleanText(body.phone, 50);
    if (name.length < 2 || !city || phone.replace(/\D/g, '').length < 10) return error(res, 400, 'Preencha nome, cidade e telefone corretamente.');
    db.prepare('UPDATE users SET name=?,city=?,state=?,phone=? WHERE id=?').run(name, city, state, phone, user.id);
    return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id), true) });
  }

  match = pathname.match(/^\/api\/users\/(\d+)\/(approve|reject)$/);
  if (method === 'POST' && match) {
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const id = Number(match[1]); const action = match[2]; const body = await readBody(req);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!target) return error(res, 404, 'Usuário não encontrado.');
    if (accountType(target) !== 'ong') return error(res, 400, 'Somente cadastros de ONG passam por esta análise.');
    const status = action === 'approve' ? 'aprovado' : 'reprovado';
    const reason = action === 'reject' ? cleanText(body.reason, 1000) : '';
    db.prepare('UPDATE users SET approval_status=?,approved_by=?,approved_at=?,approval_reason=? WHERE id=?')
      .run(status, admin.id, now(), reason, id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    addNotification(id, action === 'approve' ? 'Seu cadastro de ONG foi aprovado. Você já pode entrar e publicar animais.' : `Seu cadastro de ONG não foi aprovado.${reason ? ` Motivo: ${reason}` : ''}`);
    addAdminLog(admin, `${action === 'approve' ? 'Aprovou' : 'Reprovou'} o cadastro da ONG ${target.name}${reason ? `: ${reason}` : '.'}`);
    return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id), true) });
  }

  match = pathname.match(/^\/api\/users\/(\d+)$/);
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
    if (rateLimit(req, res, 'animals-create', 30, 10 * 60 * 1000)) return;
    const user = requireUser(req, res); if (!user) return;
    if (!canPublish(user)) return error(res, 403, 'Sua conta ainda não tem permissão para publicar animais.');
    const body = await readBody(req);
    const list = loadState('animals');
    const photos = Array.isArray(body.photos) ? body.photos.filter(p => typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('img/'))).slice(0, 3).map(p => p.slice(0, 3 * 1024 * 1024)) : [];
    const record = {
      id: newId('animals'),
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
    if (rateLimit(req, res, 'animals-view', 30, 10 * 60 * 1000)) return;
    const id = Number(match[1]); const list = loadState('animals'); const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return error(res, 404, 'Animal não encontrado.');
    list[idx].views = (Number(list[idx].views) || 0) + 1; saveState('animals', list);
    return json(res, 200, { views: list[idx].views });
  }

  match = pathname.match(/^\/api\/animals\/(\d+)$/);
  if (method === 'PATCH' && match) {
    const user = requireUser(req, res); if (!user) return;
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
    if (Object.prototype.hasOwnProperty.call(body, 'species') && ['cachorro','gato'].includes(body.species)) list[idx].species = body.species;
    if (Object.prototype.hasOwnProperty.call(body, 'sex') && ['macho','femea'].includes(body.sex)) list[idx].sex = body.sex;
    if (Object.prototype.hasOwnProperty.call(body, 'size') && ['pequeno','medio','grande'].includes(body.size)) list[idx].size = body.size;
    if (Object.prototype.hasOwnProperty.call(body, 'age_group') && ['filhote','adulto','idoso'].includes(body.age_group)) list[idx].age_group = body.age_group;
    if (Array.isArray(body.photos)) {
      const photos = body.photos.filter(p => typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('img/'))).slice(0, 3).map(p => p.slice(0, 3 * 1024 * 1024));
      if (photos.length) list[idx].photos = photos;
    }
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
    const user = requireUser(req, res); if (!user) return;
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
    const visible = list.filter(request => Number(request.requesterId) === user.id || canManageRequest(user, request));
    return json(res, 200, visible.map(request => {
      if (!canManageRequest(user, request)) return request;
      const requester = db.prepare('SELECT * FROM users WHERE id=?').get(Number(request.requesterId));
      return { ...request, requester: publicUser(requester, true) };
    }));
  }

  if (method === 'GET' && pathname === '/api/stories') {
    const stories = loadState('requests').filter(r => r.status === 'concluida' && r.story).map(r => ({
      id: r.id, animalId: r.animalId, full_name: r.full_name, story: r.story, acceptedAt: r.completedAt || r.acceptedAt || null
    }));
    return json(res, 200, stories);
  }

  if (method === 'POST' && pathname === '/api/requests') {
    if (rateLimit(req, res, 'requests-create', 30, 10 * 60 * 1000)) return;
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const animal = getAnimal(body.animalId);
    if (!animal) return error(res, 404, 'Animal não encontrado.');
    if (animal.status !== 'disponivel') return error(res, 409, 'Este animal não está disponível para novas solicitações.');
    if (Number(animal.ownerId) === user.id) return error(res, 400, 'Você não pode solicitar a adoção de um animal publicado pela sua própria conta.');
    const list = loadState('requests');
    if (list.some(r => r.animalId === animal.id && r.requesterId === user.id && ['pendente','em_analise','aprovada'].includes(r.status))) {
      return error(res, 409, 'Você já possui uma solicitação ativa para este animal.');
    }
    const record = {
      id: newId('requests'), animalId: animal.id, requesterId: user.id, ownerId: Number(animal.ownerId),
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
      status: 'pendente', stage: 'enviada', createdAt: now(), reviewedBy: null, reviewedAt: null, rejectionReason: ''
    };
    if (!record.responsibility_confirmed) return error(res, 400, 'Confirme o compromisso com a adoção responsável.');
    list.push(record); saveState('requests', list);
    addNotification(user.id, `Sua solicitação para ${animal.name} foi recebida e está pendente de análise.`);
    addNotification(animal.ownerId, `${user.name} enviou uma solicitação de adoção para ${animal.name}.`);
    return json(res, 201, record);
  }

  match = pathname.match(/^\/api\/requests\/(\d+)\/(analyze|approve|accept|interview|reject|complete|cancel|story)$/);
  if (method === 'POST' && match) {
    const id = Number(match[1]); const action = match[2]; const request = getRequest(id);
    if (!request) return error(res, 404, 'Solicitação não encontrada.');
    const body = await readBody(req);
    if (action === 'story') {
      const user = requireUser(req, res); if (!user) return;
      if (request.requesterId !== user.id || request.status !== 'concluida') return error(res, 403, 'Você não pode editar esta história.');
      const list = loadState('requests'); const idx = list.findIndex(r => r.id === id);
      list[idx].story = cleanText(body.story, 3000); list[idx].storyUpdatedAt = now(); saveState('requests', list);
      return json(res, 200, list[idx]);
    }
    const user = requireUser(req, res); if (!user) return;
    if (action === 'cancel') {
      if (Number(request.requesterId) !== user.id) return error(res, 403, 'Somente o interessado pode cancelar esta solicitação.');
      if (!['pendente','em_analise','aprovada'].includes(request.status)) return error(res, 409, 'Esta solicitação já foi encerrada.');
      const requests = loadState('requests'); const idx = requests.findIndex(r => r.id === id);
      requests[idx] = { ...requests[idx], status: 'cancelada', stage: 'encerrada', canceledAt: now(), cancellationReason: cleanText(body.reason, 1000) };
      saveState('requests', requests);
      const animal = getAnimal(request.animalId);
      if (animal?.ownerId) addNotification(animal.ownerId, `${user.name} cancelou a solicitação de adoção para ${animal.name}.`);
      recalcAnimalProcessStatus(request.animalId);
      return json(res, 200, requests[idx]);
    }
    if (!canManageRequest(user, request)) return error(res, 403, 'Você não pode responder a esta solicitação.');
    const animal = getAnimal(request.animalId);
    if (!animal) return error(res, 404, 'Animal não encontrado.');
    const requests = loadState('requests'); const idx = requests.findIndex(r => r.id === id);
    if (action === 'analyze') {
      if (requests[idx].status !== 'pendente') return error(res, 409, 'Esta solicitação já saiu da etapa pendente.');
      requests[idx] = { ...requests[idx], status: 'em_analise', stage: 'em_analise', reviewedBy: user.id, reviewedAt: now() };
      saveState('requests', requests);
      addNotification(request.requesterId, `Sua solicitação para ${animal.name} começou a ser analisada.`);
      return json(res, 200, requests[idx]);
    }
    if (action === 'approve' || action === 'accept') {
      if (!['pendente','em_analise'].includes(requests[idx].status)) return error(res, 409, 'Esta solicitação não pode mais ser aprovada.');
      const approvedAt = now();
      requests[idx] = { ...requests[idx], status: 'aprovada', stage: 'aprovada', reviewedBy: user.id, reviewedAt: approvedAt, approvedBy: user.id, approvedAt };
      saveState('requests', requests);
      const animals = loadState('animals'); const ai = animals.findIndex(a => a.id === animal.id);
      if (ai >= 0 && animals[ai].status === 'disponivel') { animals[ai].status = 'em_processo'; saveState('animals', animals); }
      addNotification(request.requesterId, `Sua solicitação para ${animal.name} foi aprovada. Aguarde o contato para combinar a entrevista e os próximos passos.`);
      return json(res, 200, requests[idx]);
    }
    if (action === 'interview') {
      if (requests[idx].status !== 'aprovada') return error(res, 409, 'Aprove a solicitação antes de registrar a entrevista.');
      requests[idx] = { ...requests[idx], stage: 'entrevista', interviewAt: now() };
      saveState('requests', requests);
      addNotification(request.requesterId, `A etapa de entrevista/contato para a adoção de ${animal.name} foi registrada.`);
      return json(res, 200, requests[idx]);
    }
    if (action === 'complete') {
      if (requests[idx].status !== 'aprovada') return error(res, 409, 'A solicitação precisa estar aprovada antes de concluir a adoção.');
      if (!['disponivel', 'em_processo'].includes(animal.status)) return error(res, 409, 'Este animal não está disponível para concluir a adoção.');
      const completedAt = now();
      requests[idx] = { ...requests[idx], status: 'concluida', stage: 'concluida', completedAt, acceptedAt: completedAt, completedBy: user.id };
      for (let i = 0; i < requests.length; i++) {
        const r = requests[i];
        if (r.animalId === request.animalId && r.id !== id && ['pendente','em_analise','aprovada'].includes(r.status)) {
          requests[i] = { ...r, status: 'cancelada', stage: 'encerrada', closedAt: completedAt };
          addNotification(r.requesterId, `${animal.name} já foi adotado por outra pessoa. Sua solicitação foi encerrada.`);
        }
      }
      saveState('requests', requests);
      const animals = loadState('animals'); const ai = animals.findIndex(a => a.id === animal.id);
      if (ai >= 0) { animals[ai].status = 'adotado'; animals[ai].adoptedAt = completedAt; saveState('animals', animals); }
      const contracts = loadState('contracts').filter(c => c.requestId !== id);
      const adopter = db.prepare('SELECT * FROM users WHERE id=?').get(request.requesterId);
      const owner = db.prepare('SELECT * FROM users WHERE id=?').get(animal.ownerId);
      contracts.push({
        id: newId('contracts'), requestId: id, code: `ADT-${id}-${Date.now().toString(36).toUpperCase()}`,
        animalId: animal.id, animalName: animal.name, species: animal.species, breed: animal.breed || '',
        adopterId: adopter?.id || request.requesterId, adopterName: adopter?.name || request.full_name, adopterCity: adopter?.city || request.city || '',
        ownerId: owner?.id || animal.ownerId, ownerName: owner?.name || 'Responsável pelo animal', ownerCity: owner?.city || animal.city || '',
        acceptedAt: completedAt, ownerAcknowledgedAt: completedAt, adopterAcknowledgedAt: null,
        clauses: [
          'Garantir alimentação, abrigo, cuidados veterinários e tratamento sem maus-tratos.',
          'Manter vacinação e medidas preventivas de saúde adequadas.',
          'Não abandonar, vender ou transferir o animal sem comunicar o responsável pela adoção.',
          'Procurar apoio e organizar devolução responsável caso a adaptação não seja possível.'
        ]
      });
      saveState('contracts', contracts);
      addNotification(request.requesterId, `A adoção de ${animal.name} foi concluída. O termo de adoção responsável já está disponível.`);
      loadState('favorites').filter(f => f.animalId === animal.id && f.userId !== request.requesterId)
        .forEach(f => addNotification(f.userId, `Um animal que você favoritou (${animal.name}) foi adotado.`));
      return json(res, 200, requests.find(r => r.id === id));
    }
    if (action === 'reject') {
      if (!['pendente','em_analise','aprovada'].includes(requests[idx].status)) return error(res, 409, 'Esta solicitação já foi encerrada.');
      const rejectedAt = now(); const rejectionReason = cleanText(body.reason, 1000);
      requests[idx] = { ...requests[idx], status: 'reprovada', stage: 'encerrada', reviewedBy: user.id, reviewedAt: rejectedAt, rejectedBy: user.id, rejectedAt, rejectionReason };
      saveState('requests', requests);
      addNotification(request.requesterId, `Após a análise, sua solicitação para ${animal.name} não foi aprovada desta vez.${rejectionReason ? ` Motivo informado: ${rejectionReason}` : ''} Você pode continuar conhecendo outros animais disponíveis.`);
      recalcAnimalProcessStatus(animal.id);
      return json(res, 200, requests[idx]);
    }
  }

  if (method === 'GET' && pathname === '/api/favorites') {
    const user = requireUser(req, res); if (!user) return;
    return json(res, 200, loadState('favorites').filter(f => f.userId === user.id));
  }
  if (method === 'POST' && pathname === '/api/favorites/toggle') {
    if (rateLimit(req, res, 'favorites-toggle', 30, 10 * 60 * 1000)) return;
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
    if (rateLimit(req, res, 'missing-create', 30, 10 * 60 * 1000)) return;
    const user = requireUser(req, res); if (!user) return;
    const body = await readBody(req); const list = loadState('missing');
    const photo = typeof body.photo === 'string' && (body.photo.startsWith('data:image/') || body.photo.startsWith('img/')) ? body.photo : null;
    const record = {
      id: newId('missing'), ownerId: user.id, name: cleanText(body.name, 120), species: body.species === 'gato' ? 'gato' : 'cachorro',
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
    const record = { id: newId('sightings'), missingAnimalId: missing.id, reporter_name: cleanText(body.reporter_name, 120), reporter_contact: cleanText(body.reporter_contact, 120), location: cleanText(body.location, 300), message: cleanText(body.message, 2000), createdAt: now() };
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
    const record = { id: newId('reports'), reporterUserId: user?.id || null, target_type: cleanText(body.target_type, 30) || 'outro', target_id: body.target_id ? Number(body.target_id) : null, category: cleanText(body.category, 50) || 'outro', reason: cleanText(body.reason, 3000), status: 'aberta', createdAt: now() };
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
    if (!request || request.status !== 'concluida') return error(res, 404, 'Adoção concluída não encontrada.');
    if (request.requesterId !== user.id) return error(res, 403, 'Somente o adotante pode enviar este acompanhamento.');
    const day = Number(body.day);
    if (![7, 30, 90].includes(day)) return error(res, 400, 'Etapa de acompanhamento inválida.');
    const dueAt = new Date(new Date(request.completedAt || request.acceptedAt).getTime() + day * 86400000);
    if (Date.now() < dueAt.getTime()) return error(res, 409, `Este acompanhamento ficará disponível em ${dueAt.toLocaleDateString('pt-BR')}.`);
    const list = loadState('followups');
    if (list.some(f => f.requestId === request.id && f.day === day)) return error(res, 409, 'Este acompanhamento já foi enviado.');
    const record = {
      id: newId('followups'), requestId: request.id, animalId: request.animalId, adopterId: user.id, day,
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
      id: newId('supportPoints'), name: cleanText(body.name, 160), category: cleanText(body.category, 50),
      city: cleanText(body.city, 120), state: cleanText(body.state, 40), address: cleanText(body.address, 300),
      contact: cleanText(body.contact, 160), services: cleanText(body.services, 1000),
      sourceUrl: cleanText(body.sourceUrl, 1000), verified: true, createdAt: now()
    };
    if (!record.name || !record.category || !record.city || !record.state) return error(res, 400, 'Preencha nome, categoria, cidade e estado.');
    if (!validExternalUrl(record.sourceUrl)) return error(res, 400, 'Informe um link oficial válido começando com https://.');
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

  if (method === 'GET' && pathname === '/api/campaigns') {
    const admin = authUser(req)?.role === 'admin';
    const campaigns = loadState('campaigns').filter(c => admin || c.status !== 'draft');
    return json(res, 200, campaigns.map(c => campaignView(c, admin)));
  }
  if (method === 'POST' && pathname === '/api/campaigns') {
    if (rateLimit(req, res, 'campaigns-write', 30, 10 * 60 * 1000)) return;
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const body = await readBody(req);
    const data = campaignData(body);
    const record = { ...data, id: newId('campaigns'), revision: 1, createdBy: admin.id, createdAt: now(), updatedAt: now() };
    const campaigns = loadState('campaigns'); campaigns.push(record); saveState('campaigns', campaigns);
    addAdminLog(admin, `Criou a campanha de arrecadação #${record.id}: ${record.title}.`);
    return json(res, 201, campaignView(record, true));
  }
  match = pathname.match(/^\/api\/campaigns\/(\d+)$/);
  if (method === 'PATCH' && match) {
    if (rateLimit(req, res, 'campaigns-write', 30, 10 * 60 * 1000)) return;
    const admin = requireUser(req, res, ['admin']); if (!admin) return;
    const body = await readBody(req);
    const campaigns = loadState('campaigns'); const index = campaigns.findIndex(c => c.id === Number(match[1]));
    if (index < 0) return error(res, 404, 'Campanha não encontrada.');
    const previous = campaigns[index];
    if (body.revision !== previous.revision) return error(res, 409, 'Esta campanha foi alterada. Recarregue a página antes de salvar.');
    const record = { ...campaignData(body, previous), revision: previous.revision + 1, updatedAt: now() };
    campaigns[index] = record; saveState('campaigns', campaigns);
    addAdminLog(admin, `Atualizou a campanha #${record.id}: ${record.title}. Situação: ${record.status}; total informado: ${record.raisedCents} centavos.`);
    return json(res, 200, campaignView(record, true));
  }

  return error(res, 404, 'Rota da API não encontrada.');
}

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.json':'application/json; charset=utf-8',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf'
};
function serveStatic(req, res, url) {
  securityHeaders(res);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const target = path.resolve(ROOT, '.' + rel);
  const relative = path.relative(ROOT, target);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
    res.writeHead(403, { 'Content-Type':'text/plain; charset=utf-8' });
    return res.end('Acesso negado.');
  }
  const normalized = relative.split(path.sep).join('/').toLowerCase();
  const allowedExtensions = new Set(Object.keys(MIME));
  const segments = normalized.split('/');
  // Only front-end locations are public, even for allowed extensions.
  const publicLocation = (segments.length === 1 && path.extname(normalized) === '.html') ||
    ['js', 'css', 'img', 'fonts'].includes(segments[0]);
  if (segments.some(part => part.startsWith('.')) || normalized === 'data' || normalized.startsWith('data/') ||
      !publicLocation || !allowedExtensions.has(path.extname(normalized))) {
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
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => {
      if (!res.headersSent) error(res, 404, 'Arquivo não encontrado.');
      else res.destroy();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET','HEAD'].includes(req.method)) return error(res, 405, 'Método não permitido.');
    return serveStatic(req, res, url);
  } catch (err) {
    const malformed = err.code === 'ERR_INVALID_URL' || err instanceof URIError;
    const status = malformed ? 400 : (err.status || 500);
    if (status >= 500) console.error(err);
    if (!res.headersSent) error(res, status, malformed ? 'Requisição inválida.' : err.status ? err.message : 'Erro interno do servidor.');
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
