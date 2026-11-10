import { Footer, TopBar } from '../components';
import { venue } from '@/lib/config';

export const metadata = { title: 'Gift card sent · MuMian Dining', robots: { index: false } };

export default async function Given({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  const name = (to || '').slice(0, 80).trim() || 'them';
  return (
    <>
      <TopBar />
      <main className="col stack" style={{ paddingBlock: '40px 64px', gap: 18 }}>
        <h1 style={{ fontSize: 30, margin: 0 }}>Your gift card is on its way</h1>
        <p className="muted" style={{ margin: 0 }}>
          We have emailed the card and its full balance to {name}. It now has a new card number and QR code, so your old email and link no longer work.
          We have also sent you a confirmation email.
        </p>
        <p className="muted" style={{ margin: 0 }}>Did not mean to do this? Email <a href={`mailto:${venue.email}`}>{venue.email}</a> and we will help.</p>
        <a className="btn" href={venue.booking}>Book a table</a>
        <a className="btn outline" href="/">Buy a new gift card</a>
      </main>
      <Footer />
    </>
  );
}
