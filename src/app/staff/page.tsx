'use client';
import { useCallback, useEffect, useState } from 'react';
import Scanner from './Scanner';
import { PinLogin, post, type Me } from './PinLogin';

type Card = { code: string; rawCode: string; balance_cents: number; initial_cents: number; expires_at: string; state: 'active' | 'used' | 'expired' | 'void'; recipient_name: string | null; source: string };
type Today = { id: number; code: string; staff: string; amount_cents: number; created_at: string; reversed: boolean };

const money = (c: number) => (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const day = (s: string) => new Date(s).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' });
const time = (s: string) => new Date(s).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' });
const fcode = (c: string) => (c.startsWith('MM') ? ['MM', ...(c.slice(2).match(/.{1,4}/g) ?? [])].join('-') : c.match(/.{1,4}/g)?.join('-') ?? c);

export default function StaffApp() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => { fetch('/api/staff/me').then(r => r.json()).then(d => setMe(d.ok ? d : null)).catch(() => setMe(null)); }, []);

  return (
    <div className="staff">
      <header className="sbar">
        <div className="sbrand"><img src="/logo-white.png" alt="MūMiān 木棉" width={90} height={28} /><span>STAFF · REDEEM</span></div>
        {me && <button className="who" onClick={async () => { await post('/api/staff/logout'); setMe(null); }}>Signed in: {me.name}<br /><u>Log out</u></button>}
      </header>
      <main className="smain">
        {me === undefined && <p className="muted">Loading…</p>}
        {me === null && <PinLogin onIn={setMe} />}
        {me && <Redeem me={me} onLoggedOut={() => setMe(null)} />}
      </main>
      <style>{`
        body { background: var(--paper-2); }
        .staff { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; max-width: 560px; margin: 0 auto; }
        .sbar { background: var(--ink); color: #fff; padding: calc(18px + env(safe-area-inset-top, 0px)) max(20px, env(safe-area-inset-right, 0px)) 18px max(20px, env(safe-area-inset-left, 0px)); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .sbrand { display: flex; flex-direction: column; gap: 2px; }
        .sbrand img { height: 28px; width: auto; }
        .sbrand span { font-size: 13px; letter-spacing: 2px; color: var(--blush); }
        .who { background: none; border: 0; color: var(--blush); font: 14px var(--f-body); text-align: right; cursor: pointer; line-height: 1.4; }
        .smain { flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 22px max(20px, env(safe-area-inset-right, 0px)) calc(32px + env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px)); }
        .cardhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .cardhead span:first-child { font-size: 14px; letter-spacing: 1px; color: var(--soft); }
        .bigbal { font-size: 48px; font-weight: 700; line-height: 1.1; }
        .amountIn { height: 64px; border: 2px solid var(--ink); border-radius: 12px; background: #fff; color: var(--ink); padding: 0 16px; font: 700 32px var(--f-body); width: 100%; font-variant-numeric: tabular-nums; }
        .amountIn:focus { outline: none; border-color: var(--red); }
        .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .split > div { background: #fff; border: 1px solid #E2D6CF; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .split span { font-size: 13px; color: var(--soft); }
        .split b { font-size: 20px; font-variant-numeric: tabular-nums; }
        .confirm { height: 58px; border-radius: 14px; font-size: 19px; }
        .today > div { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid #E2D6CF; font-size: 15px; }
        .today > div:last-child { border-bottom: 1px solid #E2D6CF; }
        .today s { color: var(--mute); }
        .tick { width: 84px; height: 84px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; margin: 8px auto 0; font-size: 44px; }
      `}</style>
    </div>
  );
}

type Step = 'find' | 'scan' | 'card' | 'done';

function TodayList({ refreshKey }: { refreshKey: number }) {
  const [d, setD] = useState<{ items: Today[]; total_cents: number } | null>(null);
  useEffect(() => { fetch('/api/staff/today').then(r => r.json()).then(x => x.ok && setD(x)).catch(() => {}); }, [refreshKey]);
  if (!d) return null;
  return (
    <section className="stack" style={{ gap: 4 }}>
      <div className="cardhead"><span className="label" style={{ color: 'var(--ink)', fontSize: 15, letterSpacing: 1 }}>TODAY&rsquo;S REDEMPTIONS</span><b className="num">{money(d.total_cents)}</b></div>
      <div className="today">
        {d.items.map(t => (
          <div key={t.id}>
            <span>{fcode(t.code)} · {t.staff} · {time(t.created_at)}</span>
            {t.reversed ? <s className="num">{money(t.amount_cents)}</s> : <b className="num">{money(t.amount_cents)}</b>}
          </div>
        ))}
        {!d.items.length && <div><span className="muted">No gift cards redeemed yet today.</span></div>}
      </div>
    </section>
  );
}

