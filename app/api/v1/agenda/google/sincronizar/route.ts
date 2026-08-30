/**
 * POST /api/v1/agenda/google/sincronizar — a pessoa pede o espelho AGORA.
 *
 * O cron (ida 5 min, volta 15 min) continua o caminho normal. Este botão existe
 * porque o 400 permanente e a ocupação atrasada não podem esperar o próximo
 * tick: a pessoa muda o destino no modal e precisa ver o efeito.
 *
 * Agenda do CRM continua principal: isto só empurra o que já está em
 * `calendar_appointments` e puxa ocupação para `calendar_external_events`.
 */
import { type NextRequest } from "next/server";

import { sincronizarAgendasDoGoogle } from "@/app/api/v1/cron/agenda-google-sync/route";
import { resolverIdDoCalendarioGoogle } from "@/lib/agenda/google/id-do-calendario";
import { apagarNoGoogle, publicarNoGoogle } from "@/lib/agenda/google/escrita";
import type { AgendamentoParaGoogle } from "@/lib/agenda/google/evento";
import { PROVEDOR_GOOGLE } from "@/lib/agenda/tipos";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

const TETO_IDA = 30;

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;

  const admin = createAdminClient();
  const orgId = autorizado.org.orgId;
  const userId = autorizado.user.id;

  const { data: conexao } = await admin
    .from("calendar_connections")
    .select("id, status, oauth_access_token_encrypted, account_email")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("provider", PROVEDOR_GOOGLE)
    .eq("status", "healthy")
    .maybeSingle();

  if (!conexao?.oauth_access_token_encrypted) {
    return fail("not_found", "Nenhuma agenda do Google conectada.", 404, { requestId });
  }

  const accessToken = await decryptWebhookSecret(admin, conexao.oauth_access_token_encrypted);
  if (!accessToken) {
    return fail("token_expired", "Reconecte a agenda do Google.", 401, { requestId });
  }

  const { data: calendariosLinha } = await admin
    .from("calendar_connection_calendars")
    .select("id, organization_id, connection_id, external_calendar_id, sync_token, time_zone")
    .eq("organization_id", orgId)
    .eq("connection_id", conexao.id)
    .eq("counts_for_conflicts", true);

  const volta = await sincronizarAgendasDoGoogle(admin, {
    agora: new Date(),
    calendarios: (calendariosLinha ?? []).map((l) => ({
      id: String(l.id),
      organization_id: orgId,
      connection_id: conexao.id,
      user_id: userId,
      external_calendar_id: String(l.external_calendar_id),
      sync_token: (l.sync_token as string | null) ?? null,
      fuso: (l.time_zone as string | null) ?? null,
      access_token_encrypted: conexao.oauth_access_token_encrypted,
    })),
  });

  const { data: pendentes } = await admin
    .from("calendar_appointments")
    .select(
      "id, organization_id, owner_user_id, title, description, starts_at, ends_at, time_zone, status, location_kind, location_details, google_event_id, google_calendar_id, google_connection_id",
    )
    .eq("organization_id", orgId)
    .eq("owner_user_id", userId)
    .eq("needs_google_push", true)
    .order("starts_at", { ascending: true })
    .limit(TETO_IDA);

  const ida = { publicados: 0, apagados: 0, falhas: 0 };

  for (const linha of pendentes ?? []) {
    const calendario = await resolverIdDoCalendarioGoogle(admin, {
      organizationId: orgId,
      connectionId: conexao.id,
      candidato: linha.google_calendar_id,
      fallbackAccountEmail: conexao.account_email,
    });
    if (!calendario) {
      ida.falhas += 1;
      await admin
        .from("calendar_appointments")
        .update({ google_sync_error: "calendário de destino inválido" })
        .eq("id", linha.id)
        .eq("organization_id", orgId);
      continue;
    }

    const cancelado = linha.status === "cancelled";
    const efeito = cancelado
      ? await apagarNoGoogle(accessToken, calendario, linha.id)
      : await publicarNoGoogle(
          accessToken,
          calendario,
          {
            id: linha.id,
            organization_id: orgId,
            title: linha.title ?? "Agendamento",
            description: linha.description,
            starts_at: linha.starts_at,
            ends_at: linha.ends_at,
            time_zone: linha.time_zone,
            status: linha.status,
            location_kind: linha.location_kind,
            location_details: linha.location_details,
          } as AgendamentoParaGoogle,
          linha.google_event_id,
        );

    if (!efeito.ok) {
      ida.falhas += 1;
      await admin
        .from("calendar_appointments")
        .update({ google_sync_error: efeito.detalhe })
        .eq("id", linha.id)
        .eq("organization_id", orgId);
      continue;
    }

    await admin
      .from("calendar_appointments")
      .update({
        google_connection_id: conexao.id,
        google_calendar_id: calendario,
        google_event_id: cancelado ? null : efeito.eventoId,
        google_sequence: efeito.sequence,
        google_synced_at: new Date().toISOString(),
        google_sync_error: null,
      })
      .eq("id", linha.id)
      .eq("organization_id", orgId);

    if (cancelado) ida.apagados += 1;
    else ida.publicados += 1;
  }

  await audit({
    action: "agenda.google.sync_manual",
    organizationId: orgId,
    actorUserId: userId,
    requestId,
    metadata: { ida, volta },
  });

  return ok({ ida, volta }, { requestId });
}
