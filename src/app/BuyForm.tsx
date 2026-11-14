'use client';
import { useEffect, useMemo, useState } from 'react';
import { GiftCardFace } from './components';
import { bonusCents, PROMO, promoActive } from '@/lib/promo';

const PRESETS = [50, 100, 200, 500];

const todaySydney = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const prettyDate = (ymd: string) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Where the buyer came from (e.g. the Christmas email), so campaign sales can be counted. Kept for the visit. */
function useUtm() {
  const [utm, setUtm] = useState<{ source?: string; campaign?: string }>({});
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const fresh = { source: q.get('utm_source') || undefined, campaign: q.get('utm_campaign') || undefined };
      if (fresh.source || fresh.campaign) sessionStorage.setItem('mm-utm', JSON.stringify(fresh));
      setUtm(fresh.source || fresh.campaign ? fresh : JSON.parse(sessionStorage.getItem('mm-utm') || '{}'));
    } catch { /* storage blocked: no tracking, purchase still works */ }
  }, []);
  return utm;
}

export default function BuyForm({ min, max, cancelled }: { min: number; max: number; cancelled: boolean }) {
  const [gift, setGift] = useState(true);
  const [amount, setAmount] = useState(200);
  const [custom, setCustom] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [later, setLater] = useState(false);
  const [date, setDate] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const utm = useUtm();
  const [error, setError] = useState(cancelled ? 'Payment was cancelled, so no card was bought. You can try again below.' : '');

  const today = useMemo(todaySydney, []);
  const value = custom ? Number(custom) : amount;
  const valid = Number.isInteger(value) && value >= min && value <= max;
  const bonus = valid ? bonusCents(value * 100) / 100 : 0;
  const showPromo = promoActive();
  const forLine = gift
    ? (recipientName ? `For ${recipientName}${buyerName ? `, from ${buyerName}` : ''}` : undefined)
    : (buyerName ? `For ${buyerName}` : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!valid) return setError(`Choose an amount between $${min} and $${max}.`);
    if (later && !date) return setError('Pick the day the card should arrive.');
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value, forSelf: !gift, recipientName, recipientEmail, message, buyerName, buyerEmail, deliverDate: later ? date : today, utmSource: utm.source, utmCampaign: utm.campaign }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="col buy" onSubmit={submit} noValidate>
      <GiftCardFace amount={valid ? `$${value + bonus}` : '$—'} forLine={forLine} />
      {showPromo && (
        <div className="promo" role="note">
          <b>{PROMO.name}: up to $75 extra</b>
          <span>{bonus ? `You pay $${value}, the card holds $${value + bonus}.` : 'Add $10 on cards from $100, $25 from $200 and $75 from $500.'} Until {PROMO.endsLabel}.</span>
        </div>
      )}

      <div className="stack">
        <div className="label">Who is it for?</div>
        <div className="seg" role="radiogroup" aria-label="Who is it for?">
          <button type="button" role="radio" aria-checked={!gift} className={!gift ? 'on' : ''} onClick={() => setGift(false)}>For me</button>
          <button type="button" role="radio" aria-checked={gift} className={gift ? 'on' : ''} onClick={() => setGift(true)}>Send as a gift</button>
        </div>
      </div>

      <div className="stack">
        <div className="label">Choose an amount</div>
        <div className="amounts" role="radiogroup" aria-label="Amount">
          {PRESETS.map(p => (
            <button type="button" key={p} role="radio" aria-checked={!custom && amount === p} className={`amt${!custom && amount === p ? ' on' : ''}`} onClick={() => { setAmount(p); setCustom(''); }}>${p}{showPromo && bonusCents(p * 100) ? <small className="plus">+${bonusCents(p * 100) / 100}</small> : null}</button>
          ))}
        </div>
        <label className="f">Or enter your own amount
          <input id="custom" inputMode="numeric" placeholder={`$ Custom amount ($${min}–$${max})`} value={custom ? `$${custom}` : ''} onChange={e => setCustom(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
      </div>

      {gift && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="label">Who are you sending it to?</div>
          <label className="f">Recipient&rsquo;s name<input id="r-name" value={recipientName} onChange={e => setRecipientName(e.target.value)} autoComplete="off" maxLength={80} /></label>
          <label className="f">Recipient&rsquo;s email<input id="r-email" type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} autoComplete="off" maxLength={200} /></label>
          <label className="f">Your message<textarea id="msg" rows={3} value={message} onChange={e => setMessage(e.target.value.slice(0, 300))} placeholder="Happy birthday! Dinner is on me." /></label>
        </div>
      )}

      <div className="stack">
        <div className="label">When should it arrive?</div>
        <div className="when">
          <button type="button" className={!later ? 'on' : ''} onClick={() => setLater(false)}><b>Send now</b></button>
          <button type="button" className={later ? 'on' : ''} onClick={() => setLater(true)}><b>On a date</b>{later && <span>{date ? prettyDate(date) : 'Choose below'}</span>}</button>
        </div>
        {later && <label className="f">Delivery date (arrives that morning, Sydney time)<input id="date" type="date" min={today} value={date} onChange={e => setDate(e.target.value)} /></label>}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <label className="f">Your name{gift ? ' (shown on the gift)' : ''}<input id="b-name" value={buyerName} onChange={e => setBuyerName(e.target.value)} autoComplete="name" maxLength={80} /></label>
        <label className="f">Your email (for the receipt{gift ? '' : ' and your card'})<input id="b-email" type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} autoComplete="email" maxLength={200} /></label>
      </div>

      <div className="stack">
        <div className="total"><span>Total</span><b className="num">{valid ? `$${value.toFixed(2)}` : '—'}</b></div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Opening secure payment…' : `Pay ${valid ? `$${value.toFixed(2)}` : ''}`}</button>
        <p className="muted small center">Apple Pay, Google Pay or card on the next screen, secured by Stripe.</p>
      </div>

      <style>{`
        .buy { display: flex; flex-direction: column; gap: 26px; padding-block: 26px 8px; }
        .promo { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid #9D2A17; border-radius: 12px; background: rgba(157,42,23,.07); font-size: 15px; }
        .promo b { color: #9D2A17; }
        .plus { display: block; font-size: 11px; font-weight: 700; color: #9D2A17; margin-top: 2px; }
        .amt.on .plus { color: inherit; }
        .amounts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .amt { min-height: 52px; line-height: 1.1; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: 500 17px var(--f-body); cursor: pointer; font-variant-numeric: tabular-nums; }
        .amt.on { border: 2px solid var(--red); background: var(--red); color: #fff; font-weight: 700; }
        .when { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .when button { height: 64px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: 500 15px var(--f-body); text-align: left; padding: 0 14px; display: flex; flex-direction: column; justify-content: center; gap: 2px; cursor: pointer; }
        .when button b { font-weight: 500; }
        .when button.on { border: 2px solid var(--red); }
        .when button.on b { font-weight: 700; }
        .when button span { font-size: 14px; color: var(--red); }
        .total { display: flex; justify-content: space-between; font-size: 17px; }
      `}</style>
    </form>
  );
}
