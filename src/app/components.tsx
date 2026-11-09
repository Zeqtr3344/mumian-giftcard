// Shared pieces used by several pages (no hooks, safe in server and client components).
import { venue } from '@/lib/config';

export function TopBar({ wide = false }: { wide?: boolean }) {
  return (
    <header className="top">
      <div className={wide ? 'wrap' : 'col'}>
        <a className="brand" href="/" aria-label="MuMian gift cards">
          <img src="/logo-red.png" alt="MūMiān 木棉" width={141} height={44} />
          <span>GIFT CARDS</span>
        </a>
        <nav aria-label="Gift cards">
          <a href="/balance">Check balance</a>
          <a href={venue.site}>mumian.au</a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="col">
        Valid for 3 years from purchase · Use any time at {venue.name}, {venue.shortAddress}<br />
        Questions? <a href={`mailto:${venue.email}`}>{venue.email}</a> · Issued by {venue.legalEntity}. No fees after purchase.
      </div>
    </footer>
  );
}

export function GiftCardFace({ amount, forLine, dim }: { amount: string; forLine?: string; dim?: boolean }) {
  return (
    <div className={`gcard${dim ? ' dim' : ''}`} aria-label={`MuMian gift card, ${amount}`}>
      <img className="flower" src="/flower-a.png" alt="" />
      <div>
        <img className="gc-logo" src="/logo-red.png" alt="MūMiān 木棉" />
        <span className="gc-tag">MODERN CANTONESE CUISINE</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="eyebrow" style={{ fontSize: 12 }}>GIFT CARD</span>
        <span className="gc-amt num">{amount}</span>
        {forLine && <span className="gc-for">{forLine}</span>}
      </div>
    </div>
  );
}
