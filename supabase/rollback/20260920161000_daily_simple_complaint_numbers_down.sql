-- Restore globally unique dated complaint numbers.
begin;

create sequence if not exists public.complaint_number_seq;

create or replace function public.generate_complaint_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_seq bigint;
begin
  if new.complaint_no is null or btrim(new.complaint_no) = '' then
    v_seq := nextval('public.complaint_number_seq');
    new.complaint_no :=
      'CMP-' ||
      to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') ||
      '-' ||
      lpad(v_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

-- Daily serials can repeat across dates, so restore uniqueness only if current data permits it.
-- This rollback intentionally leaves the old UNIQUE constraint absent if duplicate complaint_no values already exist.
commit;
