import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { cleanText, dollars, isEmail, sydneyMidnight, sydneyToday } from '@/lib/util';

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

  const { data: order, error } = await db().from('orders').insert({
    amount_cents: amount * 100,
    buyer_name: buyerName, buyer_email: buyerEmail,
    recipient_name: recipientName, recipient_email: recipientEmail,
    message: message || null,
    deliver_at: deliverAt.toISOString(),
  }).select('id').single();
  if (error || !order) {
    console.error('checkout: order insert failed', error?.code, error?.message, error?.hint);
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
          name: `MuMian Dining gift card · ${dollars(amount * 100)}`,
          description: `For ${recipientName}. Valid for ${Math.round(config.expiryMonths / 12)} years.`,
        },
      },
    }],
    metadata: { order_id: order.id },
    payment_intent_data: { metadata: { order_id: order.id }, description: `MuMian gift card ${order.id}` },
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
