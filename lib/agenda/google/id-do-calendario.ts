/**
 * Qual string pode ir na URL do Google como `calendarId`.
 *
 * O HTTP 400 `Invalid resource id value` nasce aqui: o worker mandava o que
 * estivesse em `calendar_appointments.google_calendar_id` sem perguntar se
 * aquilo era um id DO GOOGLE. Dois ids convivem neste módulo, e só um deles
 * o Google aceita:
 *
 *   calendar_connection_calendars.id     → UUID nosso, ponteiro interno
 *   calendar_connection_calendars.external_calendar_id
 *                                        → e-mail ou `…@group.calendar.google.com`
 *
 * O binding do agente grava o UUID no `ai_agents.config`. Se alguém (ou um
 * insert antigo) copiou esse UUID para `google_calendar_id`, o Google recusa
 * com 400 permanente e o cron repete a cada 5 min sem mudar o resultado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { PROVEDOR_GOOGLE } from "@/lib/agenda/tipos";

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID v4 ou genérico — o Google NUNCA aceita isto como calendarId. */
export function eIdInternoDeCalendario(valor: string | null | undefined): boolean {
  return typeof valor === "string" && UUID_RX.test(valor.trim());
}

/**
 * Parece id de calendário que o Google Calendar API aceita.
 * Recusa UUID, vazio e `"primary"` (alias de API, não é o que gravamos).
 */
export function eIdDoCalendarioNoGoogle(valor: string | null | undefined): boolean {
  if (typeof valor !== "string") return false;
  const id = valor.trim();
  if (!id || eIdInternoDeCalendario(id) || id.toLowerCase() === "primary") return false;
  return id.includes("@");
}

export type DestinoGoogle = {
  connectionId: string;
  externalCalendarId: string;
};

/**
 * Traduz o que a linha tem (ou não tem) no id que a API do Google aceita.
 *
 * Ordem: candidato válido → UUID interno resolvido na tabela → destino da
 * conexão (`is_destination` / primário) → e-mail da conta.
 */
export async function resolverIdDoCalendarioGoogle(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    connectionId: string;
    candidato: string | null | undefined;
    fallbackAccountEmail: string | null;
  },
): Promise<string | null> {
  const candidato = params.candidato?.trim() || null;

  if (candidato && eIdDoCalendarioNoGoogle(candidato)) return candidato;

  if (candidato && eIdInternoDeCalendario(candidato)) {
    const { data } = await admin
      .from("calendar_connection_calendars")
      .select("external_calendar_id")
      .eq("id", candidato)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    const externo = data?.external_calendar_id ? String(data.external_calendar_id).trim() : "";
    if (eIdDoCalendarioNoGoogle(externo)) return externo;
  }

  const { data: destino } = await admin
    .from("calendar_connection_calendars")
    .select("external_calendar_id")
    .eq("connection_id", params.connectionId)
    .eq("organization_id", params.organizationId)
    .eq("is_destination", true)
    .limit(1)
    .maybeSingle();
  if (destino?.external_calendar_id && eIdDoCalendarioNoGoogle(String(destino.external_calendar_id))) {
    return String(destino.external_calendar_id).trim();
  }

  const { data: primario } = await admin
    .from("calendar_connection_calendars")
    .select("external_calendar_id")
    .eq("connection_id", params.connectionId)
    .eq("organization_id", params.organizationId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();
  if (primario?.external_calendar_id && eIdDoCalendarioNoGoogle(String(primario.external_calendar_id))) {
    return String(primario.external_calendar_id).trim();
  }

  const email = params.fallbackAccountEmail?.trim() || "";
  return eIdDoCalendarioNoGoogle(email) ? email : null;
}

/**
 * Destino a gravar NA MARCAÇÃO — a linha do CRM nasce já com o id do Google,
 * não com o UUID da nossa tabela. Sem isto o push herda lixo e o 400 é eterno.
 */
export async function destinoGoogleAoMarcar(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    ownerUserId: string;
    googleCalendarId?: string | null;
    googleConnectionId?: string | null;
  },
): Promise<DestinoGoogle | null> {
  const informado = params.googleCalendarId?.trim() || null;
  const conexaoInformada = params.googleConnectionId?.trim() || null;

  if (informado && eIdDoCalendarioNoGoogle(informado) && conexaoInformada) {
    return { connectionId: conexaoInformada, externalCalendarId: informado };
  }

  if (informado && eIdInternoDeCalendario(informado)) {
    const { data } = await supabase
      .from("calendar_connection_calendars")
      .select("external_calendar_id, connection_id")
      .eq("id", informado)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (data?.external_calendar_id && eIdDoCalendarioNoGoogle(String(data.external_calendar_id))) {
      return {
        connectionId: String(data.connection_id),
        externalCalendarId: String(data.external_calendar_id).trim(),
      };
    }
  }

  const { data: conexao } = await supabase
    .from("calendar_connections")
    .select("id, account_email")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.ownerUserId)
    .eq("provider", PROVEDOR_GOOGLE)
    .eq("status", "healthy")
    .limit(1)
    .maybeSingle();

  if (!conexao?.id) return null;

  const externo = await resolverIdDoCalendarioGoogle(supabase, {
    organizationId: params.organizationId,
    connectionId: conexao.id,
    candidato: informado && eIdDoCalendarioNoGoogle(informado) ? informado : null,
    fallbackAccountEmail: conexao.account_email,
  });
  if (!externo) return null;
  return { connectionId: conexao.id, externalCalendarId: externo };
}
