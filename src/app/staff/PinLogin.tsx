'use client';
import { useState } from 'react';

export type Me = { id: string; name: string; role: 'staff' | 'manager' };

export async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({ ok: false, error: 'No connection. Try again.' }));
  if (res.status === 401) data.loggedOut = true;
  return data;
}


/** PIN pad used by both the redeem app and the admin page. */
export function PinLogin({ onIn }: { onIn: (m: Me) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(p: string) {
    setBusy(true); setError('');
    const d = await post('/api/staff/login', { pin: p });
    setBusy(false);
    if (d.ok) onIn({ id: '', name: d.name, role: d.role });
    else { setError(d.error || 'Wrong PIN'); setPin(''); }
  }
  const press = (k: string) => {
    if (busy) return;
    if (k === '⌫') return setPin(p => p.slice(0, -1));
    if (k === 'OK') return pin.length >= 4 && go(pin);
    setPin(p => (p.length < 8 ? p + k : p));
  };

  return (
    <>
      <h1 className="center" style={{ fontSize: 26 }}>Enter your PIN</h1>
      <div className="dots" aria-label={`${pin.length} digits entered`}>{Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      {error && <p className="err center" role="alert">{error}</p>}
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(k => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k === 'OK' ? 'Log in' : k} style={k === 'OK' ? { background: 'var(--red)', borderColor: 'var(--red)', color: '#fff', fontSize: 18, fontWeight: 700 } : undefined}>{k}</button>
        ))}
      </div>
    </>
  );
}

