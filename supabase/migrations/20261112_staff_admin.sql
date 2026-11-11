-- Staff management from the admin page.
-- A PIN alone identifies the person, so PINs stay unique among active staff.
-- Turning someone back on always needs a new PIN (an old PIN could clash with one given out since).

-- Set a new PIN; with p_activate also switches the person back on.
create or replace function set_staff_pin(p_id uuid, p_pin text, p_activate boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'PIN must be 4 to 8 digits'); end if;
  if exists (select 1 from staff where active and id <> p_id and pin_hash = crypt(p_pin, pin_hash)) then
    return jsonb_build_object('ok', false, 'error', 'That PIN is already used by someone else. Choose another.');
  end if;
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')), active = active or p_activate where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Staff member not found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Change role or switch off. Never leaves the restaurant without an active manager.
create or replace function update_staff(p_id uuid, p_role text default null, p_active boolean default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s staff; v_role text; v_active boolean;
begin
  select * into s from staff where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Staff member not found'); end if;
  v_role := coalesce(p_role, s.role);
  v_active := coalesce(p_active, s.active);
  if v_role not in ('staff', 'manager') then return jsonb_build_object('ok', false, 'error', 'Unknown role'); end if;
  if v_active and not s.active then
    return jsonb_build_object('ok', false, 'error', 'Set a new PIN to switch this person back on');
  end if;
  if s.active and s.role = 'manager' and (v_role <> 'manager' or not v_active)
     and not exists (select 1 from staff where active and role = 'manager' and id <> p_id) then
    return jsonb_build_object('ok', false, 'error', 'There must always be at least one manager');
  end if;
  update staff set role = v_role, active = v_active where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Add from the admin page (add_staff raises; this returns a friendly error instead).
create or replace function add_staff_checked(p_name text, p_pin text, p_role text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'PIN must be 4 to 8 digits'); end if;
  if p_role not in ('staff', 'manager') then return jsonb_build_object('ok', false, 'error', 'Unknown role'); end if;
  if exists (select 1 from staff where active and pin_hash = crypt(p_pin, pin_hash)) then
    return jsonb_build_object('ok', false, 'error', 'That PIN is already used by someone else. Choose another.');
  end if;
  insert into staff (name, role, pin_hash) values (p_name, p_role, crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function set_staff_pin(uuid, text, boolean), update_staff(uuid, text, boolean), add_staff_checked(text, text, text) from public, anon, authenticated;
  end if;
end $$;
