-- ============================================================
-- RWBOT RAG FOUNDATION
-- RWA Transparency Assistant
-- ============================================================

create extension if not exists vector with schema extensions;

-- If an older environment still has public.documents, rename it once.
do $$
begin
  if to_regclass('public.rwbot_documents') is null
     and to_regclass('public.documents') is not null then
    alter table public.documents rename to rwbot_documents;
  end if;
end
$$;

-- Processing metadata on the document master.
alter table public.rwbot_documents
  add column if not exists processed_at timestamptz,
  add column if not exists processing_error text,
  add column if not exists chunk_count integer not null default 0;

-- ============================================================
-- SEARCHABLE DOCUMENT CHUNKS
-- ============================================================

create table if not exists public.rwbot_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.rwbot_documents(id)
    on delete cascade,
  chunk_no integer not null,
  content text not null,
  page_no integer,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_no)
);

alter table public.rwbot_document_chunks
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists embedding extensions.vector(768);

create index if not exists idx_rwbot_document_chunks_document_id
  on public.rwbot_document_chunks(document_id);

alter table public.rwbot_document_chunks enable row level security;

drop policy if exists "users can read permitted rwbot document chunks"
  on public.rwbot_document_chunks;

create policy "users can read permitted rwbot document chunks"
  on public.rwbot_document_chunks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rwbot_documents d
      where d.id = document_id
        and (
          d.resident_visible = true
          or public.is_rwa_member()
        )
    )
  );

drop policy if exists "rwa members can insert rwbot document chunks"
  on public.rwbot_document_chunks;

create policy "rwa members can insert rwbot document chunks"
  on public.rwbot_document_chunks
  for insert
  to authenticated
  with check (public.is_rwa_member());

drop policy if exists "rwa members can update rwbot document chunks"
  on public.rwbot_document_chunks;

create policy "rwa members can update rwbot document chunks"
  on public.rwbot_document_chunks
  for update
  to authenticated
  using (public.is_rwa_member())
  with check (public.is_rwa_member());

drop policy if exists "rwa members can delete rwbot document chunks"
  on public.rwbot_document_chunks;

create policy "rwa members can delete rwbot document chunks"
  on public.rwbot_document_chunks
  for delete
  to authenticated
  using (public.is_rwa_member());

grant select, insert, update, delete
  on public.rwbot_document_chunks
  to authenticated;

-- ============================================================
-- QUESTION AUDIT LOG
-- ============================================================

create table if not exists public.rwbot_question_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  source_type text not null default 'documents',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rwbot_question_log_user_created
  on public.rwbot_question_log(user_id, created_at desc);

alter table public.rwbot_question_log enable row level security;

drop policy if exists "users can read own rwbot question log"
  on public.rwbot_question_log;

create policy "users can read own rwbot question log"
  on public.rwbot_question_log
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_rwa_member()
  );

drop policy if exists "users can insert own rwbot question log"
  on public.rwbot_question_log;

create policy "users can insert own rwbot question log"
  on public.rwbot_question_log
  for insert
  to authenticated
  with check (user_id = auth.uid());

grant select, insert
  on public.rwbot_question_log
  to authenticated;

-- ============================================================
-- SEMANTIC SEARCH RPC
-- SECURITY INVOKER keeps the caller's RLS context.
-- ============================================================

create or replace function public.match_rwbot_document_chunks(
  query_embedding extensions.vector(768),
  match_count integer default 6,
  match_threshold double precision default 0.28
)
returns table (
  chunk_id uuid,
  document_id uuid,
  chunk_no integer,
  content text,
  page_no integer,
  similarity double precision,
  title text,
  document_type text,
  document_date date,
  file_name text,
  file_path text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    c.document_id,
    c.chunk_no,
    c.content,
    c.page_no,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title,
    d.document_type,
    d.document_date,
    d.file_name,
    d.file_path
  from public.rwbot_document_chunks c
  join public.rwbot_documents d
    on d.id = c.document_id
  where c.embedding is not null
    and (
      d.resident_visible = true
      or public.is_rwa_member()
    )
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 12));
$$;

revoke execute on function public.match_rwbot_document_chunks(
  extensions.vector,
  integer,
  double precision
) from anon;

grant execute on function public.match_rwbot_document_chunks(
  extensions.vector,
  integer,
  double precision
) to authenticated;

-- ============================================================
-- STORAGE POLICIES (re-pointed explicitly after table rename)
-- ============================================================

drop policy if exists "rwa members can upload rwbot files"
  on storage.objects;

create policy "rwa members can upload rwbot files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rwbot-documents'
    and public.is_rwa_member()
  );

drop policy if exists "rwa members can update rwbot files"
  on storage.objects;

create policy "rwa members can update rwbot files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'rwbot-documents'
    and public.is_rwa_member()
  )
  with check (
    bucket_id = 'rwbot-documents'
    and public.is_rwa_member()
  );

drop policy if exists "rwa members can delete rwbot files"
  on storage.objects;

create policy "rwa members can delete rwbot files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'rwbot-documents'
    and public.is_rwa_member()
  );

drop policy if exists "authenticated users can read permitted rwbot files"
  on storage.objects;

drop policy if exists "users can read permitted rwbot files"
  on storage.objects;

create policy "authenticated users can read permitted rwbot files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'rwbot-documents'
    and (
      public.is_rwa_member()
      or exists (
        select 1
        from public.rwbot_documents d
        where d.file_path = storage.objects.name
          and d.resident_visible = true
      )
    )
  );
