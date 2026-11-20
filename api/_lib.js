// Funções compartilhadas: banco de dados (Upstash Redis via REST), Telegram, cálculo do limite.
const crypto = require('crypto');

const SITE = process.env.SITE_URL || 'https://limitemei.vercel.app';
const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ---------- banco de dados ----------
const DB_URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const DB_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function db(...cmd) {
  const r = await fetch(DB_URL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${DB_TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error('db: ' + j.error);
  return j.result;
}

async function getUser(id) {
  if (!validId(id)) return null;
  const raw = await db('GET', 'u:' + id);
  return raw ? JSON.parse(raw) : null;
}
async function saveUser(id, u) { await db('SET', 'u:' + id, JSON.stringify(u)); }
function newUser() { return { premium: false, year: nowBR().year, ab: -1, teto: 81000, v: Array(12).fill(''), alerts: {} }; }
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(id);

// ---------- data no fuso de Brasília ----------
function nowBR() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

// ---------- cálculo (mesma regra do site) ----------
const num = s => { s = String(s ?? '').replace(/[^\d,.-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

function calc(u) {
  const { year, month } = nowBR();
  const v = u.year === year ? u.v : Array(12).fill('');
  const m0 = Math.max(0, u.ab ?? -1), lim = (u.teto || 81000) / 12 * (12 - m0);
  let total = 0, cheios = 0, ultimo = -1;
  for (let i = m0; i < 12; i++) if (v[i] !== '' && v[i] != null) { total += num(v[i]); cheios++; ultimo = i; }
  const media = cheios ? total / cheios : 0;
  const futuros = Math.max(0, 11 - Math.max(ultimo, month - 1));
  const proj = total + media * futuros;
  let estoura = -1, acc = 0;
  for (let i = m0; i < 12; i++) { acc += (v[i] !== '' && v[i] != null) ? num(v[i]) : (i > ultimo ? media : 0); if (acc > lim) { estoura = i; break; } }
  return { total, lim, pct: lim ? total / lim : 0, proj, estoura, media, cheios, rest: lim - total, porMes: futuros ? (lim - total) / futuros : lim - total };
}

function resumo(u) {
  const c = calc(u);
  if (!c.cheios) return 'Você ainda não anotou nenhum mês. Mande, por exemplo: /mes 7400';
  let s = `Faturado no ano: ${brl(c.total)}\nSeu limite: ${brl(c.lim)} (${Math.round(c.pct * 100)}% usado)\n`;
  if (c.total > c.lim * 1.2) s += '🔴 Passou mais de 20% do limite. Procure um contador: o prazo para comunicar é o último dia útil do mês seguinte ao excesso.';
  else if (c.total > c.lim) s += '🟠 Passou do limite, mas dentro dos 20%. Vai pagar um DAS complementar e virar Microempresa em janeiro.';
  else if (c.proj > c.lim) s += `🔴 No ritmo atual você estoura em ${MESL[c.estoura]}. Para fechar o ano dentro do limite, fature no máximo ${brl(c.porMes)} por mês daqui em diante.`;
  else if (c.pct >= 0.8) s += `🟡 Atenção: já usou ${Math.round(c.pct * 100)}% do limite. Ainda pode faturar ${brl(c.rest)}.`;
  else s += `🟢 Tudo certo. No ritmo atual você fecha o ano em ${brl(c.proj)}.`;
  return s;
}

// alertas de faixa, enviados uma vez por ano cada
function pendingAlerts(u) {
  const c = calc(u), { year } = nowBR(), out = [];
  u.alerts = u.alerts || {};
  const check = (key, cond, msg) => { const k = key + year; if (cond && !u.alerts[k]) { u.alerts[k] = 1; out.push(msg); } };
  check('p80_', c.pct >= 0.8 && c.total <= c.lim, `🟡 Alerta: você já usou ${Math.round(c.pct * 100)}% do limite do MEI. Ainda pode faturar ${brl(c.rest)} este ano.`);
  check('proj_', c.proj > c.lim && c.total <= c.lim && c.estoura >= 0, `🔴 Alerta: no ritmo atual você estoura o limite em ${MESL[Math.max(0, c.estoura)]}. Mantenha no máximo ${brl(c.porMes)} por mês daqui em diante.`);
  check('p100_', c.total > c.lim && c.total <= c.lim * 1.2, '🟠 Você passou do limite do MEI (até 20%). Vai pagar um DAS complementar sobre o excesso e virar Microempresa em janeiro. Converse com um contador.');
  check('p120_', c.total > c.lim * 1.2, '🔴 Você passou mais de 20% do limite. A saída do MEI vale desde janeiro e precisa ser comunicada até o último dia útil do mês seguinte. Procure um contador agora.');
  return out;
}

// ---------- Telegram ----------
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
const send = (chat, text) => tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });

// ---------- utilidades HTTP ----------
// Lê o corpo cru sem tocar em req.body (na Vercel, ler req.body consome o corpo e quebra a assinatura da Stripe).
async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}
async function jsonBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { return JSON.parse(b.toString()); } catch { return {}; } }
  const s = await rawBody(req);
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = { SITE, MESL, db, getUser, saveUser, newUser, validId, nowBR, num, brl, calc, resumo, pendingAlerts, tg, send, rawBody, jsonBody, safeEq };
