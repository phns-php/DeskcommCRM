-- 0204 · Conectar o Outlook exigia SSH na VPS e um editor de texto.
--
-- Clone declarado da 0201 (`platform_google_oauth`). O objeto é o mesmo: o app
-- OAuth da INSTALAÇÃO, não da organização. O `redirect_uri` sai de
-- `NEXT_PUBLIC_APP_URL`, o `install.sh` grava o par no `.env` da VPS, e o app é
-- registrado no Azure Portal por quem instalou. Uma VPS por cliente: a
-- credencial pareia 1:1 com a instalação.
--
-- Sem esta tabela, cadastrar o Outlook seria editar o `.env` e recriar o
-- contêiner — o mesmo defeito que a 0201 fechou para o Google. O produto é
-- self-host para quem NÃO programa.
--
-- ─── Por que RLS LIGADA com ZERO policies ───────────────────────────────────
-- Não é descuido, é o desenho — o mesmo de `platform_google_oauth`.
--
-- A anon key VAI PARA O BROWSER. Uma tabela servida pelo PostgREST e "protegida
-- por policy" depende de a policy estar certa; uma tabela com RLS ligada, sem
-- policy nenhuma e com os grants de `anon`/`authenticated` revogados não é
-- servida de jeito nenhum. Só o `service_role`, que vive no servidor, a alcança.
--
-- O `client_secret` do app Azure é o que permite a QUALQUER UM trocar códigos e
-- refresh tokens em nome desta instalação — isto é, ler a agenda de todos os
-- atendentes que conectaram o Outlook.
--
-- ─── A cifra é a que já existe ───────────────────────────────────────────────
-- `fn_encrypt_oauth`/`fn_decrypt_oauth` (migration 0041). Nenhuma função nova em
-- `public` ⇒ nenhuma superfície `security definer` nova.

create table if not exists public.platform_microsoft_oauth (
  id smallint primary key default 1,
  client_id text,
  client_secret_encrypted bytea,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_microsoft_oauth_singleton check (id = 1)
);

comment on table public.platform_microsoft_oauth is
  'O app OAuth do Microsoft Graph DESTA INSTALAÇÃO (singleton). Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated — o PostgREST não a serve. O segredo nunca volta ao browser; a tela devolve apenas se existe.';
comment on column public.platform_microsoft_oauth.client_secret_encrypted is
  'Cifrado por fn_encrypt_oauth (pgp_sym_encrypt/aes256), a mesma cifra dos tokens em calendar_connections. Nunca gravar em claro: sem a chave mestra o save recusa.';

alter table public.platform_microsoft_oauth enable row level security;

revoke all on public.platform_microsoft_oauth from anon, authenticated;
grant select, insert, update on public.platform_microsoft_oauth to service_role;

drop trigger if exists trg_platform_microsoft_oauth_updated_at on public.platform_microsoft_oauth;
create trigger trg_platform_microsoft_oauth_updated_at
  before update on public.platform_microsoft_oauth
  for each row execute function public.fn_set_updated_at();
