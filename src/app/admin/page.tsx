'use client';
import { useCallback, useEffect, useState } from 'react';
import { PinLogin, post, type Me } from '../staff/PinLogin';

type Stats = { cards_active: number; outstanding_cents: number; expired_unused_cents: number; expiring_90d_cents: number; sold_cents: number; sold_30d_cents: number; legacy_cents: number; redeemed_30d_cents: number };
type Row = { id: string; code: string; source: string; initial_cents: number; balance_cents: number; status: string; issued_at: string; expires_at: string; recipient_name: string | null; recipient_email: string | null; deliver_at: string | null; delivered_at: string | null };
type Tx = { id: number; kind: string; amount_cents: number; balance_after: number; reference: string | null; created_at: string; reverses_id: number | null; staff: { name: string } | null };

const money = (c: number) => (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const when = (s: string) => new Date(s).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
const fcode = (c: string) => (c.startsWith('MM') ? ['MM', ...(c.slice(2).match(/.{1,4}/g) ?? [])].join('-') : c.match(/.{1,4}/g)?.join('-') ?? c);
const SOURCE: Record<string, string> = { online: 'Online', manual: 'Issued by staff', tao_legacy: 'Tao Group voucher' };

function stateOf(r: { status: string; expires_at: string; balance_cents: number }) {
  if (r.status === 'void') return ['Cancelled', 'bad'];
  if (new Date(r.expires_at) < new Date()) return ['Expired', 'bad'];
  if (r.balance_cents <= 0) return ['Used', 'mute'];
  return ['Active', 'ok'];
}

export default function Admin() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState<'cards' | 'staff'>('cards');
  useEffect(() => { fetch('/api/staff/me').then(r => r.json()).then(d => setMe(d.ok ? d : null)).catch(() => setMe(null)); }, []);

  return (
    <div className="admin">
      <header className="top"><div className="wrap" style={{ alignItems: 'center' }}>
        <div className="brand"><img src="/logo-black.png" alt="MūMiān 木棉" width={141} height={44} /><span>GIFT CARD ADMIN</span></div>
        <span style={{ flex: 1 }} />
        {me && <button className="lnk" onClick={async () => { await post('/api/staff/logout'); setMe(null); }}>{me.name} · Log out</button>}
      </div></header>
      <main className="wrap">
        {me === undefined && <p className="muted">Loading…</p>}
        {me === null && <div className="login"><PinLogin onIn={setMe} /></div>}
        {me && me.role !== 'manager' && <p className="note">This page is for managers. Use the <a href="/staff">redeem app</a> to redeem cards.</p>}
        {me && me.role === 'manager' && (
          <>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'on' : ''} onClick={() => setTab('cards')}>Gift cards</button>
              <button role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>Staff</button>
            </div>
            {tab === 'cards' ? <Dashboard onLoggedOut={() => setMe(null)} /> : <StaffPanel onLoggedOut={() => setMe(null)} />}
          </>
        )}
      </main>
      <style>{`
                .lnk { background: none; border: 0; color: var(--mute); font: inherit; font-size: .86rem; cursor: pointer; text-decoration: underline; }
        .admin main { padding-block: 24px 64px; display: flex; flex-direction: column; gap: 26px; }
        .login { max-width: 380px; margin: 24px auto; display: flex; flex-direction: column; gap: 18px; width: 100%; }
        .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .tile { background: #fff; border: 1px solid #E2D6CF; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .tile .v { font-weight: 700; font-size: 2.1rem; line-height: 1; font-variant-numeric: tabular-nums; }
        .tile.hl { border: 2px solid var(--red); }
        .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .bar .grow { flex: 1 1 260px; }
        .sheet { background: #fff; border: 1px solid #E2D6CF; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .sheet h2 { font-size: 1.5rem; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .clickrow { cursor: pointer; }
        .clickrow:hover td { background: #fff; }
        .xs { font-size: .78rem; }
        .ok-msg { color: var(--ok); }
        .pager { display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
        @media (max-width: 900px) { .tiles { grid-template-columns: 1fr 1fr; } .g2 { grid-template-columns: 1fr; } }
        .tabs { display: flex; gap: 6px; border-bottom: 1px solid #E2D6CF; margin-bottom: -6px; }
        .tabs button { background: none; border: 0; border-bottom: 3px solid transparent; padding: 10px 14px; font: 600 1.05rem var(--f-body); color: var(--mute); cursor: pointer; letter-spacing: .02em; }
        .tabs button.on { color: var(--red); border-bottom-color: var(--red); }
        .people { display: flex; flex-direction: column; gap: 10px; }
        .person { background: #fff; border: 1px solid #E2D6CF; border-radius: 14px; padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
        .person.off { opacity: .62; }
        .person .who { flex: 1 1 180px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .person .who b { font-size: 1.15rem; }
        .person .acts { display: flex; flex-wrap: wrap; gap: 8px; }
        .pill { display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 3px 8px; border-radius: 99px; background: #F3EAE5; color: var(--mute); margin-left: 8px; vertical-align: 2px; }
        .pill.mgr { background: rgba(157,42,23,.1); color: var(--red); }
        .pinrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; width: 100%; }
        .pinrow .f { flex: 1 1 160px; }
        .reveal { background: #FBF6F3; border: 1px dashed var(--red); border-radius: 12px; padding: 12px 14px; width: 100%; }
        .reveal .big { font: 700 1.8rem var(--f-body); letter-spacing: .18em; font-variant-numeric: tabular-nums; }
        .hide-sm { } @media (max-width: 700px) { .hide-sm { display: none; } }
      `}</style>
    </div>
  );
}

