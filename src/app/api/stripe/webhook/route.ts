import type Stripe from 'stripe';
import { config } from '@/lib/config';
import { issueCard } from '@/lib/cards';
import { db } from '@/lib/db';
import { deliverIfDue, sendReceiptEmail } from '@/lib/email';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

// Stripe calls this when a payment completes. Safe to receive the same event many times.
export async function POST(req: Request) {
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get('stripe-signature') || '', config.stripeWebhookSecret);
  } catch {
    return new Response('Bad signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== 'paid') return Response.json({ received: true });
    const orderId = s.metadata?.order_id;
    if (!orderId) return Response.json({ received: true });
    await fulfil(orderId, s);
  }

  if (event.type === 'charge.refunded') {
    // Refunds are recorded on the order. Cancel the card from the admin page if it should stop working.
    const ch = event.data.object as Stripe.Charge;
    const orderId = ch.metadata?.order_id;
    if (orderId && ch.refunded) await db().from('orders').update({ status: 'refunded' }).eq('id', orderId);
  }

  return Response.json({ received: true });
}

async function fulfil(orderId: string, s: Stripe.Checkout.Session) {
  // Claim the order: only the first delivery of this event moves it from pending to paid.
  const { data: order } = await db().from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: String(s.payment_intent ?? '') })
    .eq('id', orderId).eq('status', 'pending')
    .select('*').maybeSingle();

  let cardId: string | null = null;
  if (order) {
    if (s.amount_total !== order.amount_cents) console.error('Amount mismatch on order', orderId, s.amount_total, order.amount_cents);
    let card;
    try {
      card = await issueCard({
        source: 'online',
        amountCents: s.amount_total ?? order.amount_cents,
        orderId,
        recipientName: order.recipient_name,
        recipientEmail: order.recipient_email,
        senderName: order.buyer_email === order.recipient_email ? null : order.buyer_name,
        message: order.message,
        deliverAt: new Date(order.deliver_at),
      });
    } catch (e) {
      // Put the order back so Stripe's automatic retry can try again.
      await db().from('orders').update({ status: 'pending' }).eq('id', orderId);
      throw e;
    }
    cardId = card.id;
    const sendsNow = new Date(order.deliver_at) <= new Date();
    try { await sendReceiptEmail(order, sendsNow); } catch (e) { console.error('Receipt email failed', orderId, e); }
  } else {
    // Retry of an event we already handled: make sure the card exists and the email went out.
    const { data: c } = await db().from('gift_cards').select('id').eq('order_id', orderId).maybeSingle();
    if (!c) {
      const { data: o } = await db().from('orders').select('status').eq('id', orderId).maybeSingle();
      if (o?.status === 'paid') {
        // Paid but card creation failed last time: reset so the next retry issues it.
        await db().from('orders').update({ status: 'pending' }).eq('id', orderId);
        throw new Error('Card missing for paid order; Stripe will retry');
      }
      return;
    }
    cardId = c.id;
  }
  if (cardId) await deliverIfDue(cardId);
}
