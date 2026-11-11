import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { createHash } from 'crypto';
import { clientId } from '@/lib/session';
import { cleanText, dollars, isEmail, sydneyMidnight, sydneyToday } from '@/lib/util';
import { bonusCents, PROMO } from '@/lib/promo';

// Anti-fraud limits (stolen-card gift card scams): per buyer email and per device/IP.
const DAY_MAX_ORDERS = 3;          // paid orders in 24 hours
const DAY_MAX_CENTS = 1500 * 100;  // paid value in 24 hours
const HOUR_MAX_STARTS = 8;         // checkout attempts in an hour (stops card testing)

export const runtime = 'nodejs';

// POST /api/checkout → creates a pending order and a Stripe Checkout page, returns its URL.
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('Something went wrong. Please try again.'); }

  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount < config.minDollars || amount > config.maxDollars) {
    return bad(`Choose an amount between $${config.minDollars} and $${config.maxDollars} in whole dollars.`);
  }
  const buyerName = cleanText(b.buyerName, 80);
  const buyerEmail = cleanText(b.buyerEmail, 200).toLowerCase();
  const forSelf = b.forSelf === true;
  const recipientName = forSelf ? buyerName : cleanText(b.recipientName, 80);
  const recipientEmail = forSelf ? buyerEmail : cleanText(b.recipientEmail, 200).toLowerCase();
  const message = cleanText(b.message, 300);
  if (!buyerName) return bad('Add your name.');
  if (!isEmail(buyerEmail)) return bad('Add a valid email for your receipt.');
  if (!recipientName) return bad('Add the name of the person receiving the card.');
  if (!isEmail(recipientEmail)) return bad('Add a valid email for the person receiving the card.');

  // Delivery: today (now) or the morning of a chosen day, up to a year ahead.
  const today = sydneyToday();
  const date = typeof b.deliverDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.deliverDate) ? b.deliverDate : today;
  if (date < today) return bad('The delivery date is in the past.');
  const deliverAt = date === today ? new Date() : sydneyMidnight(date);
  if (deliverAt.getTime() > Date.now() + 366 * 864e5) return bad('Choose a delivery date within the next 12 months.');

  // Limits: refuse if this buyer or device has already bought a lot in the last day.
  const client = createHash('sha256').update((await clientId()) + 'mumian-orders').digest('hex').slice(0, 24);
  const dayAgo = new Date(Date.now() - 864e5).toISOString(), hourAgo = new Date(Date.now() - 36e5).toISOString();
  const [byEmail, byClient, starts] = await Promise.all([
    db().from('orders').select('amount_cents').eq('buyer_email', buyerEmail).eq('status', 'paid').gte('created_at', dayAgo),
    db().from('orders').select('amount_cents').eq('client_hash', client).eq('status', 'paid').gte('created_at', dayAgo),
    db().from('orders').select('id', { count: 'exact', head: true }).eq('client_hash', client).gte('created_at', hourAgo),
  ]);
  const sum = (r: { data: { amount_cents: number }[] | null }) => (r.data ?? []).reduce((a, o) => a + o.amount_cents, 0);
  const tooMany = [byEmail, byClient].some(r => (r.data?.length ?? 0) >= DAY_MAX_ORDERS || sum(r) + amount * 100 > DAY_MAX_CENTS);
  if (tooMany || (starts.count ?? 0) >= HOUR_MAX_STARTS) {
    console.warn('checkout: purchase limit hit', { client, email: buyerEmail.replace(/^(.).*@/, '$1***@') });
    return bad(`For security, online gift card purchases are limited to ${DAY_MAX_ORDERS} cards or $${DAY_MAX_CENTS / 100} a day. For larger or corporate orders, please email ${config.replyTo}.`, 429);
  }

  const bonus = bonusCents(amount * 100);
  const { data: order, error } = await db().from('orders').insert({
    client_hash: client,
    amount_cents: amount * 100,
    bonus_cents: bonus,
    buyer_name: buyerName, buyer_email: buyerEmail,
    recipient_name: recipientName, recipient_email: recipientEmail,
    message: message || null,
    deliver_at: deliverAt.toISOString(),
  }).select('id').single();
  if (error || !order) {
    console.error('checkout: order insert failed', error?.code, String(error?.message ?? '').replace(/sb_secret_\S+|sk_(live|test)_\S+|eyJ\S+/g, '[key hidden]'));
    return bad('We could not start your order. Please try again.', 500);
  }

  let session;
  try {
  session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: buyerEmail,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'aud',
        unit_amount: amount * 100,
        product_data: {
          name: bonus ? `MuMian Dining gift card · ${dollars(amount * 100)} + ${dollars(bonus)} ${PROMO.name}` : `MuMian Dining gift card · ${dollars(amount * 100)}`,
          description: `For ${recipientName}. ${bonus ? `Card value ${dollars(amount * 100 + bonus)}. ` : ''}Valid for ${Math.round(config.expiryMonths / 12)} years.`,
        },
      },
    }],
    metadata: { order_id: order.id },
    payment_intent_data: { metadata: { order_id: order.id }, description: `MuMian gift card ${order.id}` },
    // Ask the card's bank to verify the buyer (3D Secure). Fraud chargebacks on verified payments usually fall on the bank, not us.
    payment_method_options: { card: { request_three_d_secure: 'any' } },
    success_url: `${config.appUrl}/success?order=${order.id}`,
    cancel_url: `${config.appUrl}/?cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });
  } catch (e) {
    console.error('checkout: stripe session failed', (e as Error).message);
    return bad('We could not start your order. Please try again.', 500);
  }

  await db().from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
  return Response.json({ ok: true, url: session.url });
}

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}
