-- WhatsApp complaint conversation state and priority-aware queue
create table if not exists public.whatsapp_complaint_sessions (
  mobile_no varchar(20) primary key,
  step varchar(50) not null default 'CATEGORY',
  category_id bigint references public.service_categories(id),
  flat_no varchar(50),
  description text,
  super_senior_citizen_alone boolean not null default false,
  is_urgent boolean not null default false,
  urgency_code varchar(50),
  urgency_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.whatsapp_complaint_sessions enable row level security;

create index if not exists whatsapp_complaint_sessions_updated_at_idx
  on public.whatsapp_complaint_sessions(updated_at);

create or replace function public.get_complaints_ahead(p_complaint_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id bigint;
  v_created_at timestamptz;
  v_is_urgent boolean;
  v_super_senior boolean;
  v_priority integer;
  v_count integer;
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
