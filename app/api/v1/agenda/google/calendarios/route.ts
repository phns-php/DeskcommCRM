/**
 * Lista e configura os calendários da conexão Google da pessoa.
 *
 * GET  — o que está em `calendar_connection_calendars`.
 * PATCH — liga/desliga `counts_for_conflicts` e `is_destination` (no máximo um
 *         destino por conexão; o índice parcial do schema garante).
 * POST — puxa de novo a lista do Google (`calendarList.list`).
 *
 * Service role nas escritas: a RLS da tabela só tem SELECT para o tenant.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  listarCalendariosDaConta,
  sincronizarCalendariosNoBanco,
} from "@/lib/agenda/google/calendarios";
import { PROVEDOR_GOOGLE } from "@/lib/agenda/tipos";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

async function conexaoDaPessoa(organizationId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_connections")
    .select("id, status, oauth_access_token_encrypted, account_email")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("provider", PROVEDOR_GOOGLE)
    .neq("status", "disconnected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { admin, conexao: data };
}

export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;

  const { admin, conexao } = await conexaoDaPessoa(autorizado.org.orgId, autorizado.user.id);
  if (!conexao) {
    return fail("not_found", "Nenhuma agenda do Google conectada.", 404, { requestId });
  }

  const { data: linhas, error } = await admin
    .from("calendar_connection_calendars")
    .select(
      "id, external_calendar_id, name, is_primary, counts_for_conflicts, is_destination, time_zone",
    )
    .eq("connection_id", conexao.id)
    .eq("organization_id", autorizado.org.orgId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }

  return ok(
    {
      connection_id: conexao.id,
      account_email: conexao.account_email,
      calendarios: (linhas ?? []).map((l) => ({
        id: l.id,
        external_calendar_id: l.external_calendar_id,
        name: l.name,
        is_primary: l.is_primary,
        counts_for_conflicts: l.counts_for_conflicts,
        is_destination: l.is_destination,
        time_zone: l.time_zone,
      })),
    },
    { requestId },
  );
}

const patchShape = z.object({
  calendar_id: z.string().uuid(),
  counts_for_conflicts: z.boolean().optional(),
  is_destination: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;

  let body: z.infer<typeof patchShape>;
  try {
    body = patchShape.parse(await req.json());
  } catch {
    return fail("validation_failed", "payload inválido", 422, { requestId });
  }

  if (body.counts_for_conflicts === undefined && body.is_destination === undefined) {
    return fail("validation_failed", "informe counts_for_conflicts ou is_destination", 422, {
      requestId,
    });
  }

  const { admin, conexao } = await conexaoDaPessoa(autorizado.org.orgId, autorizado.user.id);
  if (!conexao) {
    return fail("not_found", "Nenhuma agenda do Google conectada.", 404, { requestId });
  }

  const { data: alvo } = await admin
    .from("calendar_connection_calendars")
    .select("id, connection_id, is_destination")
    .eq("id", body.calendar_id)
    .eq("connection_id", conexao.id)
    .eq("organization_id", autorizado.org.orgId)
    .maybeSingle();

  if (!alvo) {
    return fail("not_found", "Calendário não encontrado nesta conexão.", 404, { requestId });
  }

  if (body.is_destination === true) {
    await admin
      .from("calendar_connection_calendars")
      .update({ is_destination: false, updated_at: new Date().toISOString() })
      .eq("connection_id", conexao.id)
      .eq("organization_id", autorizado.org.orgId)
      .neq("id", body.calendar_id);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.counts_for_conflicts !== undefined) {
    patch.counts_for_conflicts = body.counts_for_conflicts;
  }
  if (body.is_destination !== undefined) {
    patch.is_destination = body.is_destination;
  }

  const { error } = await admin
    .from("calendar_connection_calendars")
    .update(patch)
    .eq("id", body.calendar_id)
    .eq("organization_id", autorizado.org.orgId);

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }

  await audit({
    action: "agenda.google.calendario_configurado",
    organizationId: autorizado.org.orgId,
    metadata: {
      calendar_id: body.calendar_id,
      counts_for_conflicts: body.counts_for_conflicts,
      is_destination: body.is_destination,
    },
  });

  return ok({ ok: true }, { requestId });
}

/** Atualiza a lista a partir do Google (não apaga escolhas de destino já feitas). */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;

  const { admin, conexao } = await conexaoDaPessoa(autorizado.org.orgId, autorizado.user.id);
  if (!conexao?.oauth_access_token_encrypted) {
    return fail("not_found", "Nenhuma agenda do Google conectada.", 404, { requestId });
  }

  const accessToken = await decryptWebhookSecret(admin, conexao.oauth_access_token_encrypted);
  if (!accessToken) {
    return fail("token_expired", "Reconecte a agenda do Google.", 401, { requestId });
  }

  const lista = await listarCalendariosDaConta(accessToken);
  if (!lista.ok) {
    return fail("internal_error", lista.detalhe, 502, { requestId });
  }

  const sync = await sincronizarCalendariosNoBanco(admin, {
    organizationId: autorizado.org.orgId,
    connectionId: conexao.id,
    calendarios: lista.calendarios,
  });
  if (!sync.ok) {
    return fail("internal_error", sync.detalhe, 500, { requestId });
  }

  return ok({ gravados: sync.gravados }, { requestId });
}
