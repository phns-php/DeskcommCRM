/**
 * Quem é o dono da agenda que acabou de ser autorizada — e em que fuso ela vive.
 *
 * ─── Por que isto existe, e por que são DUAS respostas numa chamada ───────
 *
 * `calendar_connections.account_email` faz parte da chave única
 * (`organization_id, user_id, provider, account_email`): sem ela não há como
 * saber se a pessoa reconectou a MESMA conta ou plugou uma segunda. E o fuso do
 * calendário é o que `doEventoDoGoogle` exige para ler evento de dia inteiro,
 * que chega sem fuso nenhum.
 *
 * As duas saem do calendário primário, numa chamada só. É por isso que não
 * pedimos os escopos `userinfo.email`/`userinfo.profile`: o id do calendário
 * primário É o e-mail da conta, e `calendar.readonly` já cobre. Cada linha a
 * menos na tela de consentimento é uma chance a menos de a pessoa desmarcar algo
 * e a conexão nascer quebrada.
 *
 * ─── Não lança, pelo mesmo motivo do `token.ts` ───────────────────────────
 *
 * Devolve uma leitura. Quem chama transforma em redirect com motivo — este
 * caminho roda dentro do callback do OAuth, que é retorno de navegador.
 *
 * ─── Lista completa ───────────────────────────────────────────────────────
 *
 * `listarCalendariosDaConta` alimenta o seletor da tela (ocupa horário /
 * recebe do CRM). O callback OAuth ainda registra o primário; a lista completa
 * entra no callback e no "Atualizar lista".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const ENDERECO_DO_PRIMARIO = "https://www.googleapis.com/calendar/v3/calendars/primary";
const ENDERECO_DA_LISTA = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const PRAZO_MS = 10_000;

export interface ContaDaAgenda {
  /** O id do calendário primário, que é o e-mail da conta. */
  email: string;
  /** IANA. `doEventoDoGoogle` precisa dele para ler evento de dia inteiro. */
  fuso: string | null;
}

export type LeituraDaConta =
  | { ok: true; conta: ContaDaAgenda }
  /** `erro` é o objeto cru do Google — passe a `classificarErroDoGoogle`. */
  | { ok: false; erro: unknown; detalhe: string };

