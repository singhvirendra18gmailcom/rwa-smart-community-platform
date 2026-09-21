-- Reset each category's resident-facing complaint sequence once per calendar year (IST).
-- Examples: P01, P02... and G01, G02... throughout 2026; each prefix starts again at 01 in 2027.
create or replace function public.generate_complaint_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year integer;
  v_prefix text;
  v_next integer;
begin
  if new.complaint_no is null or btrim(new.complaint_no) = '' then
    v_year := extract(year from (coalesce(new.created_at, now()) at time zone 'Asia/Kolkata'))::integer;
    v_prefix := case new.category_id
      when 1 then 'P' when 2 then 'E' when 3 then 'S' when 4 then 'C'
      when 5 then 'H' when 6 then 'L' when 7 then 'G' else 'O'
    end;
    perform pg_advisory_xact_lock(hashtext('rwa_complaint_no_' || v_year::text || '_' || v_prefix));
    select coalesce(max(case when complaint_no ~ ('^' || v_prefix || '[0-9]+$')
      then substring(complaint_no from 2)::integer end), 0) + 1
    into v_next
    from public.complaints
    where extract(year from (created_at at time zone 'Asia/Kolkata'))::integer = v_year
      and complaint_no like v_prefix || '%';
    new.complaint_no := v_prefix || lpad(v_next::text, 2, '0');
  end if;
  return new;
end;
$$;
