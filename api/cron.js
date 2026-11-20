// Roda uma vez por dia (9h de Brasília) e manda os lembretes para quem é Premium.
const { db, getUser, saveUser, nowBR, MESL, calc, brl, pendingAlerts, send, safeEq } = require('./_lib');

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || !safeEq(auth, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).end();
  const { year, month, day } = nowBR();
  const ids = (await db('SMEMBERS', 'premium')) || [];
  let enviados = 0;

  for (const id of ids) {
    try {
      const u = await getUser(id);
      if (!u || !u.premium || !u.chat) continue;
      const msgs = [];
      if (day === 1) {
        const ant = (month + 11) % 12;
        msgs.push(`📅 Começou ${MESL[month]}! Quanto você faturou em ${MESL[ant]}? Responda assim: /mes ${ant + 1} 7400`);
      }
      if (day === 15) msgs.push('💸 Lembrete: o DAS do MEI vence dia 20. Pague no app do MEI ou no Portal do Empreendedor para evitar multa e juros.');
      if (month === 4 && (day === 2 || day === 25)) msgs.push(`📄 A declaração anual do MEI (DASN-SIMEI) vence em 31 de maio. Ela informa o faturamento de ${year - 1}.`);
      if (day === 1 && month === 0) {
        const c = calc({ ...u, year: year - 1 });
        msgs.push(`🎉 Feliz ano novo! Seu limite foi renovado. No ano passado você anotou ${brl(c.total)}. Comece a anotar ${year} com /mes.`);
      }
      msgs.push(...pendingAlerts(u));
      await saveUser(id, u);
      for (const m of msgs) { await send(u.chat, m); enviados++; }
    } catch (e) { console.error(id, e); }
  }
  res.json({ ok: true, usuarios: ids.length, enviados });
};
