'use client';
import { useEffect, useState } from 'react';

export default function GiveCard({ token, balance }: { token: string; balance: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // The email's "Give this card" button links to #give: open the form straight away.
  useEffect(() => { if (window.location.hash === '#give') { setOpen(true); setTimeout(() => document.getElementById('give')?.scrollIntoView({ behavior: 'smooth' }), 50); } }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { token, fromName: f.get('fromName'), toName: f.get('toName'), toEmail: f.get('toEmail'), message: f.get('message') };
    if (!confirm(`Give this card (${balance} left) to ${body.toName}? It will stop working for you.`)) return;
    setBusy(true); setError('');
    const r = await fetch('/api/card/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({ ok: false, error: 'Something went wrong. Please try again.' }));
    setBusy(false);
    // Leave the old card page: its QR code and number no longer work.
    if (r.ok) { setDone('Sent.'); window.location.replace(`/given?to=${encodeURIComponent(String(body.toName || ''))}`); }
    else setError(r.error);
  }

  if (done) return <p className="note" role="status">{done}</p>;
  if (!open) return <div id="give"><button className="btn outline" type="button" style={{ width: '100%' }} onClick={() => setOpen(true)}>Give this card to someone else</button></div>;
  return (
    <form id="give" onSubmit={submit} className="stack" style={{ gap: 12 }}>
      <div className="label">Give this card to someone else</div>
      <p className="soft" style={{ margin: 0 }}>We email them the card with the full {balance} balance. It gets a new number and QR code, and stops working for you.</p>
      <input className="in" name="fromName" placeholder="Your name" required maxLength={80} autoComplete="name" />
      <input className="in" name="toName" placeholder="Their name" required maxLength={80} />
      <input className="in" name="toEmail" type="email" placeholder="Their email" required maxLength={200} />
      <textarea className="in" style={{ height: 90, padding: 12 }} name="message" placeholder="A message (optional)" maxLength={300} rows={3} />
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send the gift card'}</button>
      <button className="btn outline" type="button" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
