/**
 * POST /api/v1/agenda/caldav/conectar — a pessoa cola URL + usuário + senha de app.
 *
 * Não há OAuth: iCloud, Nextcloud e NAS não devolvem um code. O handshake
 * (PROPFIND) prova que o endereço fala CalDAV com ESSA senha ANTES de gravar.
 * Sem ele, `status=healthy` mentiria sobre um Nginx na home.
 *
 * `organization_id` e `user_id` vêm da sessão. O body traz só o que a pessoa
 * digitou — nunca o tenant. Service role grava, então o filtro manual é a
 * única proteção (anti-pattern nº 10).
 *
 * A senha reusa `oauth_access_token_encrypted` + `fn_encrypt_oauth`. Não há
 * segunda cifra, e não há coluna plaintext. `home_url` é a coleção, não o
 * segredo.
 *
 * Rate limit: cada tentativa é um fetch para um endereço que a pessoa escolheu.
 * Sem teto, a rota vira scanner da LAN da VPS.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";

import { descobrirCalDav } from "@/lib/agenda/caldav/descobrir";
import { PROVEDOR_CALDAV } from "@/lib/agenda/tipos";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

const TETO_POR_USUARIO = 8;
const JANELA_S = 60;

const corpo = z.object({
  home_url: z.string().trim().min(8).max(2048),
  usuario: z.string().trim().min(1).max(320),
  senha: z.string().min(1).max(512),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const limite = await checkRateLimit(`agenda-caldav:${user.id}`, TETO_POR_USUARIO, JANELA_S);
  if (!limite.allowed) {
    return fail("rate_limited", "Muitas tentativas seguidas. Espere um minuto.", 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_S) },
    });
  }

  const lido = corpo.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) {
    return fail("validation_failed", "Informe o endereço, o usuário e a senha de aplicativo.", 422, {
      requestId,
    });
  }

  const descoberta = await descobrirCalDav({
    url: lido.data.home_url,
    usuario: lido.data.usuario,
    senha: lido.data.senha,
  });

  if (!descoberta.ok) {
    await audit({
      action: "agenda.caldav.conexao_falhou",
      organizationId: org.orgId,
      metadata: { reason: descoberta.motivo, user_id: user.id },
    });
    if (descoberta.motivo === "credencial") {
      return fail("unprocessable_entity", "A agenda recusou o usuário ou a senha.", 422, {
        requestId,
      });
    }
    if (descoberta.motivo === "url_recusada") {
      return fail("unprocessable_entity", "Este endereço não pode ser usado.", 422, { requestId });
    }
    if (descoberta.motivo === "nao_e_caldav") {
      return fail("unprocessable_entity", "Este endereço não é uma agenda CalDAV.", 422, {
        requestId,
      });
    }
    if (descoberta.motivo === "timeout") {
      return fail("upstream_unavailable", "A agenda demorou demais para responder.", 504, {
        requestId,
      });
    }
    return fail("upstream_unavailable", "Não consegui falar com a agenda. Confira o endereço e a rede.", 502, {
      requestId,
    });
  }

  const admin = createAdminClient();
  const senhaCifrada = await encryptWebhookSecret(admin, lido.data.senha);
  if (!senhaCifrada) {
    await audit({
      action: "agenda.caldav.conexao_falhou",
      organizationId: org.orgId,
      metadata: { reason: "cifra_indisponivel", user_id: user.id },
    });
    return fail(
      "unprocessable_entity",
      "Não consegui guardar a senha com segurança. A chave de cifra da instalação não está ativa.",
      422,
      { requestId },
    );
  }

  const { data: conexaoGravada, error: erroAoGravar } = await admin
    .from("calendar_connections")
    .upsert(
      {
        organization_id: org.orgId,
        user_id: user.id,
        provider: PROVEDOR_CALDAV,
        account_email: lido.data.usuario,
        home_url: descoberta.homeUrl,
        oauth_access_token_encrypted: senhaCifrada,
        oauth_refresh_token_encrypted: null,
        token_expires_at: null,
        scopes: [],
        status: "healthy",
        last_sync_error: null,
      },
      { onConflict: "organization_id,user_id,provider,account_email" },
    )
    .select("id")
    .single();

  if (erroAoGravar || !conexaoGravada) {
    await audit({
      action: "agenda.caldav.conexao_falhou",
      organizationId: org.orgId,
      metadata: { reason: "upsert_falhou", detalhe: erroAoGravar?.message, user_id: user.id },
    });
    return fail("internal_error", "A conexão funcionou, mas não consegui salvar.", 500, {
      requestId,
    });
  }

  const { error: erroDoCalendario } = await admin.from("calendar_connection_calendars").upsert(
    {
      organization_id: org.orgId,
      connection_id: conexaoGravada.id,
      external_calendar_id: descoberta.homeUrl,
      name: lido.data.usuario,
      is_primary: true,
    },
    { onConflict: "organization_id,connection_id,external_calendar_id" },
  );
  if (erroDoCalendario) {
    await audit({
      action: "agenda.caldav.conexao_falhou",
      organizationId: org.orgId,
      resourceType: "calendar_connections",
      resourceId: conexaoGravada.id,
      metadata: { reason: "calendario_primario_nao_registrado", detalhe: erroDoCalendario.message },
    });
  }

  await audit({
    action: "agenda.caldav.conexao_concluida",
    organizationId: org.orgId,
    resourceType: "calendar_connections",
    resourceId: conexaoGravada.id,
    metadata: { user_id: user.id, conta: lido.data.usuario },
  });

  return ok({ account_email: lido.data.usuario }, { requestId, status: 201 });
}
