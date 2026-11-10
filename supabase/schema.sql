-- ============================================================
-- MuMian Gift Cards — database schema (Supabase / Postgres 15+)
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- All money is stored in cents (integers). Times are UTC.
-- ============================================================

create extension if not exists pgcrypto;  -- on Supabase this lives in the "extensions" schema

-- ---------- Staff (PIN login for the redeem app and admin) ----------
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null default 'staff' check (role in ('staff','manager')),
  pin_hash    text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Orders (one per Stripe Checkout session) ----------
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  stripe_session_id  text unique,
  stripe_payment_intent text,
  amount_cents       int  not null check (amount_cents > 0),
  buyer_name         text not null,
  buyer_email        text not null,
  recipient_name     text not null,
  recipient_email    text not null,
  message            text,
  deliver_at         timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);

-- ---------- Gift cards ----------
create table if not exists gift_cards (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,              -- normalised: upper case, no spaces or dashes
  view_token      text not null unique,              -- secret for the card page link
  source          text not null check (source in ('online','manual','tao_legacy')),
  order_id        uuid unique references orders(id),     -- one card per paid order
  initial_cents   int  not null check (initial_cents >= 0),
  balance_cents   int  not null check (balance_cents >= 0),
  status          text not null default 'active' check (status in ('active','void')),
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  recipient_name  text,
  recipient_email text,
  sender_name     text,
  message         text,
  deliver_at      timestamptz,
  delivered_at    timestamptz,
  note            text,                              -- e.g. reason for a manual card, legacy reference
  created_by      uuid references staff(id),
  constraint balance_le_initial check (balance_cents <= initial_cents)
);
create index if not exists gift_cards_due_idx on gift_cards (deliver_at) where delivered_at is null;
create index if not exists gift_cards_email_idx on gift_cards (lower(recipient_email));

-- ---------- Ledger: every change to a balance ----------
create table if not exists card_transactions (
  id            bigint generated always as identity primary key,
  card_id       uuid not null references gift_cards(id),
  kind          text not null check (kind in ('issue','redeem','reverse','void','adjust')),
  amount_cents  int  not null,                       -- negative = balance went down
  balance_after int  not null,
  staff_id      uuid references staff(id),
  reverses_id   bigint references card_transactions(id),
  reference     text,                                -- POS docket / table number
  created_at    timestamptz not null default now()
);
create index if not exists card_tx_card_idx on card_transactions (card_id, created_at desc);
create index if not exists card_tx_staff_idx on card_transactions (staff_id);
create index if not exists card_tx_reverses_idx on card_transactions (reverses_id);
create index if not exists gift_cards_created_by_idx on gift_cards (created_by);

-- Lock everything down: the app talks to the database only with the
-- service-role key from server code. No browser access at all.
alter table staff enable row level security;
alter table orders enable row level security;
alter table gift_cards enable row level security;
alter table card_transactions enable row level security;

-- ============================================================
-- Functions (all balance changes happen here, inside one transaction)
-- ============================================================

-- Failed PIN attempts, used to lock out guessing (8 wrong PINs from one device in 15 minutes).
create table if not exists staff_login_failures (
  id bigint generated always as identity primary key,
  client text not null,
  at timestamptz not null default now()
);
alter table staff_login_failures enable row level security;

-- Check a PIN. Returns the staff row or nothing.
create or replace function verify_staff_pin(p_pin text)
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, s.name, s.role from staff s
  where s.active and s.pin_hash = crypt(p_pin, s.pin_hash)
  limit 1;
$$;

