/**
 * O consentimento e o token do Microsoft Graph.
 *
 * O que estes casos prendem é o que NÃO é o Google:
 *  1. sem `access_type` (isso é parâmetro do Google; no Azure o refresh vem de
 *     `offline_access` no scope);
 *  2. `prompt=consent` — sem ele a reconexão volta sem refresh_token;
 *  3. os três escopos do Graph, inclusive `User.Read` (o e-mail não está no id
 *     do calendário).
 */
import { describe, expect, it } from "vitest";

import {
  ESCOPOS_A_CONFERIR,
  ESCOPOS_DO_CONSENTIMENTO,
  type TokenDoMicrosoft,
  escoposFaltando,
  fundirTokens,
  lerRespostaDeToken,
  montarUrlDeConsentimento,
  precisaRenovar,
} from "@/lib/agenda/microsoft/oauth";

const APP = {
  clientId: "11111111-1111-1111-1111-111111111111",
  redirectUri: "https://crm.exemplo/api/v1/agenda/microsoft/callback",
};
const AGORA = new Date("2026-08-26T12:00:00.000Z");

function token(sobrescreve: Partial<TokenDoMicrosoft> = {}): TokenDoMicrosoft {
  return {
    access_token: "EwB.velho",
    refresh_token: "0.Refresh-original",
    scope: [...ESCOPOS_A_CONFERIR],
    token_type: "Bearer",
    expira_em: "2026-08-26T13:00:00.000Z",
    ...sobrescreve,
  };
}

describe("montarUrlDeConsentimento", () => {
  it("pede consentimento forçado e NÃO manda access_type — isso é do Google", () => {
    const url = new URL(montarUrlDeConsentimento(APP, { state: "abc" }));
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.has("access_type")).toBe(false);
  });

  it("pede os três escopos do Graph, inclusive User.Read", () => {
    const url = new URL(montarUrlDeConsentimento(APP, { state: "abc" }));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...ESCOPOS_DO_CONSENTIMENTO]);
  });

  it("leva o state e o retorno registrado no Azure", () => {
    const url = new URL(montarUrlDeConsentimento(APP, { state: "o-state-assinado" }));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("state")).toBe("o-state-assinado");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(APP.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri);
  });

  it("sugere a conta quando sabemos qual é — cada atendente conecta a dele", () => {
    const url = new URL(
      montarUrlDeConsentimento(APP, { state: "abc", contaSugerida: "ana@clinica.com.br" }),
    );
    expect(url.searchParams.get("login_hint")).toBe("ana@clinica.com.br");
    const sem = new URL(montarUrlDeConsentimento(APP, { state: "abc", contaSugerida: null }));
    expect(sem.searchParams.has("login_hint")).toBe(false);
  });

  it("recusa montar URL quebrada", () => {
    expect(() => montarUrlDeConsentimento({ ...APP, clientId: "" }, { state: "abc" })).toThrow(
      /MICROSOFT_GRAPH_CLIENT_ID/,
    );
    expect(() => montarUrlDeConsentimento({ ...APP, redirectUri: "" }, { state: "abc" })).toThrow(
      /redirect_uri/,
    );
    expect(() => montarUrlDeConsentimento(APP, { state: "  " })).toThrow(/state/);
  });
});

describe("lerRespostaDeToken", () => {
  it("transforma o `expires_in` relativo em instante absoluto", () => {
    const r = lerRespostaDeToken(
      {
        access_token: "EwB.novo",
        expires_in: 3599,
        refresh_token: "0.r",
        scope: ESCOPOS_A_CONFERIR.join(" "),
        token_type: "Bearer",
      },
      { agora: AGORA },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token.expira_em).toBe("2026-08-26T12:59:59.000Z");
    expect(r.token.refresh_token).toBe("0.r");
  });

  it("a renovação vem sem refresh_token, e isso não é erro", () => {
    const r = lerRespostaDeToken({ access_token: "EwB.novo", expires_in: 3600 }, { agora: AGORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token.refresh_token).toBeNull();
  });

  it("recusa com motivo em vez de lançar", () => {
    const erro = lerRespostaDeToken(
      { error: "invalid_grant", error_description: "Token expired" },
      { agora: AGORA },
    );
    expect(erro).toMatchObject({ ok: false, motivo: "erro_da_microsoft" });
  });
});

describe("fundirTokens e escoposFaltando", () => {
  it("a fusão preserva o refresh_token que a renovação não repetiu", () => {
    const novo = lerRespostaDeToken(
      { access_token: "EwB.novo", expires_in: 3600 },
      { agora: AGORA },
    );
    expect(novo.ok).toBe(true);
    if (!novo.ok) return;
    const fundido = fundirTokens(token(), novo.token);
    expect(fundido.refresh_token).toBe("0.Refresh-original");
    expect(fundido.scope).toEqual([...ESCOPOS_A_CONFERIR]);
  });

  it("offline_access ausente na resposta NÃO acusa falta — a Microsoft não o ecoa", () => {
    expect(escoposFaltando(["Calendars.ReadWrite", "User.Read"])).toEqual([]);
  });

  it("aceita o escopo com o prefixo graph.microsoft.com", () => {
    expect(
      escoposFaltando([
        "https://graph.microsoft.com/Calendars.ReadWrite",
        "https://graph.microsoft.com/User.Read",
      ]),
    ).toEqual([]);
  });

  it("User.Read desmarcado aparece como falta", () => {
    expect(escoposFaltando(["Calendars.ReadWrite"])).toEqual(["User.Read"]);
  });

  it("precisaRenovar na borda da folga", () => {
    expect(precisaRenovar("2026-08-26T12:01:00.000Z", AGORA)).toBe(true);
    expect(precisaRenovar("2026-08-26T13:00:00.000Z", AGORA)).toBe(false);
  });
});
