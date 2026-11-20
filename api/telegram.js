// Robô do Telegram: ativa os alertas, recebe o faturamento do mês e responde o status.
const { db, getUser, saveUser, validId, nowBR, num, brl, MESL, resumo, pendingAlerts, send, jsonBody, safeEq, SITE } = require('./_lib');

const AJUDA = `Comandos:
/mes 7400 — anota o faturamento deste mês
/mes 10 7400 — anota o faturamento de outubro (mês 10)
/status — mostra quanto você já usou do limite
/site — link para abrir seus dados em qualquer celular
/cancelar — gerenciar ou cancelar a assinatura
/ajuda — esta lista`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!safeEq(req.headers['x-telegram-bot-api-secret-token'] || '', process.env.TELEGRAM_WEBHOOK_SECRET || '')) return res.status(401).end();
  const up = await jsonBody(req);
  const msg = up.message;
  if (!msg || !msg.text) return res.status(200).json({ ok: true });
  const chat = msg.chat.id, text = msg.text.trim();
  const [cmd, ...args] = text.split(/\s+/);

  try {
    // /start <id> liga o Telegram à conta do site
    if (cmd === '/start') {
      const id = args[0];
      if (!validId(id)) { await send(chat, `Olá! Para ativar os alertas, assine o Premium em ${SITE} e toque em "Ativar no Telegram".`); return res.status(200).json({ ok: true }); }
      const u = await getUser(id);
      if (!u || !u.premium) { await send(chat, `Ainda não encontrei sua assinatura. Se acabou de pagar, espere 1 minuto e toque em "Ativar no Telegram" de novo. Para assinar: ${SITE}`); return res.status(200).json({ ok: true }); }
      const old = await db('GET', 'chat:' + chat);
      if (old && old !== id) { const ou = await getUser(old); if (ou) { delete ou.chat; await saveUser(old, ou); } }
      u.chat = chat; await saveUser(id, u); await db('SET', 'chat:' + chat, id);
      await send(chat, `✅ Alertas ativados!\n\nVou te lembrar do DAS todo mês, perguntar seu faturamento no dia 1º e avisar se você chegar perto do limite.\n\n${AJUDA}`);
      return res.status(200).json({ ok: true });
    }

    const id = await db('GET', 'chat:' + chat);
    const u = id ? await getUser(id) : null;
    if (!u || !u.premium) { await send(chat, `Este recurso é do Premium. Assine em ${SITE}`); return res.status(200).json({ ok: true }); }

    if (cmd === '/mes') {
      const { year, month } = nowBR();
      let m = month, val = args[0];
      if (args.length >= 2) { m = parseInt(args[0], 10) - 1; val = args[1]; }
      if (!(m >= 0 && m <= 11) || !val || num(val) < 0) { await send(chat, 'Não entendi. Exemplo: /mes 7400 ou /mes 10 7400'); return res.status(200).json({ ok: true }); }
      if (u.year !== year) { u.year = year; u.v = Array(12).fill(''); }
      u.v[m] = String(Math.round(num(val)));
      const alerts = pendingAlerts(u);
      await saveUser(id, u);
      await send(chat, `Anotado: ${MESL[m]} = ${brl(num(val))}\n\n${resumo(u)}`);
      for (const a of alerts) await send(chat, a);
    } else if (cmd === '/status') {
      await send(chat, resumo(u));
    } else if (cmd === '/site') {
      await send(chat, `Abra este link para ver seus dados em qualquer celular (não compartilhe):\n${SITE}/?id=${id}`);
    } else if (cmd === '/cancelar') {
      const portal = process.env.STRIPE_PORTAL_URL;
      await send(chat, portal ? `Para gerenciar ou cancelar sua assinatura, acesse:\n${portal}` : 'Para cancelar, responda esta conversa com "cancelar" e faremos o cancelamento.');
    } else {
      await send(chat, AJUDA);
    }
  } catch (e) {
    console.error(e);
  }
  res.status(200).json({ ok: true });
};
