/**
 * O consentimento e o token do Microsoft Graph — a parte pura.
 *
 * Sem rede, sem `process.env` e sem relógio próprio: quem chama injeta a
 * configuração do app e o instante.
 *
 * ─── O que NÃO é o Google, e é o ponto deste arquivo ─────────────────────
 *
 * 1. **Não existe `access_type=offline`.** Isso é parâmetro do Google. No
 *    Azure v2 o refresh_token vem do escopo `offline_access`. Mandar
 *    `access_type` seria ruído que a Microsoft ignora — e um teste que o
 *    cobrasse pinaria o clone errado.
 * 2. **`prompt=consent` continua obrigatório.** Sem ele a reconexão volta
 *    sem `refresh_token`, e a conexão funciona por uma hora e morre calada.
 * 3. **`User.Read` entra.** No Google o id do calendário primário É o e-mail.
 *    No Graph o e-mail sai de `/me` (`mail` ou `userPrincipalName`). Sem este
 *    escopo a conexão nasceria sem a chave única de `calendar_connections`.
 *
 * `fundirTokens` e `precisaRenovar` são a mesma armadilha do Google, palavra
 * por palavra: a resposta da renovação não repete o refresh_token; `expires_in`
 * é relativo.
 */

/**
 * Os três escopos do consentimento.
 *
 * `Calendars.ReadWrite` cobre ler, criar e alterar eventos.
 * `offline_access` é o que traz refresh_token (não é parâmetro de query).
 * `User.Read` cobre `/me` — o e-mail da conta.
 *
 * ⚠️ `offline_access` NÃO entra em `escoposFaltando`. A Microsoft costuma não
 * ecoá-lo na resposta do token mesmo quando o `refresh_token` veio. Conferir
 * a lista crua acusaria falta numa conexão boa. Quem prova a renovação é a
 * presença do `refresh_token`, conferida no callback.
 */
export const ESCOPOS_DO_CONSENTIMENTO: readonly string[] = [
  "Calendars.ReadWrite",
  "offline_access",
  "User.Read",
];

/** O que a pessoa NÃO pode desmarcar — conferido DEPOIS de `fundirTokens`. */
export const ESCOPOS_A_CONFERIR: readonly string[] = ["Calendars.ReadWrite", "User.Read"];

export const ENDERECO_DE_CONSENTIMENTO =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const ENDERECO_DE_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export const FOLGA_DE_RENOVACAO_MS = 60_000;

export interface AppDoMicrosoft {
  clientId: string;
  /** Tem de ser byte a byte igual ao registrado no Azure Portal. */
  redirectUri: string;
}

/**
 * A URL para onde mandamos a pessoa autorizar a agenda dela.
 *
 * Lança quando o app não está configurado: sem `client_id` a Microsoft devolve
 * uma página de erro em inglês que não explica nada.
 */
export function montarUrlDeConsentimento(
  app: AppDoMicrosoft,
  opcoes: { state: string; contaSugerida?: string | null },
): string {
  const clientId = app.clientId?.trim();
  const redirectUri = app.redirectUri?.trim();
  if (!clientId) {
    throw new Error("MICROSOFT_GRAPH_CLIENT_ID ausente: não há app OAuth para pedir consentimento");
  }
  if (!redirectUri) {
    throw new Error("redirect_uri ausente: a Microsoft exige o endereço de retorno registrado");
  }
  if (!opcoes.state?.trim()) {
    throw new Error("state ausente: sem ele o retorno da Microsoft não é verificável");
  }

  const parametros = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: ESCOPOS_DO_CONSENTIMENTO.join(" "),
    prompt: "consent",
    state: opcoes.state,
  });

  const conta = opcoes.contaSugerida?.trim();
  if (conta) parametros.set("login_hint", conta);

  return `${ENDERECO_DE_CONSENTIMENTO}?${parametros.toString()}`;
}

export interface TokenDoMicrosoft {
  access_token: string;
  /** `null` quando a resposta não trouxe — ver `fundirTokens`. */
  refresh_token: string | null;
  scope: string[];
  token_type: string;
  /** Instante absoluto, ISO-8601. Nunca o `expires_in` relativo. */
  expira_em: string;
}

export type MotivoDeTokenIlegivel = "resposta_invalida" | "erro_da_microsoft" | "sem_access_token";

