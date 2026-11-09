// End-to-end test of the running app against a test database and mocked Stripe/Resend.
// Usage: BASE=http://localhost:3000 STRIPE_WEBHOOK_SECRET=whsec_... EMAIL_LOG=/path/emails.jsonl node scripts/e2e.mjs
import fs from 'fs';
import Stripe from 'stripe';

const BASE = process.env.BASE || 'http://localhost:3000';
const EMAILS = process.env.EMAIL_LOG;
const stripe = new Stripe('sk_test_dummy');
let failures = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const emails = () => (fs.existsSync(EMAILS) ? fs.readFileSync(EMAILS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);

async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: 'manual',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, res };
}

async function webhook(orderId, amount, type = 'checkout.session.completed') {
  const payload = JSON.stringify({
    id: 'evt_' + orderId, object: 'event', type,
    data: { object: { id: 'cs_test_' + orderId, object: 'checkout.session', payment_status: 'paid', amount_total: amount, payment_intent: 'pi_test', metadata: { order_id: orderId } } },
  });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return call('/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': sig } });
}

const tomorrow = new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const start = emails().length;

// --- Buying
let r = await call('/api/checkout', { method: 'POST', body: { amount: 5, buyerName: 'A', buyerEmail: 'a@x.com', forSelf: true } });
check('reject $5 amount', r.status === 400 && /between/.test(r.data.error), r.data.error);
r = await call('/api/checkout', { method: 'POST', body: { amount: 100, buyerName: 'Lily', buyerEmail: 'lily@example.com', recipientName: 'Mum', recipientEmail: 'bad' } });
check('reject bad recipient email', r.status === 400, r.data.error);
r = await call('/api/checkout', { method: 'POST', body: { amount: 150, buyerName: 'Lily Chen', buyerEmail: 'lily@example.com', recipientName: 'Mum', recipientEmail: 'mum@example.com', message: 'Happy birthday <b>Mum</b>' } });
check('checkout returns Stripe URL', r.data.ok && r.data.url.includes('checkout.stripe.com'), r.data.url);
const orderNow = r.data.url.split('cs_test_')[1];

r = await call(`/success?order=${orderNow}`);
check('thank-you page waits for payment', r.status === 200 && r.data.includes('Just a moment'));

r = await call('/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=bad' } });
check('reject unsigned webhook', r.status === 400);

r = await webhook(orderNow, 15000);
check('webhook accepted', r.status === 200);
let sent = emails().slice(start);
check('receipt + gift card emailed', sent.length === 2 && sent.some(e => e.to?.includes?.('mum@example.com') || e.to === 'mum@example.com'), `${sent.length} emails`);
const giftMail = sent.find(e => JSON.stringify(e.to).includes('mum@example.com'));
check('message is escaped in email', giftMail && giftMail.html.includes('&lt;b&gt;Mum&lt;/b&gt;') && !giftMail.html.includes('<b>Mum</b>'));
const token = giftMail?.html.match(/\/card\/([A-Za-z0-9_-]+)/)?.[1];
check('email links to card page', !!token);

r = await webhook(orderNow, 15000);
check('replayed webhook does not duplicate', r.status === 200 && emails().length - start === 2);

r = await call(`/success?order=${orderNow}`);
check('thank-you page confirms', r.data.includes('on its way'));

r = await call(`/card/${token}`);
check('card page shows balance', r.status === 200 && r.data.includes('$150'));
r = await call(`/card/notarealtoken1234567`);
check('unknown card page is 404', r.status === 404);
r = await call(`/api/qr/${token}`);
check('QR image', r.status === 200 && r.res.headers.get('content-type') === 'image/png');

