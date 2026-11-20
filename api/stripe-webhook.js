// Recebe avisos da Stripe: assinatura paga liga o Premium; assinatura cancelada desliga.
const crypto = require('crypto');
const { db, getUser, saveUser, newUser, validId, send, rawBody, safeEq, SITE } = require('./_lib');

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).map(([k, ...v]) => [k, v.join('=')]));
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const t = parts.t;
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some(s => safeEq(s, expected));
}

async function setPremium(id, on, extra = {}) {
  const u = (await getUser(id)) || newUser();
  Object.assign(u, extra, { premium: on });
  await saveUser(id, u);
  await db(on ? 'SADD' : 'SREM', 'premium', id);
  return u;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await rawBody(req);
  if (!verify(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).send('assinatura inválida');
  const ev = JSON.parse(raw), o = ev.data && ev.data.object;

  try {
    if (ev.type === 'checkout.session.completed') {
      const id = o.client_reference_id;
      if (validId(id)) {
        const u = await setPremium(id, true, { sub: o.subscription || null, customer: o.customer || null });
        if (o.subscription) await db('SET', 'sub:' + o.subscription, id);
        if (u.chat) await send(u.chat, '✅ Pagamento confirmado! Seu Premium está ativo. Mande /status para ver como está seu limite.');
      }
    }
    if (ev.type === 'customer.subscription.deleted' || (ev.type === 'customer.subscription.updated' && ['canceled', 'unpaid', 'incomplete_expired'].includes(o.status))) {
      const id = await db('GET', 'sub:' + o.id);
      if (validId(id)) {
        const u = await setPremium(id, false);
        if (u.chat) await send(u.chat, `Sua assinatura Premium foi encerrada. Os alertas foram pausados. Para voltar, assine de novo em ${SITE}`);
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).send('erro');
  }
  res.status(200).json({ ok: true });
};
