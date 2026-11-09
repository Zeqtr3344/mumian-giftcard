'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Re-renders the page every few seconds until the payment is confirmed (up to 2 minutes). */
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (++tries.current > 40) return clearInterval(t);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
