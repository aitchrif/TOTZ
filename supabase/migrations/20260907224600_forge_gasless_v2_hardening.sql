insert into public.forge_release_flags(key,enabled,updated_at) values
('gasless_testnet_enabled',false,now()),
('gasless_mainnet_enabled',false,now())
on conflict (key) do update set enabled=excluded.enabled,updated_at=now();

insert into public.forge_release_config(key,value,updated_at) values
('gasless_authorization_ttl_seconds','600',now()),
('gasless_retry_window_seconds','900',now()),
('gasless_max_attempts_per_wallet','2',now()),
('gasless_entrypoint_testnet','0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',now()),
('gasless_entrypoint_mainnet','0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',now()),
('gasless_relayer_account_testnet','',now()),
('gasless_relayer_account_mainnet','',now())
on conflict (key) do update set value=excluded.value,updated_at=now();

create table if not exists public.forge_gasless_requests(
  id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null references public.forge_claim_epochs(id) on delete cascade,
  wallet text not null,
  chain_id integer not null,
  request_hash text not null unique,
  status text not null default 'reserved' check(status in ('reserved','submitted','confirmed','failed','rejected')),
  user_op_hash text,
  tx_hash text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(wallet ~ '^0x[0-9a-f]{40}$'),
  check(request_hash ~ '^0x[0-9a-f]{64}$')
);
create index if not exists forge_gasless_requests_epoch_wallet_created_idx on public.forge_gasless_requests(epoch_id,wallet,created_at desc);
create index if not exists forge_gasless_requests_status_created_idx on public.forge_gasless_requests(status,created_at desc);
alter table public.forge_gasless_requests enable row level security;
revoke all on public.forge_gasless_requests from anon,authenticated;

create or replace function public.forge_reserve_gasless_request(
  p_epoch_id uuid,
  p_wallet text,
  p_chain_id integer,
  p_request_hash text,
  p_window_seconds integer default 900,
  p_max_attempts integer default 2
) returns table(request_id uuid,existing boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_wallet text:=lower(trim(p_wallet));
  v_hash text:=lower(trim(p_request_hash));
  v_existing uuid;
  v_count integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid wallet'; end if;
  if v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'invalid request hash'; end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'invalid retry window'; end if;
  if p_max_attempts < 1 or p_max_attempts > 10 then raise exception 'invalid attempt limit'; end if;

  perform pg_advisory_xact_lock(hashtext(p_epoch_id::text||':'||v_wallet));
  select id into v_existing from public.forge_gasless_requests where request_hash=v_hash limit 1;
  if v_existing is not null then return query select v_existing,true; return; end if;

  if exists(select 1 from public.forge_gasless_requests where epoch_id=p_epoch_id and wallet=v_wallet and status='confirmed') then
    raise exception 'claim already sponsored';
  end if;

  select count(*) into v_count from public.forge_gasless_requests
  where epoch_id=p_epoch_id and wallet=v_wallet
    and created_at >= now() - make_interval(secs=>p_window_seconds)
    and status in ('reserved','submitted','confirmed');
  if v_count >= p_max_attempts then raise exception 'gasless retry limit reached'; end if;

  insert into public.forge_gasless_requests(epoch_id,wallet,chain_id,request_hash)
  values(p_epoch_id,v_wallet,p_chain_id,v_hash)
  returning id into v_existing;
  return query select v_existing,false;
end $$;

create or replace function public.forge_finalize_gasless_request(
  p_request_id uuid,
  p_status text,
  p_user_op_hash text default null,
  p_tx_hash text default null,
  p_error_code text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('reserved','submitted','confirmed','failed','rejected') then raise exception 'invalid gasless status'; end if;
  update public.forge_gasless_requests set
    status=p_status,
    user_op_hash=coalesce(nullif(lower(trim(p_user_op_hash)),''),user_op_hash),
    tx_hash=coalesce(nullif(lower(trim(p_tx_hash)),''),tx_hash),
    error_code=nullif(left(coalesce(p_error_code,''),120),''),
    updated_at=now()
  where id=p_request_id;
end $$;

revoke all on function public.forge_reserve_gasless_request(uuid,text,integer,text,integer,integer) from public,anon,authenticated;
revoke all on function public.forge_finalize_gasless_request(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.forge_reserve_gasless_request(uuid,text,integer,text,integer,integer) to service_role;
grant execute on function public.forge_finalize_gasless_request(uuid,text,text,text,text) to service_role;
