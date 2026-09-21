-- Rollback bilingual complaint flow metadata/category labels
begin;

drop index if exists public.complaints_attention_order_idx;

alter table public.complaints
  drop constraint if exists complaints_preferred_language_check;
alter table public.whatsapp_complaint_sessions
  drop constraint if exists whatsapp_sessions_preferred_language_check;

alter table public.complaints
  drop column if exists preferred_language,
  drop column if exists elderly_citizen_70_plus,
  drop column if exists location_text,
  drop column if exists issue_type,
  drop column if exists incident_datetime_text;

alter table public.whatsapp_complaint_sessions
  drop column if exists preferred_language,
  drop column if exists elderly_citizen_70_plus,
  drop column if exists location_text,
  drop column if exists issue_type,
  drop column if exists incident_datetime_text,
  drop column if exists wants_description;

update public.service_categories set name = 'PLUMBING' where id = 1;
update public.service_categories set name = 'ELECTRICAL' where id = 2;
update public.service_categories set name = 'HOUSEKEEPING' where id = 3;
update public.service_categories set name = 'SECURITY' where id = 4;
update public.service_categories set name = 'COMMON_AREA' where id = 5;
update public.service_categories set name = 'OTHER' where id = 6;

-- Restore the prior priority function semantics.
create or replace function public.get_complaints_ahead(p_complaint_id bigint)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_category_id bigint; v_created_at timestamptz; v_is_urgent boolean;
  v_super_senior boolean; v_priority integer; v_count integer;
begin
  select category_id, created_at, is_urgent, super_senior_citizen_alone
    into v_category_id, v_created_at, v_is_urgent, v_super_senior
  from public.complaints where id = p_complaint_id;
  if v_category_id is null then return 0; end if;
  v_priority := case when v_is_urgent then 1 when v_super_senior then 2 else 3 end;
  select count(*) into v_count
  from public.complaints c
  where c.category_id = v_category_id
    and c.status in ('OPEN','ACKNOWLEDGED','ASSIGNED','WORK_DONE','REOPENED')
    and c.id <> p_complaint_id
    and (
      (case when c.is_urgent then 1 when c.super_senior_citizen_alone then 2 else 3 end) < v_priority
      or (
        (case when c.is_urgent then 1 when c.super_senior_citizen_alone then 2 else 3 end) = v_priority
        and (c.created_at < v_created_at or (c.created_at = v_created_at and c.id < p_complaint_id))
      )
    );
  return coalesce(v_count,0);
end;
$$;

commit;
