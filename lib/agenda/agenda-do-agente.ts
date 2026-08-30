/**
 * Qual calendário Google ESTE agente usa.
 *
 * Mora em `ai_agents.config.agenda.calendar_connection_calendar_id` — o mesmo
 * padrão de `organizations.settings.agenda` (knob centralizado, sem coluna
 * nova). A tela grava; o runtime lê e injeta dono + destino nas tools.
 *
 * Sem isto, o modelo escolhia `owner_user_id` (ou caía no dono do tipo) e o
 * push ia para o `is_destination` da conexão daquela pessoa. Um agente por
 * calendário — vários profissionais na mesma empresa — não cabia.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaAgendaExterna } from "./config-externa";
import { PROVEDOR_GOOGLE } from "./tipos";

export type ConfigDaAgendaDoAgente = {
  /** id de `calendar_connection_calendars`. null = sem binding. */
  calendar_connection_calendar_id: string | null;
};

export const CONFIG_AGENDA_DO_AGENTE_PADRAO: ConfigDaAgendaDoAgente = {
  calendar_connection_calendar_id: null,
};

export type CalendarioGoogleDaOrg = {
  id: string;
  nome: string;
  conta: string;
  ownerUserId: string;
  externalCalendarId: string;
  connectionId: string;
};

export type AgendaDoAgenteResolvida = {
  ownerUserId: string;
  externalCalendarId: string;
  connectionId: string;
  calendarRowId: string;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function lerAgendaDoAgente(
  config: Record<string, unknown> | null | undefined,
): ConfigDaAgendaDoAgente {
  const bloco =
    config && typeof config.agenda === "object" && config.agenda !== null
      ? (config.agenda as Record<string, unknown>)
      : {};
  const id = bloco.calendar_connection_calendar_id;
  if (typeof id === "string" && UUID_RX.test(id)) {
    return { calendar_connection_calendar_id: id };
  }
  return { ...CONFIG_AGENDA_DO_AGENTE_PADRAO };
}

export function mesclarAgendaDoAgente(
  config: Record<string, unknown> | null | undefined,
  patch: Partial<ConfigDaAgendaDoAgente>,
): Record<string, unknown> {
  const atual = (config ?? {}) as Record<string, unknown>;
  const agendaAtual =
    typeof atual.agenda === "object" && atual.agenda !== null
      ? (atual.agenda as Record<string, unknown>)
      : {};
  return {
    ...atual,
    agenda: {
      ...agendaAtual,
      ...patch,
    },
  };
}

/**
 * Calendários Google de conexões saudáveis da organização — o que o select
 * do agente oferece. Manager+ lê pelo RLS (`dono_ou_manager`).
 */
export async function contextoDaAgendaParaOAgente(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ sincronizacaoExterna: boolean; calendarios: CalendarioGoogleDaOrg[] }> {
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  const sincronizacaoExterna = lerConfigDaAgendaExterna(
    org?.settings as Record<string, unknown> | null,
  ).external_sync_enabled;
  const calendarios = sincronizacaoExterna
    ? await listarCalendariosGoogleAtivosDaOrg(supabase, organizationId)
    : [];
  return { sincronizacaoExterna, calendarios };
}

export async function listarCalendariosGoogleAtivosDaOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CalendarioGoogleDaOrg[]> {
  const { data, error } = await supabase
    .from("calendar_connection_calendars")
    .select(
      "id, name, external_calendar_id, connection_id, calendar_connections!inner(user_id, account_email, status, provider)",
    )
    .eq("organization_id", organizationId)
    .eq("calendar_connections.provider", PROVEDOR_GOOGLE)
    .eq("calendar_connections.status", "healthy");

  if (error || !data) return [];

  return data.flatMap((linha) => {
    const conexao = linha.calendar_connections as unknown as {
      user_id?: string;
      account_email?: string | null;
      status?: string;
    } | { user_id?: string; account_email?: string | null; status?: string }[] | null;
    const c = Array.isArray(conexao) ? conexao[0] : conexao;
    if (!c?.user_id) return [];
    return [
      {
        id: String(linha.id),
        nome: String(linha.name ?? linha.external_calendar_id),
        conta: String(c.account_email ?? ""),
        ownerUserId: String(c.user_id),
        externalCalendarId: String(linha.external_calendar_id),
        connectionId: String(linha.connection_id),
      } satisfies CalendarioGoogleDaOrg,
    ];
  });
}

/**
 * Confere que o id escolhido é um calendário Google saudável DESTA org.
 * Sem isto o save aceitaria uuid de outra organização (o config é jsonb).
 */
export async function validarCalendarioGoogleDaOrg(
  supabase: SupabaseClient,
  organizationId: string,
  calendarRowId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("calendar_connection_calendars")
    .select("id, calendar_connections!inner(status, provider)")
    .eq("id", calendarRowId)
    .eq("organization_id", organizationId)
    .eq("calendar_connections.provider", PROVEDOR_GOOGLE)
    .eq("calendar_connections.status", "healthy")
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Liga o ponteiro gravado no agente ao dono + destino reais.
 * null = sem binding, calendário sumiu, Google caiu, ou espelho da org desligado.
 */
export async function resolverAgendaDoAgente(
  supabase: SupabaseClient,
  organizationId: string,
  config: Record<string, unknown> | null | undefined,
  settingsDaOrg?: Record<string, unknown> | null,
): Promise<AgendaDoAgenteResolvida | null> {
  if (settingsDaOrg !== undefined) {
    if (!lerConfigDaAgendaExterna(settingsDaOrg).external_sync_enabled) return null;
  } else {
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (!lerConfigDaAgendaExterna(org?.settings as Record<string, unknown> | null).external_sync_enabled) {
      return null;
    }
  }

  const id = lerAgendaDoAgente(config).calendar_connection_calendar_id;
  if (!id) return null;

  const { data } = await supabase
    .from("calendar_connection_calendars")
    .select(
      "id, external_calendar_id, connection_id, calendar_connections!inner(user_id, status, provider)",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("calendar_connections.provider", PROVEDOR_GOOGLE)
    .eq("calendar_connections.status", "healthy")
    .maybeSingle();

  if (!data) return null;
  const conexao = data.calendar_connections as unknown as { user_id?: string } | { user_id?: string }[] | null;
  const c = Array.isArray(conexao) ? conexao[0] : conexao;
  if (!c?.user_id) return null;

  return {
    calendarRowId: String(data.id),
    externalCalendarId: String(data.external_calendar_id),
    connectionId: String(data.connection_id),
    ownerUserId: String(c.user_id),
  };
}
