/**
 * Quem é o dono da agenda que acabou de ser autorizada.
 *
 * No Google o id do calendário primário É o e-mail. No Graph o e-mail sai de
 * `GET /me`: `mail` (caixa) ou, se vier vazio — contas Azure AD sem Exchange
 * licenciado —, `userPrincipalName`. Sem um dos dois não há como gravar a
 * conexão: `account_email` faz parte da chave única.
 *
 * O fuso do calendário Graph não vem nesta chamada de propósito: exigiria
 * `MailboxSettings.Read`, mais uma linha na tela de consentimento. O sync
 * (recorte seguinte) lê o fuso do próprio calendário. Aqui `fuso` fica `null`
 * e quem lê trata ausência como "não sei".
 *
 * Não lança: devolve uma leitura. Quem chama transforma em redirect com motivo.
 */

const ENDERECO_DA_CONTA = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
const PRAZO_MS = 10_000;

export interface ContaDaAgenda {
  email: string;
  /** IANA ou Windows TZ, quando o sync trouxer. Nesta chamada, sempre `null`. */
  fuso: string | null;
}

export type LeituraDaConta =
  | { ok: true; conta: ContaDaAgenda }
  | { ok: false; erro: unknown; detalhe: string };

export async function contaDaAgendaPrimaria(accessToken: string): Promise<LeituraDaConta> {
  let resposta: Response;
  try {
    resposta = await fetch(ENDERECO_DA_CONTA, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    return { ok: false, erro, detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  let bruto: unknown;
  try {
    bruto = await resposta.json();
  } catch {
    return {
      ok: false,
      erro: { status: resposta.status },
      detalhe: `HTTP ${resposta.status} com corpo ilegível`,
    };
  }

  if (!resposta.ok) {
    return { ok: false, erro: bruto, detalhe: `HTTP ${resposta.status}` };
  }

  const corpo = typeof bruto === "object" && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const mail = typeof corpo.mail === "string" ? corpo.mail.trim() : "";
  const upn = typeof corpo.userPrincipalName === "string" ? corpo.userPrincipalName.trim() : "";
  const email = mail || upn;
  if (!email) {
    return { ok: false, erro: bruto, detalhe: "conta Graph sem `mail` nem `userPrincipalName`" };
  }

  return { ok: true, conta: { email, fuso: null } };
}
