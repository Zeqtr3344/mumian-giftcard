// Fraud-protection tests: purchase limits, refund / dispute / early-fraud-warning webhooks.
// Usage: BASE=http://localhost:3000 STRIPE_WEBHOOK_SECRET=whsec_... EMAIL_LOG=/path/emails.jsonl REFUND_LOG=/path/refunds.jsonl node scripts/e2e-fraud.mjs
import fs from 'fs';
import Stripe from 'stripe';

const BASE = process.env.BASE || 'http://localhost:3000';
const stripe = new Stripe('sk_test_dummy');
let failures = 0;
const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) failures++; };
const lines = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);
const emails = () => lines(process.env.EMAIL_LOG).map(l => JSON.parse(l));

async function call(path, { method = 'GET', body, headers = {}, ip } = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const t = res.headers.get('content-type') || '';
  return { status: res.status, data: t.includes('json') ? await res.json() : await res.text() };
}
async function event(type, object) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object } });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return call('/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': sig } });
}
const orderFrom = url => url.split('cs_test_')[1];
async function buy(amount, email, ip) {
  const r = await call('/api/checkout', { method: 'POST', ip, body: { amount, buyerName: 'Buyer', buyerEmail: email, recipientName: 'Friend', recipientEmail: 'friend+' + Math.random().toString(36).slice(2, 6) + '@example.com' } });
  if (!r.data.ok) return r;
  const order = orderFrom(r.data.url), pi = 'pi_' + order.replace(/-/g, '').slice(0, 20);
  await event('checkout.session.completed', { id: 'cs_test_' + order, object: 'checkout.session', payment_status: 'paid', amount_total: amount * 100, payment_intent: pi, metadata: { order_id: order } });
  return { ...r, order, pi };
}
async function cardFor(order) {
  const r = await call('/rest/v1/gift_cards?order_id=eq.' + order + '&select=code,status,balance_cents,initial_cents', { headers: { apikey: 'x' } });
  return r.data?.[0];
}
// Read cards straight from PostgREST (the local stand-in for Supabase).
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = { apikey: K, authorization: 'Bearer ' + K };
const pg = (q) => fetch('http://localhost:3001/' + q, { headers: AUTH }).then(r => r.json());

// 1. 3D Secure requested on every checkout
await buy(50, 'tds@example.com', '10.0.0.1');
const sess = lines('/var/tmp/e2e/stripe.jsonl').pop() || '';
check('checkout asks the bank for 3D Secure', new URLSearchParams(sess).get('payment_method_options[card][request_three_d_secure]') === 'any');

// 2. Purchase limits: 3 cards / $1,500 a day per buyer and per device
const ip = '10.0.0.2';
const a = await buy(100, 'limit@example.com', ip), b = await buy(100, 'limit@example.com', ip), c = await buy(100, 'limit@example.com', ip);
const d = await call('/api/checkout', { method: 'POST', ip, body: { amount: 100, buyerName: 'Buyer', buyerEmail: 'limit@example.com', forSelf: true } });
check('4th card in a day from same buyer refused', d.status === 429 && /limited/.test(d.data.error), d.data.error);
const e = await call('/api/checkout', { method: 'POST', ip, body: { amount: 100, buyerName: 'Other', buyerEmail: 'other@example.com', forSelf: true } });
check('…and a new email from the same device is refused too', e.status === 429);
const big1 = await buy(1000, 'big@example.com', '10.0.0.3');
const big2 = await call('/api/checkout', { method: 'POST', ip: '10.0.0.3', body: { amount: 600, buyerName: 'Big', buyerEmail: 'big@example.com', forSelf: true } });
check('over $1,500 in a day refused', big2.status === 429);
const fresh = await call('/api/checkout', { method: 'POST', ip: '10.0.0.4', body: { amount: 100, buyerName: 'New', buyerEmail: 'new@example.com', forSelf: true } });
check('a normal buyer is not affected', fresh.data.ok === true);
check('large sale ($1,000) alerts the team', emails().some(m => m.to === 'mumian@taogroup.com.au' || (Array.isArray(m.to) && m.to.includes('mumian@taogroup.com.au'))) && emails().some(m => /Large gift card sold/.test(m.subject)));

// 3. Full refund cancels the card
let card = (await pg('gift_cards?order_id=eq.' + a.order))[0];
check('card active after purchase', card?.status === 'active');
await event('charge.refunded', { id: 'ch_1', object: 'charge', refunded: true, payment_intent: a.pi, metadata: { order_id: a.order } });
card = (await pg('gift_cards?order_id=eq.' + a.order))[0];
check('full refund cancels the card', card?.status === 'void' && card.balance_cents === 0);
check('order marked refunded', (await pg('orders?id=eq.' + a.order))[0]?.status === 'refunded');

// 4. Chargeback (dispute) freezes the card and alerts the team
const before = emails().length;
await event('charge.dispute.created', { id: 'dp_1', object: 'dispute', amount: 10000, reason: 'fraudulent', payment_intent: b.pi });
card = (await pg('gift_cards?order_id=eq.' + b.order))[0];
check('dispute cancels the card', card?.status === 'void');
check('order marked disputed', (await pg('orders?id=eq.' + b.order))[0]?.status === 'disputed');
check('dispute alert emailed to the team', emails().slice(before).some(m => /disputed/.test(m.subject)));

// 5. Early fraud warning on an unused card → automatic refund + cancel
const r0 = lines('/var/tmp/e2e/refunds.jsonl').length;
await event('radar.early_fraud_warning.created', { id: 'issfr_1', object: 'radar.early_fraud_warning', fraud_type: 'unauthorized_use_of_card', payment_intent: c.pi, charge: 'ch_x' });
card = (await pg('gift_cards?order_id=eq.' + c.order))[0];
check('fraud warning cancels the card', card?.status === 'void');
check('unused card refunded automatically', lines('/var/tmp/e2e/refunds.jsonl').length === r0 + 1 && /payment_intent=/.test(lines('/var/tmp/e2e/refunds.jsonl').pop()));

// 6. Fraud warning on a part-used card: cancel the rest, no automatic refund
const big = (await pg('gift_cards?order_id=eq.' + big1.order))[0];
await fetch('http://localhost:3001/rpc/redeem_card', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ p_code: big.code, p_amount: 25000, p_staff: null }) });
const r1 = lines('/var/tmp/e2e/refunds.jsonl').length;
await event('radar.early_fraud_warning.created', { id: 'issfr_2', object: 'radar.early_fraud_warning', fraud_type: 'unauthorized_use_of_card', payment_intent: big1.pi, charge: 'ch_y' });
check('part-used card: remaining balance cancelled', (await pg('gift_cards?order_id=eq.' + big1.order))[0]?.status === 'void');
check('part-used card: no automatic refund (team decides)', lines('/var/tmp/e2e/refunds.jsonl').length === r1);

console.log(failures ? `\n${failures} test(s) failed` : '\nAll fraud-protection tests passed');
process.exit(failures ? 1 : 0);
