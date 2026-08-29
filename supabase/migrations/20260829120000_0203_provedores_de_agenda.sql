-- 0203 · A agenda conectada deixa de ser só Google.
--
-- calendar_connections.provider nasceu com CHECK de um valor (`google_calendar`).
-- Outlook/Microsoft Graph e CalDAV (iCloud, Nextcloud, NAS de clínica) cabem
-- na MESMA tabela — mesma pessoa, mesmo conflito de horário, mesmo motor de
-- slots. Um schema paralelo seria a terceira agenda.
--
-- `home_url` é a coleção CalDAV (calendar-home-set ou o endereço da agenda).
-- OAuth não usa: fica NULL. Senha de aplicativo CalDAV reusa
-- oauth_access_token_encrypted (já cifrado por fn_encrypt_oauth) — não há
-- segunda cifra, e não há coluna plaintext.
--
-- Origens novas no compromisso: microsoft_sync e caldav_sync. O vocabulário
-- TypeScript em lib/agenda/tipos.ts é a fonte; este CHECK tem de espelhar.
--
-- Idempotente: drop+add do CHECK, coluna com if not exists. Nenhum dado a
-- curar — as linhas existentes já são google_calendar, que continua válido.

alter table public.calendar_connections
  add column if not exists home_url text;

comment on column public.calendar_connections.home_url is
  'Endereço da coleção CalDAV (calendar-home-set ou a agenda escolhida). NULL nos provedores OAuth. Nunca é o lugar da senha.';

alter table public.calendar_connections
  drop constraint if exists calendar_connections_provider_check;

alter table public.calendar_connections
  add constraint calendar_connections_provider_check
  check (provider in ('google_calendar', 'microsoft_graph', 'caldav'));

comment on column public.calendar_connections.provider is
  'google_calendar | microsoft_graph | caldav. A feature pergunta capacidades (lib/agenda/capacidades.ts), nunca este nome.';

alter table public.calendar_appointments
  drop constraint if exists calendar_appointments_source_check;

alter table public.calendar_appointments
  add constraint calendar_appointments_source_check
  check (source in ('ui', 'mcp', 'google_sync', 'microsoft_sync', 'caldav_sync', 'public_page'));
