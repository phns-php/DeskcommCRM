/**
 * A volta do consentimento do Outlook.
 *
 * Nenhum desfecho pode ser JSON nem 500. A pessoa clicando "Cancelar" não é
 * falha. O vínculo é conferido ANTES da queima do nonce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { emitirEstado } from "@/lib/agenda/google/estado";
import { assinarVinculo, NOME_DO_VINCULO } from "@/lib/agenda/google/vinculo";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "\\xdeadbeef") }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const SEGREDO = "um-segredo-de-instalacao-bem-comprido";

process.env.INTERNAL_SECRET = SEGREDO;
process.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo";
process.env.MICROSOFT_GRAPH_CLIENT_ID = "11111111-1111-1111-1111-111111111111";
process.env.MICROSOFT_GRAPH_CLIENT_SECRET = "segredo-azure-de-teste";

const ESCOPOS = "Calendars.ReadWrite User.Read offline_access";

let ultimoNonce = "";

function estadoValido(): string {
  ultimoNonce = `nonce-de-teste-${noncesGravados.length}-${Math.random().toString(36).slice(2)}`;
  return emitirEstado(
    { organizationId: ORG, userId: ANA },
    { segredo: SEGREDO, agora: new Date(), nonce: ultimoNonce },
  );
}

function pedido(
  query: Record<string, string>,
  vinculo: "casa" | "ausente" | "de-outro" = "casa",
): NextRequest {
  const u = new URL("https://crm.exemplo/api/v1/agenda/microsoft/callback");
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const req = new NextRequest(u);
  if (vinculo === "casa" && ultimoNonce) {
    req.cookies.set(NOME_DO_VINCULO, assinarVinculo(ultimoNonce, SEGREDO));
  } else if (vinculo === "de-outro") {
    req.cookies.set(NOME_DO_VINCULO, assinarVinculo("nonce-de-outra-pessoa", SEGREDO));
  }
  return req;
}

let upsertRecebido: Record<string, unknown> | null = null;
let calendarioRecebido: Record<string, unknown> | null = null;
let linhaExistente: Record<string, unknown> | null = null;
let erroDoNonce: { code: string; message: string } | null = null;
let noncesGravados: string[] = [];
let opcoesDoUpsert: Record<string, unknown> | null = null;
let erroDoUpsert: { message: string } | null = null;

function respostaHttp(corpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as unknown as Response;
}

function microsoftRespondendoBem() {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      respostaHttp({
        access_token: "EwB.novo",
        refresh_token: "0.r",
        expires_in: 3599,
        scope: ESCOPOS,
        token_type: "Bearer",
      }),
    )
    .mockResolvedValueOnce(
      respostaHttp({ mail: "ana@clinica.com.br", userPrincipalName: "ana@clinica.com.br" }),
    );
}

beforeEach(() => {
  upsertRecebido = null;
  calendarioRecebido = null;
  opcoesDoUpsert = null;
  linhaExistente = null;
  erroDoNonce = null;
  noncesGravados = [];
  erroDoUpsert = null;
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(encryptWebhookSecret).mockResolvedValue("\\xdeadbeef");
  vi.mocked(audit).mockClear();
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        noncesGravados.push(String(linha.nonce));
        return { error: erroDoNonce };
      },
      select: () => {
        const cadeia = {
          eq: () => cadeia,
          maybeSingle: async () => ({ data: linhaExistente }),
        };
        return cadeia;
      },
      upsert: (linha: Record<string, unknown>, opcoes?: Record<string, unknown>) => {
        if (tabela === "calendar_connection_calendars") {
          calendarioRecebido = linha;
          return Promise.resolve({ error: null });
        }
        upsertRecebido = linha;
        opcoesDoUpsert = opcoes ?? null;
        const resultado = { data: erroDoUpsert ? null : { id: "conexao-1" }, error: erroDoUpsert };
        return {
          select: () => ({ single: () => Promise.resolve(resultado) }),
          then: (r: (v: unknown) => void) => r(resultado),
        };
      },
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function chamar(
  query: Record<string, string>,
  vinculo: "casa" | "ausente" | "de-outro" = "casa",
) {
  const { GET } = await import("@/app/api/v1/agenda/microsoft/callback/route");
  return GET(pedido(query, vinculo));
}

async function destino(res: Response): Promise<string> {
  const corpo = await res.clone().text();
  const m = /location\.replace\((["'])(.*?)\1\)/.exec(corpo);
  return m?.[2] ?? res.headers.get("location") ?? "";
}

describe("GET /api/v1/agenda/microsoft/callback", () => {
  it("grava a conexão e volta dizendo que conectou o Outlook", async () => {
    microsoftRespondendoBem();
    const res = await chamar({ code: "o-codigo", state: estadoValido() });

    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?ok=agenda_outlook_conectada");
    expect(upsertRecebido).toMatchObject({
      organization_id: ORG,
      user_id: ANA,
      provider: "microsoft_graph",
      account_email: "ana@clinica.com.br",
      status: "healthy",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agenda.microsoft.conexao_concluida" }),
    );
  });

  it("REGISTRA O CALENDÁRIO PRIMÁRIO — sem ele a conexão existe e não sincroniza nada", async () => {
    microsoftRespondendoBem();
    await chamar({ code: "o-codigo", state: estadoValido() });
    expect(calendarioRecebido).toMatchObject({
      external_calendar_id: "ana@clinica.com.br",
      is_primary: true,
    });
  });

  it("quem clicou Cancelar volta sem erro no log — não é falha, é desistência", async () => {
    const res = await chamar({ error: "access_denied", state: estadoValido() });
    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?erro=conexao_cancelada");
    expect(audit).not.toHaveBeenCalled();
  });

  it("state de OUTRO navegador não grava", async () => {
    microsoftRespondendoBem();
    const res = await chamar({ code: "c", state: estadoValido() }, "de-outro");
    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?erro=retorno_nao_verificavel");
    expect(upsertRecebido).toBeNull();
  });

  it("a queima vem ANTES da troca do código — senão o `code` é gasto à toa", async () => {
    erroDoNonce = { code: "23505", message: "duplicate key value" };
    await chamar({ code: "c", state: estadoValido() });
    expect(fetch).not.toHaveBeenCalled();
    expect(noncesGravados).toHaveLength(1);
  });

  it("eco de scope vazio NÃO é permissão incompleta — a Microsoft às vezes omite", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respostaHttp({
          access_token: "EwB.x",
          refresh_token: "0.r",
          expires_in: 3599,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(respostaHttp({ mail: "ana@clinica.com.br" }));
    const res = await chamar({ code: "c", state: estadoValido() });
    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?ok=agenda_outlook_conectada");
    expect(upsertRecebido).not.toBeNull();
  });

  it("escopo desmarcado NÃO vira conexão saudável", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respostaHttp({
        access_token: "EwB.x",
        expires_in: 3599,
        refresh_token: "0.r",
        scope: "User.Read",
        token_type: "Bearer",
      }),
    );
    const res = await chamar({ code: "c", state: estadoValido() });
    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?erro=permissao_incompleta");
    expect(upsertRecebido).toBeNull();
  });

  it("sem chave de renovação e sem uma guardada, RECUSA", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respostaHttp({
          access_token: "EwB.x",
          expires_in: 3599,
          scope: ESCOPOS,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(respostaHttp({ mail: "ana@clinica.com.br" }));
    const res = await chamar({ code: "c", state: estadoValido() });
    expect(await destino(res)).toBe("https://crm.exemplo/app/agenda?erro=sem_token_de_renovacao");
    expect(upsertRecebido).toBeNull();
  });

  it("a chave do upsert separa PESSOAS", async () => {
    microsoftRespondendoBem();
    await chamar({ code: "c", state: estadoValido() });
    const chave = String(opcoesDoUpsert?.onConflict ?? "");
    for (const coluna of ["organization_id", "user_id", "provider", "account_email"]) {
      expect(chave.split(",").map((c) => c.trim())).toContain(coluna);
    }
  });

  it("NENHUM desfecho é JSON e nenhum é 500", async () => {
    const casos: Array<Record<string, string>> = [
      { error: "access_denied", state: estadoValido() },
      { code: "c", state: "lixo" },
      { state: estadoValido() },
    ];
    for (const q of casos) {
      const res = await chamar(q);
      expect(res.status).toBe(200);
      expect(await destino(res)).toContain("/app/agenda?");
    }
  });
});