function Redeem({ me, onLoggedOut }: { me: Me; onLoggedOut: () => void }) {
  const [step, setStep] = useState<Step>('find');
  const [code, setCode] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ redeemed: number; balance: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reset = () => { setStep('find'); setCode(''); setCard(null); setAmount(''); setRef(''); setError(''); setResult(null); setRefreshKey(k => k + 1); };

  const lookup = useCallback(async (c: string) => {
    setBusy(true); setError('');
    const d = await post('/api/staff/lookup', { code: c });
    setBusy(false);
    if (d.loggedOut) return onLoggedOut();
    if (!d.ok) { setError(d.error); setStep('find'); return; }
    setCard(d.card); setStep('card');
  }, [onLoggedOut]);

  const onScan = useCallback((c: string) => { lookup(c); }, [lookup]);

  // Opened from a guest's QR with the phone camera: the card page sends staff here with ?code=…
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) { window.history.replaceState(null, '', '/staff'); setCode(c); lookup(c); }
  }, [lookup]);
  const cents = Math.round(Number(amount || '0') * 100);

  async function redeem(useCents: number) {
    if (!card) return;
    setBusy(true); setError('');
    const d = await post('/api/staff/redeem', { code: card.rawCode, amountCents: useCents, reference: ref });
    setBusy(false);
    if (d.loggedOut) return onLoggedOut();
    if (!d.ok) {
      setError(d.error + (d.balance_cents !== undefined ? ` (card has ${money(d.balance_cents)})` : ''));
      if (d.balance_cents !== undefined) setCard({ ...card, balance_cents: d.balance_cents });
      return;
    }
    setResult({ redeemed: d.redeemed_cents, balance: d.balance_cents });
    setStep('done'); setRefreshKey(k => k + 1);
  }

  if (step === 'scan') return <Scanner onCode={onScan} onClose={() => setStep('find')} />;

  if (step === 'find') return (
    <>
      <button className="btn confirm" onClick={() => { setError(''); setStep('scan'); }}>Scan the guest&rsquo;s QR code</button>
      <p className="center muted small">or type the card number</p>
      <form onSubmit={e => { e.preventDefault(); lookup(code); }} style={{ display: 'flex', gap: 8 }}>
        <input id="code" className="in mono" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="MM-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Card number" />
        <button className="btn dark" style={{ height: 46 }} disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 4}>{busy ? '…' : 'Find'}</button>
      </form>
      {error && <p className="err" role="alert">{error}</p>}
      <TodayList refreshKey={refreshKey} />
    </>
  );

  if (step === 'card' && card) {
    const usable = card.state === 'active';
    const over = cents > card.balance_cents;
    const take = over ? card.balance_cents : cents;
    return (
      <>
        <div className="panel stack" style={{ gap: 12 }}>
          <div className="cardhead">
            <span>CARD {card.code}</span>
            <span className={`pill ${usable ? 'ok' : 'bad'}`}>{usable ? 'VALID' : card.state === 'used' ? 'USED UP' : card.state === 'expired' ? 'EXPIRED' : 'CANCELLED'}</span>
          </div>
          <div className="stack" style={{ gap: 2 }}><span className="small" style={{ color: 'var(--soft)' }}>Current balance</span><span className="bigbal num">{money(card.balance_cents)}</span></div>
          <div className="small" style={{ color: 'var(--soft)' }}>{card.state === 'expired' ? 'Expired' : 'Expires'} {day(card.expires_at)}{card.recipient_name ? ` · Holder: ${card.recipient_name}` : ''}{card.source === 'tao_legacy' ? ' · Tao Group voucher' : ''}</div>
        </div>
        {usable ? (
          <>
            <label className="f" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', gap: 8 }}>Amount to take off the card
              <input id="amount" className="amountIn" inputMode="decimal" value={amount ? `$${amount}` : ''} placeholder="$0.00" onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2}).+/, '$1'))} />
            </label>
            <div className="split">
              <div><span>Taking off</span><b>{money(take)}</b></div>
              <div><span>Left on card</span><b>{money(card.balance_cents - take)}</b></div>
            </div>
            {over && <p className="note">The bill is more than the card. Take the full {money(card.balance_cents)} off the card and charge the other {money(cents - card.balance_cents)} at the till.</p>}
            <label className="f">Table or docket number (optional)<input id="ref" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} /></label>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn confirm" disabled={busy || take <= 0} onClick={() => redeem(take)}>{busy ? 'Confirming…' : take > 0 ? `Confirm ${money(take)}` : 'Enter an amount'}</button>
            {!over && <button className="btn ghost" disabled={busy} onClick={() => redeem(card.balance_cents)}>Use full balance ({money(card.balance_cents)})</button>}
            <div className="note">After confirming, ring {take > 0 ? money(take) : 'the same amount'} through AUPOS as <strong>Gift Voucher</strong>. The guest gets an email receipt with their new balance.</div>
          </>
        ) : <p className="note">This card can&rsquo;t be used. Ask a manager if the guest has questions.</p>}
        <button className="btn ghost" onClick={reset}>Cancel</button>
      </>
    );
  }

  if (step === 'done' && result) return (
    <>
      <div className="tick" aria-hidden="true">✓</div>
      <h1 className="center" style={{ fontSize: 30 }}>{money(result.redeemed)} taken off</h1>
      <p className="center" style={{ color: 'var(--soft)' }}>Left on the card: <b className="num" style={{ color: 'var(--ink)' }}>{money(result.balance)}</b></p>
      <div className="note">Now ring {money(result.redeemed)} through AUPOS as <strong>Gift Voucher</strong>.</div>
      <button className="btn confirm" onClick={reset}>Next card</button>
      <TodayList refreshKey={refreshKey} />
      <p className="small muted center">Signed in as {me.name}</p>
    </>
  );

  return null;
}
