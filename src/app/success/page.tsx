import { Footer, TopBar } from '../components';
import { venue } from '@/lib/config';
import { db } from '@/lib/db';
import { dollars, sydneyDate } from '@/lib/util';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Thank you' };

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const id = (await searchParams).order || '';
  const { data: order } = /^[0-9a-f-]{36}$/.test(id)
    ? await db().from('orders').select('status, amount_cents, bonus_cents, recipient_name, recipient_email, buyer_email, deliver_at').eq('id', id).maybeSingle()
    : { data: null };

  const paid = order?.status === 'paid';
  const later = order && new Date(order.deliver_at) > new Date();
  const self = order && order.recipient_email === order.buyer_email;

  return (
    <>
      <TopBar />
      <main className="col done">
        {!order && <><h1>We couldn&rsquo;t find that order</h1><p className="muted">If you were charged, check your email for the receipt and reply to it. We&rsquo;ll sort it out.</p></>}
        {order && !paid && (
          <>
            <AutoRefresh seconds={3} />
            <div className="eyebrow muted">Confirming payment</div>
            <h1>Just a moment&hellip;</h1>
            <p className="muted">We&rsquo;re confirming your payment with Stripe. This page updates by itself.</p>
          </>
        )}
        {order && paid && (
          <>
            <div className="eyebrow muted">Thank you</div>
            <h1>Your {dollars(order.amount_cents + (order.bonus_cents ?? 0))} gift card is on its way</h1>
            {order.bonus_cents ? <p className="muted">Includes your {dollars(order.bonus_cents)} Christmas bonus.</p> : null}
            <p className="lede">
              {self
                ? later ? `It will arrive in your inbox on the morning of ${sydneyDate(order.deliver_at)}.` : 'It is in your inbox now.'
                : later ? `We'll email it to ${order.recipient_name} on the morning of ${sydneyDate(order.deliver_at)}.` : `We've emailed it to ${order.recipient_name}.`}
            </p>
            <p className="muted">Your receipt has gone to {order.buyer_email}. If it hasn&rsquo;t arrived in a few minutes, check your spam folder.</p>
            <div className="stack" style={{ marginTop: 8 }}><a className="btn" href={venue.booking}>Book a table</a><a className="btn outline" href="/">Buy another gift card</a></div>
          </>
        )}
      </main>
      <Footer />
      <style>{`.done { padding-block: 40px 8px; display: flex; flex-direction: column; gap: 14px; } .done h1 { font-size: 34px; line-height: 1.1; } .lede { font-size: 18px; }`}</style>
    </>
  );
}
