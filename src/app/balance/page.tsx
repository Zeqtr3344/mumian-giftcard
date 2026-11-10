'use client';
import { useState } from 'react';

type Result = { ok: boolean; error?: string; balance_cents?: number; expires_at?: string; state?: string };

const fmt = (c: number) => (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const date = (s: string) => new Date(s).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'long', year: 'numeric' });

export default function Balance() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  const [email, setEmail] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eMsg, setEMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function byEmail(e: React.FormEvent) {
    e.preventDefault();
    setEBusy(true); setEMsg(null);
    try {
      const res = await fetch('/api/balance/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await res.json();
      setEMsg(j.ok ? { ok: true, text: `Done. If there are gift cards linked to ${email.trim()}, we have emailed the details there. Check your inbox (and spam folder) in a minute.` } : { ok: false, text: j.error || 'Something went wrong. Please try again.' });
    } catch { setEMsg({ ok: false, text: 'Something went wrong. Please try again.' }); }
    setEBusy(false);
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setR(null);
    try {
      const res = await fetch('/api/balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      setR(await res.json());
    } catch { setR({ ok: false, error: 'Something went wrong. Please try again.' }); }
    setBusy(false);
  }

  return (
    <>
      <header className="top"><div className="col">
        <a className="brand" href="/"><img src="/logo-red.png" alt="MūMiān 木棉" width={141} height={44} /><span>GIFT CARDS</span></a>
        <nav><a href="/">Buy a gift card</a></nav>
      </div></header>
      <main className="col bal">
        <h1>Check your balance</h1>
        <p className="muted">Scan the QR code in your gift card email, or enter the card number below.</p>
        <form onSubmit={check} className="stack">
          <label className="f">Card number
            <input id="code" className="mono" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="MM-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={30} />
          </label>
          <button className="btn" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 6}>{busy ? 'Checking…' : 'Check balance'}</button>
        </form>
        {r && !r.ok && <p className="err" role="alert">{r.error}</p>}
        {r?.ok && (
          <div className="gcard" role="status" style={{ minHeight: 0, gap: 8 }}>
            <img className="flower" src="/flower-a.png" alt="" />
            <div className="eyebrow">Available balance</div>
            <div className="num" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{fmt(r.balance_cents!)}</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>
              {r.state === 'expired' ? `Expired on ${date(r.expires_at!)}` : r.state === 'void' ? 'This card has been cancelled' : r.state === 'used' ? 'Fully used' : `Expires ${date(r.expires_at!)}`}
            </div>
          </div>
        )}
        <section className="stack lookup">
          <h2>No card number?</h2>
          <p className="muted">Enter the email the gift card was sent to, or the email you used to buy it. We will email you the cards linked to that address. If you bought a card for someone else, you will see its balance; the card itself stays with them.</p>
          <form onSubmit={byEmail} className="stack">
            <label className="f">Email address
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={200} />
            </label>
            <button className="btn outline" disabled={eBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())}>{eBusy ? 'Sending…' : 'Email me my gift cards'}</button>
          </form>
          {eMsg && <p className={eMsg.ok ? 'muted' : 'err'} role="status">{eMsg.text}</p>}
        </section>
      </main>
      <style>{`.bal { padding-block: 32px 64px; display: flex; flex-direction: column; gap: 18px; } .bal h1 { font-size: 30px; } .lookup { margin-top: 26px; padding-top: 26px; border-top: 1px solid var(--rule); } .lookup h2 { font-size: 22px; margin: 0; }`}</style>
    </>
  );
}
