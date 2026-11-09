import { Footer, TopBar } from './components';
import BuyForm from './BuyForm';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function BuyPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <TopBar />
      <main>
        <BuyForm min={config.minDollars} max={config.maxDollars} cancelled={sp.cancelled === '1'} />
      </main>
      <Footer />
    </>
  );
}