-- Log in with lock-out. p_client identifies the device (IP address).
create or replace function login_staff(p_pin text, p_client text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s record; n int;
begin
  select count(*) into n from staff_login_failures where client = p_client and at > now() - interval '15 minutes';
  if n >= 8 then return jsonb_build_object('ok', false, 'error', 'Too many wrong PINs. Wait 15 minutes and try again.'); end if;
  select * into s from verify_staff_pin(p_pin);
  if not found then
    insert into staff_login_failures (client) values (p_client);
    return jsonb_build_object('ok', false, 'error', 'Wrong PIN');
  end if;
  delete from staff_login_failures where client = p_client;
  return jsonb_build_object('ok', true, 'id', s.id, 'name', s.name, 'role', s.role);
end $$;

-- Create a staff member (run from SQL editor): select add_staff('Amy','1234','staff');
create or replace function add_staff(p_name text, p_pin text, p_role text default 'staff')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4 to 8 digits'; end if;
  if exists (select 1 from staff where active and pin_hash = crypt(p_pin, pin_hash)) then
    raise exception 'That PIN is already used by another staff member';
  end if;
  insert into staff (name, role, pin_hash) values (p_name, p_role, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $$;

-- Issue a card and write the opening ledger line.
create or replace function issue_card(
  p_code text, p_token text, p_source text, p_amount int, p_expires timestamptz,
  p_order uuid default null, p_recipient_name text default null, p_recipient_email text default null,
  p_sender_name text default null, p_message text default null, p_deliver_at timestamptz default null,
  p_note text default null, p_staff uuid default null, p_balance int default null, p_issued_at timestamptz default null)
returns gift_cards language plpgsql security definer set search_path = public, extensions as $$
declare v gift_cards; v_bal int := coalesce(p_balance, p_amount);
begin
  insert into gift_cards (code, view_token, source, order_id, initial_cents, balance_cents, expires_at,
    recipient_name, recipient_email, sender_name, message, deliver_at, note, created_by, issued_at)
  values (upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), p_token, p_source, p_order, p_amount, v_bal, p_expires,
    p_recipient_name, p_recipient_email, p_sender_name, p_message, p_deliver_at, p_note, p_staff, coalesce(p_issued_at, now()))
  returning * into v;
  insert into card_transactions (card_id, kind, amount_cents, balance_after, staff_id, reference)
  values (v.id, 'issue', v_bal, v_bal, p_staff, p_note);
  return v;
end $$;

-- Redeem. Locks the card row so two tills can never spend the same dollars.
-- Returns ok=false with a reason instead of raising, so the app can show it.
create or replace function redeem_card(p_code text, p_amount int, p_staff uuid, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c gift_cards; v_tx bigint; v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter an amount above $0');
  end if;
  select * into c from gift_cards where code = v_code for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Card not found'); end if;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'This card has been cancelled'); end if;
  if c.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'This card expired on ' || to_char(c.expires_at at time zone 'Australia/Sydney', 'DD Mon YYYY')); end if;
  if p_amount > c.balance_cents then
    return jsonb_build_object('ok', false, 'error', 'Not enough balance', 'balance_cents', c.balance_cents);
  end if;
  update gift_cards set balance_cents = balance_cents - p_amount where id = c.id;
  insert into card_transactions (card_id, kind, amount_cents, balance_after, staff_id, reference)
  values (c.id, 'redeem', -p_amount, c.balance_cents - p_amount, p_staff, p_reference)
  returning id into v_tx;
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'redeemed_cents', p_amount,
    'balance_cents', c.balance_cents - p_amount);
end $$;

-- Undo a redemption (manager only, enforced in the app). Each redemption can be reversed once.
create or replace function reverse_redemption(p_tx bigint, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t card_transactions; c gift_cards;
begin
  select * into t from card_transactions where id = p_tx;
  if not found or t.kind <> 'redeem' then return jsonb_build_object('ok', false, 'error', 'Only a redemption can be reversed'); end if;
  if exists (select 1 from card_transactions where reverses_id = p_tx) then
    return jsonb_build_object('ok', false, 'error', 'Already reversed');
  end if;
  select * into c from gift_cards where id = t.card_id for update;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'This card has been cancelled'); end if;
  update gift_cards set balance_cents = balance_cents - t.amount_cents where id = c.id;
  insert into card_transactions (card_id, kind, amount_cents, balance_after, staff_id, reverses_id, reference)
  values (c.id, 'reverse', -t.amount_cents, c.balance_cents - t.amount_cents, p_staff, p_tx, 'Reversal of #' || p_tx);
  return jsonb_build_object('ok', true, 'balance_cents', c.balance_cents - t.amount_cents);
end $$;

-- Cancel a card (e.g. refunded order). Zeroes the balance and records it.
create or replace function void_card(p_card uuid, p_staff uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c gift_cards;
begin
  select * into c from gift_cards where id = p_card for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Card not found'); end if;
  if c.status = 'void' then return jsonb_build_object('ok', false, 'error', 'Already cancelled'); end if;
  update gift_cards set status = 'void', balance_cents = 0 where id = c.id;
  insert into card_transactions (card_id, kind, amount_cents, balance_after, staff_id, reference)
  values (c.id, 'void', -c.balance_cents, 0, p_staff, p_reason);
  return jsonb_build_object('ok', true);
end $$;

-- Dashboard numbers in one call.
create or replace function card_stats()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'cards_active',        count(*) filter (where status = 'active' and expires_at >= now() and balance_cents > 0),
    'outstanding_cents',   coalesce(sum(balance_cents) filter (where status = 'active' and expires_at >= now()), 0),
    'expired_unused_cents',coalesce(sum(balance_cents) filter (where status = 'active' and expires_at < now()), 0),
    'expiring_90d_cents',  coalesce(sum(balance_cents) filter (where status = 'active' and expires_at between now() and now() + interval '90 days'), 0),
    'sold_cents',          coalesce(sum(initial_cents) filter (where source = 'online'), 0),
    'sold_30d_cents',      coalesce(sum(initial_cents) filter (where source = 'online' and issued_at >= now() - interval '30 days'), 0),
    'legacy_cents',        coalesce(sum(balance_cents) filter (where source = 'tao_legacy' and status = 'active' and expires_at >= now()), 0),
    'redeemed_30d_cents',  (select coalesce(-sum(amount_cents), 0) from card_transactions where kind in ('redeem','reverse') and created_at >= now() - interval '30 days')
  ) from gift_cards;
$$;

-- Only the server (service role) may call these. Supabase creates the anon and
-- authenticated roles; the guard lets this file also run on plain Postgres for testing.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema public from public, anon, authenticated;
  end if;
end $$;