// --- Scheduled card
r = await call('/api/checkout', { method: 'POST', body: { amount: 80, forSelf: true, buyerName: 'Tom', buyerEmail: 'tom@example.com', deliverDate: tomorrow } });
const orderLater = r.data.url.split('cs_test_')[1];
const before = emails().length;
await webhook(orderLater, 8000);
check('scheduled card: only receipt now', emails().length - before === 1);
r = await call('/api/cron/deliver');
check('cron needs secret', r.status === 401);
r = await call('/api/cron/deliver', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
check('cron does not send early', r.status === 200 && emails().length - before === 1, JSON.stringify(r.data));

// --- Balance check
const giftCode = giftMail.html.match(/MM-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
check('card number in email (MM-XXXX-XXXX)', /^MM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(giftCode || ''), giftCode);
r = await call('/api/balance', { method: 'POST', body: { code: giftCode.toLowerCase() } });
check('public balance check', r.data.ok && r.data.balance_cents === 15000);
r = await call('/api/balance', { method: 'POST', body: { code: 'MM-AAAA-BBBB' } });
check('balance: unknown card', r.status === 404);

// --- Staff
r = await call('/api/staff/lookup', { method: 'POST', body: { code: giftCode } });
check('lookup needs login', r.status === 401);
r = await call('/api/staff/login', { method: 'POST', body: { pin: '9999' } });
check('wrong PIN refused', r.status === 401);
r = await call('/api/staff/login', { method: 'POST', body: { pin: '1357' } });
const amy = r.res.headers.get('set-cookie')?.split(';')[0];
check('staff login', r.data.ok && r.data.role === 'staff' && !!amy);
r = await call('/api/staff/lookup', { method: 'POST', body: { code: giftCode }, cookie: amy });
check('staff lookup', r.data.ok && r.data.card.balance_cents === 15000);
r = await call('/api/staff/lookup', { method: 'POST', body: { code: `${BASE}/card/${token}` }, cookie: amy });
check('staff lookup from scanned QR link', r.data.ok && r.data.card.balance_cents === 15000);
r = await call('/api/staff/redeem', { method: 'POST', body: { code: giftCode, amountCents: 3050, reference: 'Table 7' }, cookie: amy });
check('redeem $30.50', r.data.ok && r.data.balance_cents === 11950);
const redeemTx = r.data.transaction_id;
await new Promise(res => setTimeout(res, 800));
const rmail = emails().at(-1);
check('holder emailed new balance', JSON.stringify(rmail.to).includes('mum@example.com') && rmail.subject.includes('$119.50 left'), rmail.subject);
r = await call('/api/staff/today', { cookie: amy });
check('today list shows redemption', r.data.ok && r.data.total_cents === 3050 && r.data.items[0].staff === 'Amy');
r = await call('/api/staff/redeem', { method: 'POST', body: { code: giftCode, amountCents: 20000 }, cookie: amy });
check('over-redeem refused with balance', r.status === 409 && r.data.balance_cents === 11950);
r = await call('/api/admin/stats', { cookie: amy });
check('staff cannot open admin', r.status === 403);

// --- Manager
r = await call('/api/staff/login', { method: 'POST', body: { pin: '2468' } });
const boss = r.res.headers.get('set-cookie')?.split(';')[0];
r = await call('/api/admin/stats', { cookie: boss });
check('manager stats', r.data.ok && r.data.stats.outstanding_cents === 11950 + 8000, JSON.stringify(r.data.stats));
r = await call('/api/admin/cards?q=mum', { cookie: boss });
check('search by name', r.data.ok && r.data.total === 1);
const cardId = r.data.cards[0].id;
r = await call(`/api/admin/card?id=${cardId}`, { cookie: boss });
check('card detail with history', r.data.ok && r.data.transactions.length === 2 && r.data.order?.buyer_name === 'Lily Chen');
r = await call('/api/admin/reverse', { method: 'POST', body: { transactionId: redeemTx }, cookie: boss });
check('undo redemption', r.data.ok && r.data.balance_cents === 15000);
r = await call('/api/admin/resend', { method: 'POST', body: { id: cardId, email: 'mum.new@example.com' }, cookie: boss });
check('resend to new address', r.data.ok && JSON.stringify(emails().at(-1).to).includes('mum.new@example.com'));
r = await call('/api/admin/issue', { method: 'POST', body: { amount: 50, reason: 'Complaint, table 12', recipientName: 'Sam', recipientEmail: 'sam@example.com' }, cookie: boss });
check('issue complimentary card and email it', r.data.ok && r.data.emailed === 'sent');
r = await call('/api/admin/issue', { method: 'POST', body: { amount: 50 }, cookie: boss });
check('issue needs a reason', r.status === 400);

const rows = [
  { code: 'TAO-1001', original: '$200', balance: '120.00', expiry: '31/12/2027', name: 'Kim' },
  { code: 'TAO1002', original: '100', balance: '100', issued: '2025-03-01' },
  { code: 'TAO1003', original: '100', balance: '150', expiry: '2027-01-01' },
  { code: 'TAO1001', original: '50', expiry: '2027-01-01' },
  { code: '', original: '50' },
];
r = await call('/api/admin/import', { method: 'POST', body: { rows, commit: false }, cookie: boss });
check('import preview finds problems', r.data.ok && r.data.preview && r.data.ready === 2 && r.data.problems.length === 3, JSON.stringify(r.data.problems.map(p => p.problems)));
check('import preview totals', r.data.readyBalanceCents === 22000);
const countBefore = (await call('/api/admin/cards', { cookie: boss })).data.total;
check('preview saves nothing', countBefore === 3, `total=${countBefore}`);
r = await call('/api/admin/import', { method: 'POST', body: { rows, commit: true }, cookie: boss });
check('import commits good rows', r.data.imported === 2);
r = await call('/api/staff/lookup', { method: 'POST', body: { code: 'tao 1001' }, cookie: amy });
check('legacy voucher redeemable', r.data.ok && r.data.card.balance_cents === 12000 && r.data.card.source === 'tao_legacy');
r = await call('/api/staff/lookup', { method: 'POST', body: { code: 'TAO1002' }, cookie: amy });
const exp = new Date(r.data.card.expires_at).toLocaleString('en-CA', { timeZone: 'Australia/Sydney', hourCycle: 'h23' });
check('legacy expiry = end of day, 3 years from issue (Sydney)', exp.startsWith('2028-03-01, 23:59:59'), exp);
r = await call('/api/admin/import', { method: 'POST', body: { rows, commit: false }, cookie: boss });
check('re-import skips existing codes', r.data.ready === 0);

r = await call('/api/admin/void', { method: 'POST', body: { id: cardId, reason: 'Refunded' }, cookie: boss });
check('cancel card', r.data.ok);
r = await call('/api/staff/redeem', { method: 'POST', body: { code: giftCode, amountCents: 100 }, cookie: amy });
check('cancelled card refused at till', r.status === 409 && /cancelled/.test(r.data.error));
r = await call('/api/admin/export', { cookie: boss });
check('CSV export', r.status === 200 && r.data.split('\n').length === 6 && r.data.startsWith('Card number'), `${r.data.split('\n').length} lines`);
r = await call('/api/admin/export');
check('export needs login', r.status === 401);

for (const p of ['/', '/balance', '/staff', '/admin']) {
  r = await call(p);
  check(`page ${p} renders`, r.status === 200);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll end-to-end tests passed');
process.exit(failures ? 1 : 0);
