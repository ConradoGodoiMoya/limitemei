// Abra uma vez /api/setup?key=SEU_CRON_SECRET depois de configurar tudo.
// Liga o robô do Telegram ao site e confere se cada parte está configurada.
const { db, tg, SITE } = require('./_lib');

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.query.key !== process.env.CRON_SECRET) return res.status(401).send('Chave errada.');
  const check = {};
  try { await db('PING'); check.banco = 'ok'; } catch (e) { check.banco = 'ERRO: ' + e.message; }
  check.stripe_link = process.env.STRIPE_PAYMENT_LINK ? 'ok' : 'FALTA STRIPE_PAYMENT_LINK';
  check.stripe_webhook = process.env.STRIPE_WEBHOOK_SECRET ? 'ok' : 'FALTA STRIPE_WEBHOOK_SECRET';
  check.portal = process.env.STRIPE_PORTAL_URL ? 'ok' : 'opcional: STRIPE_PORTAL_URL';
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) {
    const r = await tg('setWebhook', { url: `${SITE}/api/telegram`, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] });
    await tg('setMyCommands', { commands: [
      { command: 'mes', description: 'Anotar o faturamento do mês' },
      { command: 'status', description: 'Ver quanto já usou do limite' },
      { command: 'site', description: 'Abrir seus dados no site' },
      { command: 'cancelar', description: 'Gerenciar a assinatura' },
    ] });
    check.telegram = r.ok ? 'ok' : 'ERRO: ' + r.description;
  } else check.telegram = 'FALTA TELEGRAM_BOT_TOKEN ou TELEGRAM_WEBHOOK_SECRET';
  check.bot_nome = process.env.TELEGRAM_BOT_USERNAME ? 'ok' : 'FALTA TELEGRAM_BOT_USERNAME';
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(Object.entries(check).map(([k, v]) => `${k}: ${v}`).join('\n'));
};
