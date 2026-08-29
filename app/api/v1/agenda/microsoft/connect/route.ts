/**
 * GET /api/v1/agenda/microsoft/connect — começa a conexão da agenda do Outlook.
 *
 * Clone da rota do Google. Manda a pessoa ao consentimento da Microsoft com um
 * `state` assinado que carrega QUEM está conectando. Piso de papel: `agent`.
 *
 * Todo desfecho — inclusive os de falha — volta para a Agenda com
 * `?erro=<código>`. A falta de sessão e a falta de papel ficam com o gate
 * canônico (`requireRole`).
 *
 * O cookie de vínculo reusa `crm_oauth_bind` (`lib/agenda/google/vinculo.ts`)
 * com PATH deste callback. `sameSite: "lax"` é o ponto; `secure` sai de
 * `cookieSecure()`, nunca `true` literal.
 */

import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { CAMINHO_DO_CALLBACK, configuracaoDoMicrosoft } from "@/lib/agenda/microsoft/config";
import { emitirEstado } from "@/lib/agenda/google/estado";
import { assinarVinculo, NOME_DO_VINCULO, VALIDADE_DO_VINCULO_S } from "@/lib/agenda/google/vinculo";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { montarUrlDeConsentimento } from "@/lib/agenda/microsoft/oauth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function voltarComErro(codigo: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(`/app/agenda?erro=${codigo}`, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const app = await configuracaoDoMicrosoft();
  if (!app) {
    return voltarComErro("outlook_nao_configurado");
  }

  const nonce = randomBytes(16).toString("base64url");

  let state: string;
  try {
    state = emitirEstado(
      { organizationId: org.orgId, userId: user.id },
      { segredo: env.INTERNAL_SECRET, agora: new Date(), nonce },
    );
  } catch {
    await audit({
      action: "agenda.microsoft.conexao_falhou",
      organizationId: org.orgId,
      metadata: { reason: "segredo_de_state_indisponivel" },
    });
    return voltarComErro("segredo_indisponivel");
  }

  const url = montarUrlDeConsentimento(app, { state, contaSugerida: user.email });

  await audit({
    action: "agenda.microsoft.conexao_iniciada",
    organizationId: org.orgId,
    metadata: { user_id: user.id },
  });

  const resposta = NextResponse.redirect(url);

  resposta.cookies.set(NOME_DO_VINCULO, assinarVinculo(nonce, env.INTERNAL_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_CALLBACK,
    maxAge: VALIDADE_DO_VINCULO_S,
  });

  return resposta;
}
