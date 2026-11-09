import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { Footer } from '../../components';
import { cardByToken, cardState, cardUrl } from '@/lib/cards';
import { venue } from '@/lib/config';
import { db } from '@/lib/db';
import { dollars, formatCode, sydneyDate } from '@/lib/util';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your gift card', robots: { index: false, follow: false } };

const money = (c: number) => (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const when = (s: string) => new Date(s).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (s: string) => new Date(s).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const card = await cardByToken((await params).token);
  if (!card) notFound();
  const state = cardState(card);
  const qr = await QRCode.toDataURL(cardUrl(card), { width: 480, margin: 1, color: { dark: '#231F20ff', light: '#FFFFFFff' } });
  const { data: tx } = await db().from('card_transactions').select('id, kind, amount_cents, created_at')
    .eq('card_id', card.id).order('created_at', { ascending: false }).limit(30);
  const pct = card.initial_cents ? Math.max(0, Math.min(100, (card.balance_cents / card.initial_cents) * 100)) : 0;
  const forLine = [card.recipient_name && `For ${card.recipient_name}`, card.sender_name && `from ${card.sender_name}`].filter(Boolean).join(', ');
  const label = (k: string) => k === 'redeem' ? 'Dinner at MuMian' : k === 'reverse' ? 'Refunded to card' : k === 'void' ? 'Card cancelled' : k === 'issue'
    ? (card.source === 'tao_legacy' ? 'Tao Group voucher' : card.sender_name ? `Gift from ${card.sender_name}` : 'Gift card') : 'Adjustment';

  return (
    <>
      <main className="col cardpage">
        <div className="head">
          <a href="/"><img src="/logo-red.png" alt="MūMiān 木棉" width={109} height={34} /></a>
          <span className="small muted mono" style={{ fontWeight: 400, letterSpacing: 1 }}>{formatCode(card.code)}</span>
        </div>

        <div className={`gcard bal${state !== 'active' ? ' dim' : ''}`}>
          <img className="flower" src="/flower-a.png" alt="" style={{ right: -50, top: -24, height: 260 }} />
          <div className="eyebrow">{state === 'active' ? 'Available balance' : state === 'used' ? 'Fully used' : state === 'expired' ? 'Expired' : 'Cancelled'}</div>
          <div className="amtrow"><span className="big num">{money(card.balance_cents)}</span><span className="of">of {dollars(card.initial_cents)}</span></div>
          <div className="bar" role="img" aria-label={`${Math.round(pct)}% of the card left`}><div style={{ width: `${pct}%` }} /></div>
          <div className="small" style={{ color: 'var(--ink-2)' }}>{forLine ? `${forLine} · ` : ''}{state === 'expired' ? 'Expired' : 'Expires'} {sydneyDate(card.expires_at)}</div>
        </div>

        {state === 'active' && (
          <div className="qr">
            <div className="qrbox"><img src={qr} alt={`QR code for gift card ${formatCode(card.code)}`} width={160} height={160} /></div>
            <p className="soft">Show this to your waiter when you pay</p>
          </div>
        )}
        {state !== 'active' && <p className="note">{state === 'used' ? 'This card has been fully used. Thank you for dining with us.' : state === 'expired' ? 'This card has expired.' : 'This card has been cancelled.'} Questions? Email {venue.email}.</p>}

        {!!tx?.length && (
          <section className="stack" style={{ gap: 4 }}>
            <div className="label" style={{ marginBottom: 6 }}>History</div>
            <div className="rows">
              {tx.map(t => (
                <div key={t.id}>
                  <span className="t"><span>{label(t.kind)}</span><span>{t.kind === 'issue' ? day(card.issued_at) : when(t.created_at)}</span></span>
                  <b style={t.amount_cents > 0 ? { color: '#2E6B3C' } : undefined}>{t.amount_cents < 0 ? '−' : '+'}{money(Math.abs(t.amount_cents))}</b>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="stack">
          <a className="btn" href={venue.booking}>Book a table</a>
          <a className="btn outline" href="/">Buy a gift card for someone</a>
        </div>
      </main>
      <Footer />
      <style>{`
        .cardpage { display: flex; flex-direction: column; gap: 22px; padding-block: calc(26px + env(safe-area-inset-top, 0px)) 0; }
        .head { display: flex; justify-content: space-between; align-items: baseline; }
        .gcard.bal { min-height: 0; justify-content: flex-start; gap: 12px; }
        .amtrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .big { font-size: 52px; font-weight: 700; line-height: 1; }
        .of { font-size: 15px; color: #4A3C38; }
        .bar { width: 62%; height: 8px; border-radius: 4px; background: #CFB3A8; overflow: hidden; }
        .bar div { height: 8px; background: var(--red); }
        .qr { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .qrbox { background: #fff; border: 1px solid var(--rule); border-radius: 16px; padding: 16px; }
        .soft { font-size: 15px; color: var(--soft); }
      `}</style>
    </>
  );
}
