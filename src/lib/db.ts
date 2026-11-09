import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let client: SupabaseClient | null = null;

/** Server-side database client (service role). Never import this into a client component. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type GiftCard = {
  id: string;
  code: string;
  view_token: string;
  source: 'online' | 'manual' | 'tao_legacy';
  order_id: string | null;
  initial_cents: number;
  balance_cents: number;
  status: 'active' | 'void';
  issued_at: string;
  expires_at: string;
  recipient_name: string | null;
  recipient_email: string | null;
  sender_name: string | null;
  message: string | null;
  deliver_at: string | null;
  delivered_at: string | null;
  note: string | null;
};

export type CardTx = {
  id: number;
  card_id: string;
  kind: 'issue' | 'redeem' | 'reverse' | 'void' | 'adjust';
  amount_cents: number;
  balance_after: number;
  staff_id: string | null;
  reverses_id: number | null;
  reference: string | null;
  created_at: string;
  staff?: { name: string } | null;
};
