// O site consulta se a pessoa é Premium e sincroniza os meses dela na nuvem.
// GET  /api/user?id=...  -> { premium, linked, data }
// POST /api/user {id, ab, teto, v, year} -> salva (só para Premium)
const { getUser, saveUser, validId, pendingAlerts, send, jsonBody, nowBR } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      if (!validId(id)) return res.status(400).json({ error: 'id' });
      const u = await getUser(id);
      if (!u) return res.json({ premium: false, linked: false });
      return res.json({ premium: !!u.premium, linked: !!u.chat, data: { ab: u.ab, teto: u.teto, v: u.v, year: u.year } });
    }
    if (req.method === 'POST') {
      const b = await jsonBody(req);
      if (!validId(b.id)) return res.status(400).json({ error: 'id' });
      const u = await getUser(b.id);
      if (!u || !u.premium) return res.status(403).json({ error: 'premium' });
      const ab = Number(b.ab), teto = Number(b.teto);
      if (Number.isInteger(ab) && ab >= -1 && ab <= 11) u.ab = ab;
      if ([81000, 110000, 140000].includes(teto)) u.teto = teto;
      if (Array.isArray(b.v) && b.v.length === 12) u.v = b.v.map(x => String(x ?? '').slice(0, 20));
      u.year = Number(b.year) || nowBR().year;
      // só consome os alertas quando já dá para enviá-los no Telegram
      const alerts = u.chat ? pendingAlerts(u) : [];
      await saveUser(b.id, u);
      for (const a of alerts) await send(u.chat, a);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
