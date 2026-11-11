import type Stripe from 'stripe';
import { config } from '@/lib/config';
import { issueCard } from '@/lib/cards';
import { db } from '@/lib/db';
import { deliverIfDue, sendReceiptEmail, sendStaffAlert } from '@/lib/email';
import { dollars, formatCode } from '@/lib/util';
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
    // Full refund: the card stops working (whatever is left on it is cancelled).
    const ch = event.data.object as Stripe.Charge;
    const orderId = ch.metadata?.order_id || (await orderIdForPI(ch.payment_intent));
    if (orderId && ch.refunded) {
      await db().from('orders').update({ status: 'refunded' }).eq('id', orderId).neq('status', 'disputed');
      const c = await voidCardForOrder(orderId, 'Payment refunded');
      if (c) await alert(`Gift card cancelled after refund: ${formatCode(c.code)}`, [
        `The payment for gift card ${formatCode(c.code)} (${dollars(c.initial_cents)}) was fully refunded in Stripe, so the card has been cancelled.`,
        c.spent > 0 ? `Note: ${dollars(c.spent)} had already been used at the restaurant before the refund.` : 'It had not been used.',
      ]);
    }
  }

  if (event.type === 'charge.dispute.created') {
    // A chargeback: freeze the card straight away and tell the team.
    const d = event.data.object as Stripe.Dispute;
    const orderId = await orderIdForPI(d.payment_intent);
    if (orderId) {
      await db().from('orders').update({ status: 'disputed' }).eq('id', orderId);
      const c = await voidCardForOrder(orderId, `Payment disputed (${d.reason})`);
      await alert(`ACTION NEEDED: gift card payment disputed (${dollars(d.amount)})`, [
        `A cardholder has disputed a gift card payment of ${dollars(d.amount)} (reason: ${d.reason}). This is often a stolen credit card.`,
        c ? `Gift card ${formatCode(c.code)} has been cancelled automatically. ${c.spent > 0 ? `${dollars(c.spent)} had already been spent at the restaurant.` : 'It had not been used.'}` : 'No gift card was found for this payment.',
        'Please open the dispute in the Stripe dashboard (Payments → Disputes) and respond before the deadline if you want to contest it, for example with the redemption record and any CCTV or booking details.',
      ]);
    }
  }

  if (event.type === 'radar.early_fraud_warning.created') {
    // The card's bank has flagged the payment as fraud. If the gift card is unused, refund now:
    // this cancels the card and avoids a chargeback and its fee.
    const w = event.data.object as Stripe.Radar.EarlyFraudWarning;
    const pi = typeof w.payment_intent === 'string' ? w.payment_intent : w.payment_intent?.id;
    const orderId = await orderIdForPI(pi ?? null);
    if (orderId) {
      const { data: card } = await db().from('gift_cards').select('id, code, initial_cents, balance_cents, status').eq('order_id', orderId).maybeSingle();
      const unused = card && card.status === 'active' && card.balance_cents === card.initial_cents;
      let refunded = false;
      if (unused && pi && process.env.AUTO_REFUND_FRAUD_WARNINGS !== 'off') {
        try { await stripe().refunds.create({ payment_intent: pi, reason: 'fraudulent', metadata: { order_id: orderId } }); refunded = true; } catch (e) { console.error('Auto refund failed', orderId, (e as Error).message); }
      }
      const c = await voidCardForOrder(orderId, 'Bank fraud warning');
      await alert(`Fraud warning on a gift card purchase${c ? `: ${formatCode(c.code)}` : ''}`, [
        `The card's bank has warned that a gift card payment was made with a stolen or misused card (${w.fraud_type}).`,
        c ? `Gift card ${formatCode(c.code)} (${dollars(c.initial_cents)}) has been cancelled.` : 'No active gift card was found.',
        refunded ? 'It had not been used, so the payment was refunded automatically. This avoids a chargeback and its fee. Nothing else to do.'
                 : c && c.spent > 0 ? `${dollars(c.spent)} had already been spent at the restaurant, so it was not refunded automatically. Please review it in Stripe.` : 'Please review the payment in Stripe.',
      ]);
    }
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
        amountCents: (s.amount_total ?? order.amount_cents) + (order.bonus_cents ?? 0),
        note: order.bonus_cents ? `Includes ${dollars(order.bonus_cents)} Christmas bonus (paid ${dollars(s.amount_total ?? order.amount_cents)})` : null,
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
    if ((s.amount_total ?? order.amount_cents) >= 30000) {
      await alert(`Large gift card sold: ${dollars(s.amount_total ?? order.amount_cents)}`, [
        `A ${dollars(s.amount_total ?? order.amount_cents)} gift card was bought online by ${order.buyer_name} (${order.buyer_email}) for ${order.recipient_name} (${order.recipient_email}).`,
        'Most large orders are genuine. If the card is used soon for a big bill by someone who does not match these details, it is worth a friendly check, as stolen credit cards are sometimes used this way.',
      ]);
    }
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

async function orderIdForPI(pi: string | Stripe.PaymentIntent | null): Promise<string | null> {
  const id = typeof pi === 'string' ? pi : pi?.id;
  if (!id) return null;
  const { data } = await db().from('orders').select('id').eq('stripe_payment_intent', id).maybeSingle();
  if (data?.id) return data.id;
  try { const p = await stripe().paymentIntents.retrieve(id); return p.metadata?.order_id || null; } catch { return null; }
}

/** Cancels the order's card if it still has a balance. Returns what happened, or null if there was nothing to cancel. */
async function voidCardForOrder(orderId: string, reason: string): Promise<{ code: string; initial_cents: number; spent: number } | null> {
  const { data: card } = await db().from('gift_cards').select('id, code, initial_cents, balance_cents, status').eq('order_id', orderId).maybeSingle();
  if (!card || card.status !== 'active') return null;
  const { error } = await db().rpc('void_card', { p_card: card.id, p_staff: null, p_reason: reason });
  if (error) console.error('void_card failed', orderId, error.message);
  return { code: card.code, initial_cents: card.initial_cents, spent: card.initial_cents - card.balance_cents };
}

async function alert(subject: string, lines: string[]) {
  try { await sendStaffAlert(subject, lines); } catch (e) { console.error('Staff alert failed', subject, e); }
}
