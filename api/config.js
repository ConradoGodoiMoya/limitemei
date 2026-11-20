// O site pergunta se o Premium já está configurado e qual é o robô do Telegram.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    pagamento: !!process.env.STRIPE_PAYMENT_LINK,
    bot: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
  });
};
