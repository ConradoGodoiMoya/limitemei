// Leva a pessoa para o link de pagamento da Stripe, marcando quem ela é (client_reference_id).
const { validId } = require('./_lib');

module.exports = (req, res) => {
  const id = String(req.query.id || '');
  const link = process.env.STRIPE_PAYMENT_LINK;
  if (!link) return res.status(503).send('Pagamento ainda não configurado.');
  if (!validId(id)) return res.status(400).send('Identificador inválido.');
  const url = new URL(link);
  url.searchParams.set('client_reference_id', id);
  res.writeHead(302, { Location: url.toString() }).end();
};
