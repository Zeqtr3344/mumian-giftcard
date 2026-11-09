'use client';
import { useState } from 'react';

type Result = { ok: boolean; error?: string; balance_cents?: number; expires_at?: string; state?: string };

const fmt = (c: number) => (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const date = (s: string) => new Date(s).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'long', year: 'numeric' });

export default function Balance() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

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
      </main>
      <style>{`.bal { padding-block: 32px 64px; display: flex; flex-direction: column; gap: 18px; } .bal h1 { font-size: 30px; }`}</style>
    </>
  );
}
