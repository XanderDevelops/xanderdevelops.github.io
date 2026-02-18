-- Xander Community Hub schema for support.html + assets/js/support.js
-- Run this in Supabase SQL Editor.

create table if not exists public.community_users (
  username text primary key,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint community_users_username_format_chk
    check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

create unique index if not exists community_users_username_lower_uniq
  on public.community_users (lower(username));

create table if not exists public.community_posts (
  id text primary key,
  type text not null check (type in ('support', 'blog')),
  parent_post_id text,
  project text not null,
  title text not null,
  body text not null,
  author text not null,
  created_at timestamptz not null default now(),
  pinned boolean not null default false
);

create index if not exists community_posts_created_at_idx
  on public.community_posts (created_at desc);

create index if not exists community_posts_project_idx
  on public.community_posts (project);

create table if not exists public.community_comments (
  id text primary key,
  post_id text not null references public.community_posts(id) on delete cascade,
  parent_comment_id text,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_id_created_at_idx
  on public.community_comments (post_id, created_at);

alter table public.community_posts
  add column if not exists parent_post_id text;

alter table public.community_comments
  add column if not exists parent_comment_id text;

create index if not exists community_posts_parent_post_id_idx
  on public.community_posts (parent_post_id);

create index if not exists community_comments_parent_comment_id_idx
  on public.community_comments (parent_comment_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_parent_post_id_fkey'
  ) then
    alter table public.community_posts
      add constraint community_posts_parent_post_id_fkey
      foreign key (parent_post_id) references public.community_posts(id) on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_comments_parent_comment_id_fkey'
  ) then
    alter table public.community_comments
      add constraint community_comments_parent_comment_id_fkey
      foreign key (parent_comment_id) references public.community_comments(id) on delete cascade;
  end if;
end
$$;

alter table public.community_users enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;

drop policy if exists community_users_select_all on public.community_users;
create policy community_users_select_all
  on public.community_users
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_users_insert_all on public.community_users;
create policy community_users_insert_all
  on public.community_users
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists community_posts_select_all on public.community_posts;
create policy community_posts_select_all
  on public.community_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_posts_insert_all on public.community_posts;
create policy community_posts_insert_all
  on public.community_posts
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists community_comments_select_all on public.community_comments;
create policy community_comments_select_all
  on public.community_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_comments_insert_all on public.community_comments;
create policy community_comments_insert_all
  on public.community_comments
  for insert
  to anon, authenticated
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.community_users to anon, authenticated;
grant select, insert on public.community_posts to anon, authenticated;
grant select, insert on public.community_comments to anon, authenticated;
