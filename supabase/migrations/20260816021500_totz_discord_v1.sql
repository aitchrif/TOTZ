-- Private V1 Discord ↔ wallet linking. No client role receives table access.
create extension if not exists pgcrypto;

create table if not exists public.totz_discord_links (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  active boolean not null default true,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists totz_discord_links_active_discord_uidx
  on public.totz_discord_links (discord_user_id) where active;
create unique index if not exists totz_discord_links_active_wallet_uidx
  on public.totz_discord_links (wallet) where active;
create index if not exists totz_discord_links_wallet_idx
  on public.totz_discord_links (wallet);

create table if not exists public.totz_discord_link_nonces (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('oauth_state', 'link_challenge')),
  token_hash text not null unique,
  nonce text,
  discord_user_id text,
  wallet text,
  issued_at_ms bigint,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (wallet is null or wallet ~ '^0x[0-9a-f]{40}$')
);

create index if not exists totz_discord_nonces_expiry_idx
  on public.totz_discord_link_nonces (expires_at);
create index if not exists totz_discord_nonces_discord_idx
  on public.totz_discord_link_nonces (discord_user_id);

alter table public.totz_discord_links enable row level security;
alter table public.totz_discord_link_nonces enable row level security;

revoke all on public.totz_discord_links from anon, authenticated;
revoke all on public.totz_discord_link_nonces from anon, authenticated;
grant select, insert, update on public.totz_discord_links to service_role;
grant select, insert, update, delete on public.totz_discord_link_nonces to service_role;

comment on table public.totz_discord_links is
  'Private server-managed Discord to wallet links. No direct client policies.';
comment on table public.totz_discord_link_nonces is
  'Single-use OAuth states and wallet link challenges; server managed only.';
