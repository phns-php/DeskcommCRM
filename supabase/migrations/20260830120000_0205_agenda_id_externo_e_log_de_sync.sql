-- ============================================================================
-- 0205 — O ID QUE VAI AO GOOGLE NÃO PODE SER O UUID DA NOSSA TABELA
--
-- `calendar_appointments.google_calendar_id` é o calendarId da API do Google
-- (e-mail ou `…@group.calendar.google.com`). Uma linha antiga podia guardar
-- `calendar_connection_calendars.id` (UUID nosso). O Google recusa com
-- HTTP 400 `Invalid resource id value` e o cron de ida repete para sempre.
--
-- Cura os dados ANTES do CHECK. Sem tabela nova: o rastro da falha já mora em
-- `google_sync_error` + `api_audit_log`. Tabela extra com organization_id
-- exigiria prova RLS no mesmo commit e o freeze de invariants bloqueia
-- editar a varredura.
-- ============================================================================

update public.calendar_appointments a
   set google_calendar_id = c.external_calendar_id
  from public.calendar_connection_calendars c
 where a.google_calendar_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and c.id = a.google_calendar_id::uuid
   and c.organization_id = a.organization_id
   and c.external_calendar_id is not null
   and c.external_calendar_id <> '';

update public.calendar_appointments
   set google_calendar_id = null
 where google_calendar_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.calendar_appointments
  drop constraint if exists calendar_appointments_google_calendar_id_nao_e_uuid;

alter table public.calendar_appointments
  add constraint calendar_appointments_google_calendar_id_nao_e_uuid
  check (
    google_calendar_id is null
    or google_calendar_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

comment on column public.calendar_appointments.google_calendar_id is
  'calendarId da API do Google (e-mail ou grupo). NUNCA o uuid de calendar_connection_calendars.';
comment on column public.calendar_appointments.google_connection_id is
  'FK calendar_connections.id da conta OAuth — não é o id do calendário.';
