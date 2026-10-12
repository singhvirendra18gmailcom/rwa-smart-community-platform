begin;
alter table public.app_users drop constraint if exists valid_app_user_role;
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('GUARD','SUPERVISOR','PLUMBER','RWA_EXECUTIVE'));

create table public.notice_subscribers (
 mobile_no text primary key check (mobile_no ~ '^[0-9]{10,15}$'),
 flat_no text not null, tower_no integer not null,
 subscribed boolean not null default false,
 consent_at timestamptz not null, consent_text text not null,
 unsubscribed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.rwa_notices (
 id uuid primary key default gen_random_uuid(),
 request_id uuid unique not null,
 created_by uuid not null references auth.users(id),
 template_name text not null, language text not null,
 parameters jsonb not null check (jsonb_typeof(parameters)='array'),
 message_text text not null,
 created_at timestamptz not null default now()
);
create table public.notice_deliveries (
 id uuid primary key default gen_random_uuid(),
 notice_id uuid not null references public.rwa_notices(id) on delete cascade,
 mobile_no text not null references public.notice_subscribers(mobile_no),
 status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','SKIPPED','UNKNOWN')),
 attempts integer not null default 0, error text,
 provider_reference text unique, sent_at timestamptz,
 claimed_at timestamptz,
 unique(notice_id,mobile_no)
);
create index notice_queue_idx on public.notice_deliveries(status) where status='QUEUED';
create index notice_history_idx on public.rwa_notices(created_at desc);
create index notice_deliveries_notice_idx on public.notice_deliveries(notice_id);
alter table public.notice_subscribers enable row level security;
alter table public.rwa_notices enable row level security;
alter table public.notice_deliveries enable row level security;
-- Access goes through the executive-authenticated Worker, never the browser Data API.
revoke all on public.notice_subscribers, public.rwa_notices, public.notice_deliveries from anon, authenticated;
grant all on public.notice_subscribers, public.rwa_notices, public.notice_deliveries to service_role;

create function public.enqueue_rwa_notice(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare notice_id uuid;
begin
 if not exists(select 1 from public.app_users where auth_user_id=(payload->>'created_by')::uuid and active=true and role='RWA_EXECUTIVE') then
  raise exception 'Executive access required';
 end if;
 insert into public.rwa_notices(request_id,created_by,template_name,language,parameters,message_text)
 values((payload->>'request_id')::uuid,(payload->>'created_by')::uuid,payload->>'template_name',payload->>'language',payload->'parameters',payload->>'message_text')
 on conflict(request_id) do nothing returning id into notice_id;
 if notice_id is null then
  select id into notice_id from public.rwa_notices where request_id=(payload->>'request_id')::uuid and created_by=(payload->>'created_by')::uuid;
  if notice_id is null then raise exception 'Request belongs to a different sender'; end if;
  return notice_id;
 end if;
 insert into public.notice_deliveries(notice_id,mobile_no)
 select notice_id,s.mobile_no from public.notice_subscribers s
 join jsonb_array_elements(payload->'recipients') r on r->>'mobile_no'=s.mobile_no
 where s.subscribed=true on conflict do nothing;
 if not found then raise exception 'No subscribed recipients'; end if;
 return notice_id;
end $$;
create function public.claim_notice_deliveries() returns setof public.notice_deliveries
language sql security invoker set search_path='' as $$
 update public.notice_deliveries set status='SENDING',attempts=attempts+1,claimed_at=now()
 where id in (select id from public.notice_deliveries where status='QUEUED' order by id for update skip locked limit 10)
 returning *;
$$;
revoke all on function public.enqueue_rwa_notice(jsonb), public.claim_notice_deliveries() from public, anon, authenticated;
grant execute on function public.enqueue_rwa_notice(jsonb), public.claim_notice_deliveries() to service_role;
commit;
