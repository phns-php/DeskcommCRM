/**
 * DESCONECTAR A AGENDA DO OUTLOOK.
 *
 * Clone da rota do Google. Apaga tokens, calendários e eventos externos —
 * `lib/agenda/consulta.ts` lê a ocupação filtrando só por `user_id`, então uma
 * conexão `disconnected` continuaria bloqueando horário para sempre.
 *
 * A própria pessoa desconecta a dela com `agent`. Desconectar a de OUTRO membro
 * exige `manager`. O `organization_id` vem SEMPRE da sessão, nunca do corpo.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { PROVEDOR_MICROSOFT } from "@/lib/agenda/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpo = z.object({
  user_id: z.string().uuid().optional(),
});

export async function DELETE(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  let alvo = user.id;
  const bruto = await req.json().catch(() => ({}));
  const lido = corpo.safeParse(bruto);
  if (!lido.success) {
    return fail("validation_failed", "Corpo inválido para desconectar.", 422, { requestId });
  }
  if (lido.data.user_id && lido.data.user_id !== user.id) {
    const gestor = await requireRole("manager", { requestId, resource: "calendar_connections" });
    if (!gestor.ok) return gestor.response;
    alvo = lido.data.user_id;
  }

  const admin = createAdminClient();

  const { data: conexoes, error: erroLeitura } = await admin
    .from("calendar_connections")
    .select("id, account_email")
    .eq("organization_id", org.orgId)
    .eq("user_id", alvo)
    .eq("provider", PROVEDOR_MICROSOFT);

  if (erroLeitura) {
    return fail("internal_error", erroLeitura.message, 500, { requestId });
  }
  if (!conexoes || conexoes.length === 0) {
    return fail("not_found", "Não há agenda do Outlook conectada para esta pessoa.", 404, {
      requestId,
    });
  }

  const ids = conexoes.map((c) => c.id);

  const { error: erroEventos } = await admin
    .from("calendar_external_events")
    .delete()
    .eq("organization_id", org.orgId)
    .in("connection_id", ids);
  if (erroEventos) return fail("internal_error", erroEventos.message, 500, { requestId });

  const { error: erroCalendarios } = await admin
    .from("calendar_connection_calendars")
    .delete()
    .eq("organization_id", org.orgId)
    .in("connection_id", ids);
  if (erroCalendarios) return fail("internal_error", erroCalendarios.message, 500, { requestId });

  const { error: erroConexao } = await admin
    .from("calendar_connections")
    .update({
      status: "disconnected",
      oauth_access_token_encrypted: null,
      oauth_refresh_token_encrypted: null,
      token_expires_at: null,
      sync_token: null,
      last_sync_error: null,
    })
    .eq("organization_id", org.orgId)
    .in("id", ids);
  if (erroConexao) return fail("internal_error", erroConexao.message, 500, { requestId });

  for (const conexao of conexoes) {
    await audit({
      action: "agenda.microsoft.conexao_desconectada",
      organizationId: org.orgId,
      resourceType: "calendar_connections",
      resourceId: conexao.id,
      metadata: { user_id: alvo, por: user.id, conta: conexao.account_email },
    });
  }

  return ok({ desconectadas: ids.length }, { requestId });
}
