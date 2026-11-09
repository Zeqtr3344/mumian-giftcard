import 'server-only';
import Stripe from 'stripe';
import { config } from './config';

let s: Stripe | null = null;
export function stripe(): Stripe {
  if (!s) {
    // STRIPE_API_HOST is only for local testing against a mock (e.g. "localhost:12111").
    const mock = process.env.STRIPE_API_HOST;
    s = new Stripe(config.stripeKey, {
      apiVersion: '2024-09-30.acacia' as Stripe.LatestApiVersion,
      ...(mock ? { host: mock.split(':')[0], port: Number(mock.split(':')[1] || 80), protocol: 'http' as const } : {}),
    });
  }
  return s;
}
