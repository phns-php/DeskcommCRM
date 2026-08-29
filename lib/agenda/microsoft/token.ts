/**
 * As duas chamadas de rede do OAuth do Microsoft Graph: trocar o código e renovar.
 *
 * Clone de `lib/agenda/google/token.ts`. Nenhuma das duas lança. A renovação
 * **não** grava nada e **não** funde nada — quem chama passa por `fundirTokens`
 * antes de persistir.
 */

import {
  ENDERECO_DE_TOKEN,
  ESCOPOS_DO_CONSENTIMENTO,
  lerRespostaDeToken,
  type LeituraDeToken,
} from "./oauth";
import type { AppDoMicrosoftConfigurado } from "./config";

const PRAZO_MS = 10_000;

async function pedirToken(corpo: URLSearchParams, agora: Date): Promise<LeituraDeToken> {
  let resposta: Response;
  try {
    resposta = await fetch(ENDERECO_DE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, motivo: "resposta_invalida", detalhe: `sem resposta da Microsoft: ${motivo}` };
  }

  let bruto: unknown;
  try {
    bruto = await resposta.json();
  } catch {
    return {
      ok: false,
      motivo: "resposta_invalida",
      detalhe: `HTTP ${resposta.status} com corpo ilegível`,
    };
  }

  return lerRespostaDeToken(bruto, { agora });
}

/** Troca o `code` do consentimento pelo primeiro par de tokens. */
export async function trocarCodigoPorToken(
  app: AppDoMicrosoftConfigurado,
  code: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  return pedirToken(
    new URLSearchParams({
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
      grant_type: "authorization_code",
      // O Azure v2 pede o mesmo recorte do consentimento nesta perna. Sem
      // `scope` aqui, a resposta às vezes omite o eco — e o callback acusaria
      // permissão incompleta numa conexão boa.
      scope: ESCOPOS_DO_CONSENTIMENTO.join(" "),
    }),
    opcoes.agora,
  );
}

/**
 * Renova o `access_token` com o `refresh_token`.
 *
 * ⚠️ A resposta vem SEM `refresh_token`. Passe o resultado por `fundirTokens`
 * antes de gravar — ver o cabeçalho.
 */
export async function renovarToken(
  app: AppDoMicrosoftConfigurado,
  refreshToken: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  return pedirToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "refresh_token",
    }),
    opcoes.agora,
  );
}