export async function contaDaAgendaPrimaria(accessToken: string): Promise<LeituraDaConta> {
  let resposta: Response;
  try {
    resposta = await fetch(ENDERECO_DO_PRIMARIO, {
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
    // O corpo cru do Google (`{ error: { code, errors[] } }`) vai inteiro para
    // quem classifica — é a forma que `classificarErroDoGoogle` aprendeu a ler
    // depois de a revisão fria mostrar que ela não lia.
    return { ok: false, erro: bruto, detalhe: `HTTP ${resposta.status}` };
  }

  const corpo = typeof bruto === "object" && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const email = typeof corpo.id === "string" ? corpo.id.trim() : "";
  if (!email) {
    // Sem o e-mail não dá para gravar a conexão: ele é parte da chave única, e
    // gravar com string vazia faria duas contas diferentes colidirem numa só.
    return { ok: false, erro: bruto, detalhe: "calendário primário sem `id`" };
  }

  const fuso = typeof corpo.timeZone === "string" && corpo.timeZone.trim() ? corpo.timeZone.trim() : null;
  return { ok: true, conta: { email, fuso } };
}

export interface CalendarioDaConta {
  externalCalendarId: string;
  name: string;
  isPrimary: boolean;
  timeZone: string | null;
  /** O Google diz se a conta pode escrever neste calendário. */
  podeEscrever: boolean;
}

export type LeituraDaLista =
  | { ok: true; calendarios: CalendarioDaConta[] }
  | { ok: false; erro: unknown; detalhe: string };

/**
 * Todos os calendários da conta — o que a tela precisa para escolher destino e
 * ocupação. Filtra `deleted`/`hidden` porque não há o que configurar neles.
 */
export async function listarCalendariosDaConta(accessToken: string): Promise<LeituraDaLista> {
  let resposta: Response;
  try {
    resposta = await fetch(`${ENDERECO_DA_LISTA}?minAccessRole=reader&maxResults=250`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    return { ok: false, erro, detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  if (!resposta || typeof (resposta as Response).json !== "function") {
    return { ok: false, erro: {}, detalhe: "resposta inválida da lista de calendários" };
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
  const itens = Array.isArray(corpo.items) ? corpo.items : [];
  const calendarios: CalendarioDaConta[] = [];

  for (const item of itens) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (row.deleted === true || row.hidden === true) continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const name =
      typeof row.summary === "string" && row.summary.trim()
        ? row.summary.trim()
        : id;
    const role = typeof row.accessRole === "string" ? row.accessRole : "";
    calendarios.push({
      externalCalendarId: id,
      name,
      isPrimary: row.primary === true,
      timeZone:
        typeof row.timeZone === "string" && row.timeZone.trim() ? row.timeZone.trim() : null,
      podeEscrever: role === "owner" || role === "writer",
    });
  }

  return { ok: true, calendarios };
}

/**
 * Upsert da lista no banco. O primário nasce como destino (`is_destination`) se
 * ainda não houver nenhum — preserva escolha prévia ao "Atualizar lista".
 */
export async function sincronizarCalendariosNoBanco(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    connectionId: string;
    calendarios: CalendarioDaConta[];
  },
): Promise<{ ok: true; gravados: number } | { ok: false; detalhe: string }> {
  const { organizationId, connectionId, calendarios } = params;
  if (calendarios.length === 0) {
    return { ok: false, detalhe: "lista de calendários vazia" };
  }

  const { data: jaTemDestino } = await admin
    .from("calendar_connection_calendars")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("is_destination", true)
    .limit(1);

  const destinoJaEscolhido = (jaTemDestino?.length ?? 0) > 0;
  const primario = calendarios.find((c) => c.isPrimary) ?? calendarios[0]!;

  let gravados = 0;
  for (const cal of calendarios) {
    const eDestino = !destinoJaEscolhido && cal.externalCalendarId === primario.externalCalendarId;
    const { error } = await admin.from("calendar_connection_calendars").upsert(
      {
        organization_id: organizationId,
        connection_id: connectionId,
        external_calendar_id: cal.externalCalendarId,
        name: cal.name,
        is_primary: cal.isPrimary,
        time_zone: cal.timeZone,
        // Só o upsert do primário na primeira sincronização define destino.
        // Nas demais, não tocamos `is_destination`/`counts_for_conflicts` —
        // o onConflict do PostgREST sobrescreve colunas omitidas? Em Supabase
        // upsert SEM ignoreDuplicates atualiza todas as colunas do payload.
        // Por isso só incluímos flags novas quando ainda não há destino.
        ...(destinoJaEscolhido
          ? {}
          : {
              counts_for_conflicts: true,
              is_destination: eDestino,
            }),
      },
      { onConflict: "organization_id,connection_id,external_calendar_id" },
    );
    if (error) return { ok: false, detalhe: error.message };
    gravados += 1;
  }

  return { ok: true, gravados };
}

/**
 * Calendário que recebe o que o CRM marca. Fallback: primário, depois e-mail
 * da conta (comportamento histórico do push).
 */
export async function calendarioDestinoDaConexao(
  admin: SupabaseClient,
  connectionId: string,
  fallbackAccountEmail: string | null,
): Promise<string | null> {
  const { data: destino } = await admin
    .from("calendar_connection_calendars")
    .select("external_calendar_id")
    .eq("connection_id", connectionId)
    .eq("is_destination", true)
    .limit(1)
    .maybeSingle();

  if (destino?.external_calendar_id) return String(destino.external_calendar_id);

  const { data: primario } = await admin
    .from("calendar_connection_calendars")
    .select("external_calendar_id")
    .eq("connection_id", connectionId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (primario?.external_calendar_id) return String(primario.external_calendar_id);

  return fallbackAccountEmail;
}