export type LeituraDeToken =
  | { ok: true; token: TokenDoMicrosoft }
  | { ok: false; motivo: MotivoDeTokenIlegivel; detalhe: string };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Lê a resposta do endpoint de token (troca do `code` ou renovação).
 *
 * Não lança: a resposta vem da rede, e um `throw` aqui viraria 500 numa rota que
 * precisa redirecionar o navegador com um motivo legível.
 */
export function lerRespostaDeToken(bruto: unknown, opcoes: { agora: Date }): LeituraDeToken {
  if (typeof bruto !== "object" || bruto === null) {
    return { ok: false, motivo: "resposta_invalida", detalhe: `resposta não é objeto: ${typeof bruto}` };
  }
  const r = bruto as Record<string, unknown>;

  const erro = texto(r.error);
  if (erro) {
    const descricao = texto(r.error_description);
    return { ok: false, motivo: "erro_da_microsoft", detalhe: descricao ? `${erro}: ${descricao}` : erro };
  }

  const accessToken = texto(r.access_token);
  if (!accessToken) {
    return { ok: false, motivo: "sem_access_token", detalhe: "resposta sem `access_token`" };
  }

  const expiresInBruto = typeof r.expires_in === "string" ? Number(r.expires_in.trim()) : r.expires_in;
  const expiresIn =
    typeof expiresInBruto === "number" && Number.isFinite(expiresInBruto) ? expiresInBruto : null;
  const expiraEm =
    expiresIn === null
      ? new Date(opcoes.agora.getTime())
      : new Date(opcoes.agora.getTime() + expiresIn * 1000);

  const escopoBruto = texto(r.scope);
  return {
    ok: true,
    token: {
      access_token: accessToken,
      refresh_token: texto(r.refresh_token),
      scope: escopoBruto ? escopoBruto.split(/\s+/).filter(Boolean) : [],
      token_type: texto(r.token_type) ?? "Bearer",
      expira_em: expiraEm.toISOString(),
    },
  };
}

/**
 * Escreve o token novo por cima do velho SEM perder o `refresh_token`.
 *
 * A resposta da renovação não repete o refresh_token — e não repete o `scope`
 * em algumas respostas. Substituir o objeto inteiro apaga os dois.
 */
export function fundirTokens(
  atual: TokenDoMicrosoft | null | undefined,
  novo: TokenDoMicrosoft,
): TokenDoMicrosoft {
  return {
    access_token: novo.access_token,
    refresh_token: novo.refresh_token ?? atual?.refresh_token ?? null,
    scope: novo.scope.length > 0 ? novo.scope : (atual?.scope ?? []),
    token_type: novo.token_type || atual?.token_type || "Bearer",
    expira_em: novo.expira_em,
  };
}

/**
 * Normaliza o escopo que a Microsoft devolve.
 *
 * Às vezes vem `Calendars.ReadWrite`, às vezes
 * `https://graph.microsoft.com/Calendars.ReadWrite`. Comparar a string crua
 * acusaria falta do que está concedido.
 */
function normalizarEscopo(s: string): string {
  const t = s.trim();
  const barra = t.lastIndexOf("/");
  return barra >= 0 ? t.slice(barra + 1) : t;
}

/**
 * Quais escopos obrigatórios a pessoa NÃO concedeu.
 *
 * ⚠️ **ORDEM OBRIGATÓRIA: confira DEPOIS de `fundirTokens`, nunca antes.** A
 * resposta de uma RENOVAÇÃO costuma vir sem `scope`.
 */
export function escoposFaltando(concedidos: string[] | string | null | undefined): string[] {
  const lista =
    typeof concedidos === "string"
      ? concedidos.split(/\s+/).filter(Boolean)
      : Array.isArray(concedidos)
        ? concedidos.filter((s): s is string => typeof s === "string")
        : [];
  const tem = new Set(lista.map((s) => normalizarEscopo(s)));
  return ESCOPOS_A_CONFERIR.filter((necessario) => !tem.has(necessario));
}

export function precisaRenovar(
  expiraEm: string | Date | null | undefined,
  agora: Date,
  folgaMs: number = FOLGA_DE_RENOVACAO_MS,
): boolean {
  if (expiraEm === null || expiraEm === undefined || expiraEm === "") return true;
  const vencimento = expiraEm instanceof Date ? expiraEm : new Date(expiraEm);
  const t = vencimento.getTime();
  if (Number.isNaN(t)) return true;
  return t - agora.getTime() <= folgaMs;
}
