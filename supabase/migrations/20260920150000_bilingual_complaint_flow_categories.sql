-- Bilingual WhatsApp complaint flow and finalized RWA service categories
begin;

update public.service_categories set name = 'PLUMBER', active = true where id = 1;
update public.service_categories set name = 'ELECTRICIAN', active = true where id = 2;
update public.service_categories set name = 'SEWERAGE_ISSUE', active = true where id = 3;
update public.service_categories set name = 'CAMERA_RECORDING', active = true where id = 4;
update public.service_categories set name = 'HORTICULTURE', active = true where id = 5;
update public.service_categories set name = 'STREET_LIGHT', active = true where id = 6;

alter table public.complaints
  add column if not exists preferred_language varchar(2) not null default 'EN',
  add column if not exists elderly_citizen_70_plus boolean not null default false,
  add column if not exists location_text varchar(150),
  add column if not exists issue_type varchar(80),
  add column if not exists incident_datetime_text varchar(100);

alter table public.whatsapp_complaint_sessions
  add column if not exists preferred_language varchar(2),
  add column if not exists elderly_citizen_70_plus boolean not null default false,
  add column if not exists location_text varchar(150),
  add column if not exists issue_type varchar(80),
  add column if not exists incident_datetime_text varchar(100),
  add column if not exists wants_description boolean;

alter table public.complaints drop constraint if exists complaints_preferred_language_check;
alter table public.complaints add constraint complaints_preferred_language_check
  check (preferred_language in ('EN','HI'));

alter table public.whatsapp_complaint_sessions drop constraint if exists whatsapp_sessions_preferred_language_check;
alter table public.whatsapp_complaint_sessions add constraint whatsapp_sessions_preferred_language_check
  check (preferred_language is null or preferred_language in ('EN','HI'));

create index if not exists complaints_attention_order_idx
  on public.complaints (is_urgent desc, elderly_citizen_70_plus desc, created_at asc);

create or replace function public.get_complaints_ahead(p_complaint_id bigint)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_category_id bigint; v_created_at timestamptz; v_is_urgent boolean;
  v_elderly boolean; v_priority integer; v_count integer;
begin
  select category_id, created_at, is_urgent, elderly_citizen_70_plus
    into v_category_id, v_created_at, v_is_urgent, v_elderly
  from public.complaints where id = p_complaint_id;
  if v_category_id is null then return 0; end if;
  v_priority := case when v_is_urgent then 1 when v_elderly then 2 else 3 end;
  select count(*) into v_count
  from public.complaints c
  where c.category_id = v_category_id
    and c.status in ('OPEN','ACKNOWLEDGED','ASSIGNED','WORK_DONE','REOPENED')
    and c.id <> p_complaint_id
    and (
      (case when c.is_urgent then 1 when c.elderly_citizen_70_plus then 2 else 3 end) < v_priority
      or (
        (case when c.is_urgent then 1 when c.elderly_citizen_70_plus then 2 else 3 end) = v_priority
        and (c.created_at < v_created_at or (c.created_at = v_created_at and c.id < p_complaint_id))
      )
    );
  return coalesce(v_count,0);
end;
$$;

commit;
