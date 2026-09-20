-- Resident-friendly complaint numbers: 01, 02, ... reset daily in IST.
-- The bigint primary key remains the globally unique internal identifier.
begin;

alter table public.complaints drop constraint if exists complaints_complaint_no_key;

create or replace function public.generate_complaint_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date;
  v_next integer;
begin
  if new.complaint_no is null or btrim(new.complaint_no) = '' then
    v_today := (coalesce(new.created_at, now()) at time zone 'Asia/Kolkata')::date;
    perform pg_advisory_xact_lock(hashtext('rwa_complaint_no_' || v_today::text));

    select coalesce(max(
      case when complaint_no ~ '^[0-9]+$' then complaint_no::integer else null end
    ), 0) + 1
      into v_next
    from public.complaints
    where (created_at at time zone 'Asia/Kolkata')::date = v_today;

    new.complaint_no := lpad(v_next::text, 2, '0');
  end if;
  return new;
end;
$$;

commit;