function Dashboard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Record<string, { count: number; cents: number }>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'issue' | 'import'>('none');

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch(`/api/admin/cards?q=${encodeURIComponent(q)}&page=${page}`).then(r => r.json()),
    ]);
    if (s.error === 'Please log in again' || c.error === 'Please log in again') return onLoggedOut();
    if (s.ok) { setStats(s.stats); setCampaigns(s.campaigns ?? {}); }
    if (c.ok) { setRows(c.cards); setTotal(c.total); }
  }, [q, page, onLoggedOut]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      {stats && (
        <div className="tiles">
          <div className="tile hl"><span className="eyebrow">Outstanding balance</span><span className="v">{money(stats.outstanding_cents)}</span><span className="muted xs">{stats.cards_active} cards with money on them</span></div>
          <div className="tile"><span className="eyebrow">Sold online, 30 days</span><span className="v">{money(stats.sold_30d_cents)}</span><span className="muted xs">{money(stats.sold_cents)} all time</span></div>
          <div className="tile"><span className="eyebrow">Redeemed, 30 days</span><span className="v">{money(stats.redeemed_30d_cents)}</span><span className="muted xs">net of reversals</span></div>
          <div className="tile"><span className="eyebrow">Expiring in 90 days</span><span className="v">{money(stats.expiring_90d_cents)}</span><span className="muted xs">still on cards that expire soon</span></div>
        </div>
      )}
      {Object.keys(campaigns).length > 0 && (
        <p className="muted small" style={{ margin: 0 }}>Sales from links: {Object.entries(campaigns).map(([k, v]) => `${k} ${v.count} card${v.count === 1 ? '' : 's'} (${money(v.cents)})`).join(' · ')}</p>
      )}

      <div className="bar">
        <input className="in grow" id="search" placeholder="Search card number, name or email" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
        <button className="btn sm" onClick={() => setPanel(panel === 'issue' ? 'none' : 'issue')}>Issue a card</button>
        <a className="btn outline sm" href="/api/admin/export">Export CSV</a>
      </div>

      {panel === 'issue' && <IssuePanel onDone={() => { setPanel('none'); load(); }} />}
      {panel === 'import' && <ImportPanel onDone={() => { setPanel('none'); load(); }} />}
      {open && <CardPanel id={open} onClose={() => setOpen(null)} onChanged={load} />}

      <div className="scroll-x">
        <table className="t">
          <thead><tr><th>Card</th><th>For</th><th className="hide-sm">Source</th><th className="r">Value</th><th className="r">Balance</th><th className="hide-sm">Expires</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const [label, cls] = stateOf(r);
              const pending = !r.delivered_at && r.deliver_at && r.source !== 'tao_legacy';
              return (
                <tr key={r.id} className="clickrow" onClick={() => setOpen(r.id)}>
                  <td className="mono xs">{fcode(r.code)}</td>
                  <td>{r.recipient_name || <span className="muted">—</span>}<div className="muted xs">{r.recipient_email}</div></td>
                  <td className="hide-sm">{SOURCE[r.source]}</td>
                  <td className="r num">{money(r.initial_cents)}</td>
                  <td className="r num">{money(r.balance_cents)}</td>
                  <td className="hide-sm">{day(r.expires_at)}</td>
                  <td><span className={`pill ${cls}`}>{label}</span>{pending && <div className="muted xs">Sends {day(r.deliver_at)}</div>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted">{q ? 'No cards match that search.' : 'No gift cards yet. Sold cards, cards you issue and imported Tao vouchers will appear here.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {total > 50 && (
        <div className="pager muted small">
          <span>{page * 50 + 1}–{Math.min(total, page * 50 + 50)} of {total}</span>
          <button className="btn outline sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <button className="btn outline sm" disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}

function CardPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<{ card: Row & { message: string | null; note: string | null; sender_name: string | null; view_token: string }; transactions: Tx[]; order: { buyer_name: string; buyer_email: string; status: string } | null } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [email, setEmail] = useState('');

  const load = useCallback(() => { fetch(`/api/admin/card?id=${id}`).then(r => r.json()).then(x => { if (x.ok) { setD(x); setEmail(x.card.recipient_email || ''); } }); }, [id]);
  useEffect(load, [load]);

  async function act(url: string, body: unknown, done: string) {
    setErr(''); setMsg('');
    const r = await post(url, body);
    if (!r.ok) return setErr(r.error || 'That did not work');
    setMsg(done); load(); onChanged();
  }

  if (!d) return <div className="sheet"><p className="muted">Loading card…</p></div>;
  const c = d.card;
  const [label, cls] = stateOf(c);
  const reversed = new Set(d.transactions.filter(t => t.reverses_id).map(t => t.reverses_id));

  return (
    <div className="sheet">
      <div className="bar"><h2 className="grow">{fcode(c.code)}</h2><span className={`pill ${cls}`}>{label}</span><button className="lnk" onClick={onClose}>Close</button></div>
      <div className="g2">
        <div className="muted small">
          <div><b style={{ color: 'var(--ink)' }}>{money(c.balance_cents)}</b> left of {money(c.initial_cents)}</div>
          <div>{SOURCE[c.source]} · issued {day(c.issued_at)} · expires {day(c.expires_at)}</div>
          {c.recipient_name && <div>For {c.recipient_name}{c.sender_name ? `, from ${c.sender_name}` : ''}</div>}
          {d.order && <div>Bought by {d.order.buyer_name} ({d.order.buyer_email}) · order {d.order.status}</div>}
          {c.note && <div>Note: {c.note}</div>}
          {c.message && <div>Message: &ldquo;{c.message}&rdquo;</div>}
          <div>{c.delivered_at ? `Emailed ${when(c.delivered_at)}` : c.deliver_at ? `Scheduled to email ${day(c.deliver_at)}` : 'Not emailed'}</div>
          <div><a href={`/card/${c.view_token}`} target="_blank" rel="noopener">Open the guest&rsquo;s card page</a></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {c.status === 'active' && (
            <>
              <div className="bar"><input className="in grow" id="resend-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Recipient email" />
                <button className="btn sm" onClick={() => act('/api/admin/resend', { id: c.id, email }, `Card emailed to ${email}`)} disabled={!email}>Send email</button></div>
              <div className="bar"><input className="in grow" id="void-reason" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason to cancel, e.g. refunded" />
                <button className="btn sm outline" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }} disabled={!voidReason} onClick={() => act('/api/admin/void', { id: c.id, reason: voidReason }, 'Card cancelled')}>Cancel card</button></div>
            </>
          )}
          {msg && <p className="ok-msg small">{msg}</p>}
          {err && <p className="err small">{err}</p>}
        </div>
      </div>
      <div className="scroll-x">
        <table className="t">
          <thead><tr><th>When</th><th>What</th><th>Staff</th><th>Ref</th><th className="r">Amount</th><th className="r">Balance</th><th /></tr></thead>
          <tbody>
            {d.transactions.map(t => (
              <tr key={t.id}>
                <td className="xs">{when(t.created_at)}</td>
                <td>{({ issue: 'Issued', redeem: 'Redeemed', reverse: 'Reversed', void: 'Cancelled', adjust: 'Adjusted' } as Record<string, string>)[t.kind]}</td>
                <td>{t.staff?.name ?? <span className="muted">—</span>}</td>
                <td className="xs">{t.reference}</td>
                <td className="r num">{t.amount_cents < 0 ? '−' : '+'}{money(Math.abs(t.amount_cents))}</td>
                <td className="r num">{money(t.balance_after)}</td>
                <td>{t.kind === 'redeem' && c.status === 'active' && !reversed.has(t.id) && <button className="lnk" onClick={() => act('/api/admin/reverse', { transactionId: t.id }, 'Redemption reversed; the money is back on the card')}>Undo</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssuePanel({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ amount: '', reason: '', recipientName: '', recipientEmail: '', message: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const r = await post('/api/admin/issue', { ...f, amount: Number(f.amount) });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDone(`Card ${fcode(r.card.code)} created${r.emailed === 'sent' ? ' and emailed' : ''}.`);
  }

  if (done) return <div className="sheet"><p className="ok-msg">{done}</p><button className="btn sm" onClick={onDone}>Done</button></div>;
  return (
    <form className="sheet" onSubmit={go}>
      <h2>Issue a card</h2>
      <p className="muted small">For complimentary cards, prizes or replacements. Every card you issue is logged with your name and the reason.</p>
      <div className="g2">
        <label className="f">Amount ($)<input id="i-amount" inputMode="numeric" value={f.amount} onChange={set('amount')} /></label>
        <label className="f">Reason<input id="i-reason" value={f.reason} onChange={set('reason')} placeholder="e.g. Instagram giveaway" /></label>
        <label className="f">Recipient name (optional)<input id="i-name" value={f.recipientName} onChange={set('recipientName')} /></label>
        <label className="f">Recipient email (optional, sends now)<input id="i-email" type="email" value={f.recipientEmail} onChange={set('recipientEmail')} /></label>
      </div>
      <label className="f">Message (optional)<textarea id="i-msg" value={f.message} onChange={set('message')} maxLength={300} /></label>
      {err && <p className="err">{err}</p>}
      <div className="bar"><button className="btn sm" disabled={busy}>{busy ? 'Creating…' : 'Create card'}</button><button type="button" className="btn outline sm" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

/** Minimal CSV parser: handles quotes, commas and new lines inside quotes. */
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim())) out.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim())) out.push(row);
  return out;
}

const COLS: Record<string, RegExp> = {
  code: /code|voucher|card ?(no|num)|number|serial/i,
  original: /original|face|initial|value|amount|purchased/i,
  balance: /balance|remaining|left/i,
  expiry: /expir|valid until|expires/i,
  issued: /issue|purchase date|sold|created|date/i,
  name: /name|recipient|customer/i,
  email: /e-?mail/i,
};

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [head, setHead] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ rows: number; ready: number; readyBalanceCents: number; alreadyExpired: number; problems: { line: number; code: string; problems: string[] }[] } | null>(null);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setErr(''); setPreview(null); setResult('');
    const grid = parseCsv(await file.text());
    if (grid.length < 2) return setErr('The file needs a header row and at least one voucher.');
    const h = grid[0].map(x => x.trim());
    const m: Record<string, number> = {};
    for (const [k, re] of Object.entries(COLS)) {
      const idx = h.findIndex((col, i) => re.test(col) && !Object.values(m).includes(i));
      if (idx >= 0) m[k] = idx;
    }
    setHead(h); setMap(m);
    setRows(grid.slice(1).map(r => Object.fromEntries(h.map((col, i) => [col, r[i] ?? '']))));
  }

  const mapped = () => rows.map(r => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[head[i]] ?? ''])));

  async function check(commit: boolean) {
    setBusy(true); setErr('');
    const r = await post('/api/admin/import', { rows: mapped(), commit });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    if (commit) setResult(`Imported ${r.imported} vouchers${r.failed?.length ? `; ${r.failed.length} failed` : ''}.`);
    else setPreview(r);
  }

  if (result) return <div className="sheet"><p className="ok-msg">{result}</p><button className="btn sm" onClick={onDone}>Done</button></div>;
  return (
    <div className="sheet">
      <h2>Import Tao Group vouchers</h2>
      <p className="muted small">Export the vouchers that are valid at MuMian from the Tao Group system as a CSV file. Columns needed: voucher code, original value, remaining balance, and expiry date (or issue date, in which case the card gets 3 years from issue). Name and email are optional. Nothing is saved until you press Import.</p>
      <input type="file" id="csv" accept=".csv,text/csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      {!!head.length && (
        <div className="g2">
          {Object.keys(COLS).map(k => (
            <label className="f" key={k}>{({ code: 'Voucher code', original: 'Original value', balance: 'Remaining balance', expiry: 'Expiry date', issued: 'Issue date', name: 'Name', email: 'Email' } as Record<string, string>)[k]}
              <select id={`map-${k}`} value={map[k] ?? -1} onChange={e => { const v = Number(e.target.value); const m = { ...map }; if (v < 0) delete m[k]; else m[k] = v; setMap(m); setPreview(null); }}>
                <option value={-1}>Not in file</option>
                {head.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {!!rows.length && !preview && <button className="btn sm" disabled={busy} onClick={() => check(false)}>{busy ? 'Checking…' : `Check ${rows.length} rows`}</button>}
      {preview && (
        <>
          <p><b>{preview.ready}</b> of {preview.rows} vouchers are ready, worth <b>{money(preview.readyBalanceCents)}</b> in remaining balance.{preview.alreadyExpired ? ` ${preview.alreadyExpired} of them have already expired and will be imported as expired.` : ''}</p>
          {!!preview.problems.length && (
            <div className="scroll-x"><table className="t"><thead><tr><th>Line</th><th>Code</th><th>Problem</th></tr></thead>
              <tbody>{preview.problems.map(p => <tr key={p.line}><td>{p.line}</td><td className="mono xs">{p.code}</td><td>{p.problems.join('; ')}</td></tr>)}</tbody></table></div>
          )}
          <div className="bar"><button className="btn sm" disabled={busy || !preview.ready} onClick={() => check(true)}>{busy ? 'Importing…' : `Import ${preview.ready} vouchers`}</button><button className="btn outline sm" onClick={onDone}>Cancel</button></div>
        </>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

type Person = { id: string; name: string; role: 'staff' | 'manager'; active: boolean; created_at: string };

/** A random PIN that is easy to read out: no runs like 1234 or repeats like 1111. */
function suggestPin(len: number): string {
  for (;;) {
    const a = new Uint32Array(len); crypto.getRandomValues(a);
    const p = Array.from(a, n => String(n % 10)).join('');
    if (/(\d)\1\1/.test(p) || '0123456789 9876543210'.includes(p.slice(0, 4))) continue;
    return p;
  }
}

function StaffPanel({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [list, setList] = useState<Person[]>([]);
  const [meId, setMeId] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; mode: 'pin' | 'on' } | null>(null);
  const [shown, setShown] = useState<{ name: string; pin: string } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const d = await fetch('/api/admin/staff').then(r => r.json());
    if (d.error === 'Please log in again') return onLoggedOut();
    if (d.ok) { setList(d.staff); setMeId(d.me); }
  }, [onLoggedOut]);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, okMsg?: { name: string; pin: string }) {
    setErr('');
    const r = await post('/api/admin/staff', body);
    if (r.loggedOut) return onLoggedOut();
    if (!r.ok) { setErr(r.error); return false; }
    setShown(okMsg ?? null); setEditing(null); setAdding(false); load();
    return true;
  }

  const on = list.filter(p => p.active), off = list.filter(p => !p.active);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="bar">
        <p className="muted small grow" style={{ margin: 0 }}>Everyone signs in with their own PIN, and every redemption is saved under their name. <b>Staff</b> can check and redeem cards. <b>Managers</b> can also reverse mistakes, issue and cancel cards, and open this page.</p>
        {!adding && <button className="btn sm" onClick={() => { setAdding(true); setShown(null); setErr(''); }}>Add a person</button>}
      </div>

      {shown && (
        <div className="reveal" role="status">
          <div className="small">PIN for <b>{shown.name}</b>. Tell them in person; it won’t be shown again.</div>
          <div className="big">{shown.pin}</div>
          <button className="btn outline sm" onClick={() => setShown(null)}>Done</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {adding && <AddPerson onCancel={() => setAdding(false)} onSave={(name, role, pin) => act({ action: 'add', name, role, pin }, { name, pin })} />}

      <div className="people">
        {on.map(p => (
          <div className="person" key={p.id}>
            <div className="who"><b>{p.name}{p.id === meId && <span className="muted xs"> (you)</span>}<span className={p.role === 'manager' ? 'pill mgr' : 'pill'}>{p.role === 'manager' ? 'Manager' : 'Staff'}</span></b><span className="muted xs">Added {day(p.created_at)}</span></div>
            <div className="acts">
              <button className="btn outline sm" onClick={() => { setEditing({ id: p.id, mode: 'pin' }); setShown(null); setErr(''); }}>New PIN</button>
              {p.id !== meId && <button className="btn outline sm" onClick={() => act({ action: 'role', id: p.id, role: p.role === 'manager' ? 'staff' : 'manager' })}>{p.role === 'manager' ? 'Make staff' : 'Make manager'}</button>}
              {p.id !== meId && <button className="btn outline sm" onClick={() => { if (confirm(`Switch off ${p.name}? Their PIN stops working straight away.`)) act({ action: 'off', id: p.id }); }}>Switch off</button>}
            </div>
            {editing?.id === p.id && <PinEdit name={p.name} onCancel={() => setEditing(null)} onSave={pin => act({ action: 'pin', id: p.id, pin }, { name: p.name, pin })} />}
          </div>
        ))}
        {!on.length && <p className="muted">Loading…</p>}
      </div>

      {off.length > 0 && (
        <>
          <div className="eyebrow">Switched off</div>
          <div className="people">
            {off.map(p => (
              <div className="person off" key={p.id}>
                <div className="who"><b>{p.name}<span className="pill">{p.role === 'manager' ? 'Manager' : 'Staff'}</span></b><span className="muted xs">PIN no longer works · their history is kept</span></div>
                <div className="acts"><button className="btn outline sm" onClick={() => { setEditing({ id: p.id, mode: 'on' }); setShown(null); setErr(''); }}>Switch back on</button></div>
                {editing?.id === p.id && <PinEdit name={p.name} onCancel={() => setEditing(null)} onSave={pin => act({ action: 'on', id: p.id, pin }, { name: p.name, pin })} />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PinEdit({ name, onSave, onCancel }: { name: string; onSave: (pin: string) => Promise<boolean | void>; onCancel: () => void }) {
  const [pin, setPin] = useState(() => suggestPin(4));
  const [busy, setBusy] = useState(false);
  return (
    <form className="pinrow" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(pin); setBusy(false); }}>
      <label className="f">New PIN for {name} (4–8 digits)<input className="in" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <button type="button" className="btn outline sm" onClick={() => setPin(suggestPin(pin.length >= 6 ? pin.length : 4))}>Suggest</button>
      <button className="btn sm" disabled={busy || pin.length < 4}>{busy ? 'Saving…' : 'Save PIN'}</button>
      <button type="button" className="btn outline sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function AddPerson({ onSave, onCancel }: { onSave: (name: string, role: 'staff' | 'manager', pin: string) => Promise<boolean | void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [pin, setPin] = useState(() => suggestPin(4));
  const [busy, setBusy] = useState(false);
  return (
    <form className="sheet" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(name.trim(), role, pin); setBusy(false); }}>
      <h2>Add a person</h2>
      <div className="g2">
        <label className="f">Name (as staff know them)<input className="in" id="s-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. Amy" /></label>
        <div className="f">Role
          <div className="seg" role="radiogroup">
            <button type="button" role="radio" aria-checked={role === 'staff'} className={role === 'staff' ? 'on' : ''} onClick={() => { setRole('staff'); setPin(suggestPin(4)); }}>Staff</button>
            <button type="button" role="radio" aria-checked={role === 'manager'} className={role === 'manager' ? 'on' : ''} onClick={() => { setRole('manager'); setPin(suggestPin(6)); }}>Manager</button>
          </div>
        </div>
      </div>
      <div className="pinrow">
        <label className="f">PIN (4–8 digits{role === 'manager' ? ', 6 recommended for managers' : ''})<input className="in" id="s-pin" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="button" className="btn outline sm" onClick={() => setPin(suggestPin(role === 'manager' ? 6 : 4))}>Suggest</button>
      </div>
      <div className="bar"><button className="btn sm" disabled={busy || !name.trim() || pin.length < 4}>{busy ? 'Adding…' : 'Add'}</button><button type="button" className="btn outline sm" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
