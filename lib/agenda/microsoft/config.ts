/**
 * O app OAuth do Microsoft Graph desta INSTALAÇÃO — e o único lugar que monta o
 * endereço de retorno.
 *
 * Clone declarado de `lib/agenda/google/config.ts`. Sem
 * `MICROSOFT_GRAPH_CLIENT_ID` e `MICROSOFT_GRAPH_CLIENT_SECRET` o módulo de
 * Agenda funciona INTEIRO: some o botão "Conectar Outlook" e a tela explica o
 * que falta. É o estado real de um primeiro deploy self-host.
 *
 * `configuracaoDoMicrosoft()` devolve `null` em vez de lançar. Quem chama
 * decide: a tela mostra o cartão de "não configurado", a rota responde
 * `outlook_nao_configurado`.
 *
 * A Microsoft compara o `redirect_uri` do consentimento com o da troca do código
 * **byte a byte**. Existe **um** `enderecoDeRetorno()`, e os dois lados usam ele.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

/** O caminho da rota de callback. Tem de estar registrado no Azure Portal. */
export const CAMINHO_DO_CALLBACK = "/api/v1/agenda/microsoft/callback";

/** Os nomes das variáveis, para a tela poder dizer exatamente o que falta. */
export const VARIAVEIS_DO_MICROSOFT = [
  "MICROSOFT_GRAPH_CLIENT_ID",
  "MICROSOFT_GRAPH_CLIENT_SECRET",
] as const;

export interface AppDoMicrosoftConfigurado {
  clientId: string;
  clientSecret: string;
  /** Absoluto, e idêntico nos dois lados do fluxo. */
  redirectUri: string;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * O endereço de retorno, derivado da URL pública da instalação.
 *
 * Sem barra dupla e sem barra final: a Microsoft compara a string exata.
 */
export function enderecoDeRetorno(urlDaAplicacao: string = env.NEXT_PUBLIC_APP_URL): string {
  const base = texto(urlDaAplicacao).replace(/\/+$/, "");
  return `${base}${CAMINHO_DO_CALLBACK}`;
}

/**
 * O que o AMBIENTE traz — puro, síncrono, sem banco.
 *
 * Continua existindo separado de propósito. Ele é o PISO DE ROLLBACK: o
 * `agent.sh` do kit, em falha de update, reverte só a IMAGEM — não o schema.
 * Código antigo não conhece `platform_microsoft_oauth`. Com o `.env` intacto, a
 * conexão do Outlook degrada em vez de sumir no pior momento possível.
 */
export function configuracaoDoAmbiente(): AppDoMicrosoftConfigurado | null {
  const clientId = texto(env.MICROSOFT_GRAPH_CLIENT_ID);
  const clientSecret = texto(env.MICROSOFT_GRAPH_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: enderecoDeRetorno() };
}

const TTL_MS = 30_000;

declare global {
  var __memoDoAppDoMicrosoft: { readonly valor: LinhaDoApp | null; readonly expiraEm: number } | null | undefined;
}

interface LinhaDoApp {
  client_id: string | null;
  client_secret_encrypted: string | null;
}

/** Chamada por quem ESCREVE a credencial — a server action do /admin. */
export function invalidarCredencialDoMicrosoft(): void {
  globalThis.__memoDoAppDoMicrosoft = null;
}

async function linhaDoBanco(): Promise<LinhaDoApp | null> {
  const memo = globalThis.__memoDoAppDoMicrosoft;
  if (memo && memo.expiraEm > Date.now()) return memo.valor;

  let valor: LinhaDoApp | null = null;
  try {
    const { data, error } = await createAdminClient()
      .from("platform_microsoft_oauth")
      .select("client_id, client_secret_encrypted")
      .eq("id", 1)
      .maybeSingle();
    // Clone que ainda não aplicou a 0204 devolve 42P01 aqui. Isso NÃO é erro
    // desta instalação — é o piso de rollback funcionando, e o `.env` assume.
    if (error) {
      logger.info("[agenda.microsoft.config] sem credencial no banco; vale o .env", {
        codigo: error.code,
      });
    } else {
      valor = (data as LinhaDoApp | null) ?? null;
    }
  } catch (err) {
    // NUNCA LANÇA: esta função é chamada no render da Agenda, e um throw aqui é
    // 500 na tela inteira. Mesma disciplina do resolvedor de marca.
    logger.warn("[agenda.microsoft.config] leitura falhou; vale o .env", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  globalThis.__memoDoAppDoMicrosoft = { valor, expiraEm: Date.now() + TTL_MS };
  return valor;
}

/**
 * A configuração em vigor, ou `null` quando a instalação não tem app OAuth.
 *
 * BANCO PRIMEIRO, `.env` COMO FALLBACK. As duas fontes NÃO se misturam: se o
 * segredo do banco não decifrar, cai inteiro para o ambiente.
 *
 * Nunca lança — ver o cabeçalho.
 */
export async function configuracaoDoMicrosoft(): Promise<AppDoMicrosoftConfigurado | null> {
  const linha = await linhaDoBanco();
  const clientId = texto(linha?.client_id);
  const cifrado = texto(linha?.client_secret_encrypted);

  if (clientId && cifrado) {
    const segredo = await decryptWebhookSecret(createAdminClient(), cifrado);
    if (segredo) {
      return { clientId, clientSecret: segredo, redirectUri: enderecoDeRetorno() };
    }
    logger.warn("[agenda.microsoft.config] segredo do banco não decifrou; vale o .env inteiro");
  }

  return configuracaoDoAmbiente();
}

/** Conectar o Outlook está disponível nesta instalação? */
export async function microsoftEstaConfigurado(): Promise<boolean> {
  return (await configuracaoDoMicrosoft()) !== null;
}

/**
 * O que falta, pelo nome — para a tela dizer em vez de só desabilitar o botão.
 *
 * Só devolve algo quando as DUAS fontes estão vazias.
 */
export async function faltaParaConectarOMicrosoft(): Promise<string[]> {
  if (await configuracaoDoMicrosoft()) return [];
  const faltando: string[] = [];
  if (!texto(env.MICROSOFT_GRAPH_CLIENT_ID)) faltando.push("MICROSOFT_GRAPH_CLIENT_ID");
  if (!texto(env.MICROSOFT_GRAPH_CLIENT_SECRET)) faltando.push("MICROSOFT_GRAPH_CLIENT_SECRET");
  return faltando;
}
