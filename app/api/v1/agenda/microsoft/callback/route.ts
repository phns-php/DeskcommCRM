/**
 * GET /api/v1/agenda/microsoft/callback — a volta do consentimento da Microsoft.
 *
 * Clone da rota do Google, inclusive a página-ponte HTML 200: um 307 daqui para
 * `/app/agenda` ainda pertence à cadeia iniciada em `login.microsoftonline.com`,
 * o cookie de sessão é `SameSite=Strict` e a pessoa cai no `/login`.
 *
 * A ordem dos passos é contrato — ver o cabeçalho do callback do Google.
 * Reusa `emitirEstado`/`verificarEstado` e o cookie `crm_oauth_bind` (path
 * deste callback).
 *
 * ⚠️ Esta rota TEM de estar em `PUBLIC_PATHS`, ancorada com `$`.
 */

import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { PROVEDOR_MICROSOFT } from "@/lib/agenda/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { CAMINHO_DO_CALLBACK, configuracaoDoMicrosoft } from "@/lib/agenda/microsoft/config";
import { verificarEstado } from "@/lib/agenda/google/estado";
import { NOME_DO_VINCULO, vinculoConfere } from "@/lib/agenda/google/vinculo";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { escoposFaltando } from "@/lib/agenda/microsoft/oauth";
import { trocarCodigoPorToken } from "@/lib/agenda/microsoft/token";
import { contaDaAgendaPrimaria } from "@/lib/agenda/microsoft/conta";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function voltar(parametro: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const destino = new URL(`/app/agenda?${parametro}`, base).toString();
  const seguro = destino
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const resposta = new NextResponse(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">` +
      `<meta name="robots" content="noindex">` +
      `<noscript><meta http-equiv="refresh" content="0;url=${seguro}"></noscript>` +
      `<title>Voltando…</title></head><body>` +
      `<p>Voltando para a sua agenda…</p>` +
      `<script>location.replace(${JSON.stringify(destino)})</script>` +
      `<noscript><p><a href="${seguro}">Continuar</a></p></noscript>` +
      `</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
  resposta.cookies.set(NOME_DO_VINCULO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_CALLBACK,
    maxAge: 0,
  });
  return resposta;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const recusa = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateBruto = url.searchParams.get("state");

  if (recusa) return voltar("erro=conexao_cancelada");

  let estado: ReturnType<typeof verificarEstado> = null;
  try {
    estado = verificarEstado(stateBruto, { segredo: env.INTERNAL_SECRET, agora: new Date() });
  } catch {
    return voltar("erro=retorno_nao_verificavel");
  }
  if (!estado) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      metadata: { reason: "state_invalido" },
    });
    return voltar("erro=retorno_nao_verificavel");
  }
  const { organizationId, userId } = estado;

  const vinculo = req.cookies.get(NOME_DO_VINCULO)?.value;
  if (!vinculoConfere(vinculo, estado.nonce, env.INTERNAL_SECRET)) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "vinculo_ausente_ou_nao_confere", user_id: userId },
    });
    return voltar("erro=retorno_nao_verificavel");
  }

  if (!code) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "sem_codigo", user_id: userId },
    });
    return voltar("erro=retorno_incompleto");
  }

  const app = await configuracaoDoMicrosoft();
  if (!app) return voltar("erro=outlook_nao_configurado");

  const admin = createAdminClient();
  const { error: erroDoNonce } = await admin.from("calendar_oauth_nonces").insert({
    nonce: estado.nonce,
    organization_id: organizationId,
    user_id: userId,
    expira_em: new Date(estado.expiraEmMs).toISOString(),
  });
  if (erroDoNonce) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: {
        reason: erroDoNonce.code === "23505" ? "state_reutilizado" : "nonce_indisponivel",
        user_id: userId,
      },
    });
    return voltar("erro=retorno_nao_verificavel");
  }

  const leitura = await trocarCodigoPorToken(app, code, { agora: new Date() });
  if (!leitura.ok) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: leitura.motivo, detalhe: leitura.detalhe, user_id: userId },
    });
    return voltar("erro=troca_de_codigo_falhou");
  }
  const token = leitura.token;

  // Eco vazio ≠ permissão faltando. A Microsoft às vezes omite `scope` quando
  // ele coincide com o pedido. Falta de verdade é eco PARCIAL (teste ao lado).
  const faltando = token.scope.length === 0 ? [] : escoposFaltando(token.scope);
  if (faltando.length > 0) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "scope_missing", faltando, user_id: userId },
    });
    return voltar("erro=permissao_incompleta");
  }

  const conta = await contaDaAgendaPrimaria(token.access_token);
  if (!conta.ok) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "conta_indisponivel", detalhe: conta.detalhe, user_id: userId },
    });
    return voltar("erro=conta_indisponivel");
  }

  let refreshJaGuardado = false;
  if (!token.refresh_token) {
    const { data: existente } = await admin
      .from("calendar_connections")
      .select("oauth_refresh_token_encrypted")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("provider", PROVEDOR_MICROSOFT)
      .eq("account_email", conta.conta.email)
      .maybeSingle();
    refreshJaGuardado = Boolean(existente?.oauth_refresh_token_encrypted);

    if (!refreshJaGuardado) {
      await audit({
        action: "agenda.microsoft.conexao_falhou",
        organizationId,
        metadata: { reason: "sem_token_de_renovacao", user_id: userId },
      });
      return voltar("erro=sem_token_de_renovacao");
    }
  }

  const accessCifrado = await encryptWebhookSecret(admin, token.access_token);
  const refreshCifrado = token.refresh_token ? await encryptWebhookSecret(admin, token.refresh_token) : null;
  if (!accessCifrado || (token.refresh_token && !refreshCifrado)) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "cifra_indisponivel", user_id: userId },
    });
    return voltar("erro=cifra_indisponivel");
  }

  const { data: conexaoGravada, error: erroAoGravar } = await admin
    .from("calendar_connections")
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        provider: PROVEDOR_MICROSOFT,
        account_email: conta.conta.email,
        oauth_access_token_encrypted: accessCifrado,
        ...(refreshCifrado ? { oauth_refresh_token_encrypted: refreshCifrado } : {}),
        token_expires_at: token.expira_em,
        scopes: token.scope,
        status: "healthy",
        last_sync_error: null,
      },
      { onConflict: "organization_id,user_id,provider,account_email" },
    )
    .select("id")
    .single();

  if (erroAoGravar) {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId,
      metadata: { reason: "upsert_falhou", detalhe: erroAoGravar.message, user_id: userId },
    });
    return voltar("erro=nao_consegui_guardar");
  }

  if (conexaoGravada?.id) {
    const { error: erroDoCalendario } = await admin.from("calendar_connection_calendars").upsert(
      {
        organization_id: organizationId,
        connection_id: conexaoGravada.id,
        external_calendar_id: conta.conta.email,
        name: conta.conta.email,
        is_primary: true,
        time_zone: conta.conta.fuso,
      },
      { onConflict: "organization_id,connection_id,external_calendar_id" },
    );
    if (erroDoCalendario) {
      await audit({
        action: "agenda.microsoft.conexao_falhou",
        organizationId,
        metadata: {
          reason: "calendario_primario_nao_registrado",
          detalhe: erroDoCalendario.message,
          user_id: userId,
        },
      });
    }
  }

  await audit({
    action: "agenda.microsoft.conexao_concluida",
    organizationId,
    metadata: { user_id: userId, account_email: conta.conta.email, fuso: conta.conta.fuso },
  });

  return voltar("ok=agenda_outlook_conectada");
}
