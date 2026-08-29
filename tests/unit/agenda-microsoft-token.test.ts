/**
 * As duas chamadas de rede do OAuth do Graph, e o que elas não podem fazer:
 * lançar, descartar o corpo em erro, fundir ou gravar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trocarCodigoPorToken, renovarToken } from "@/lib/agenda/microsoft/token";
import { fundirTokens } from "@/lib/agenda/microsoft/oauth";
import type { AppDoMicrosoftConfigurado } from "@/lib/agenda/microsoft/config";

const APP: AppDoMicrosoftConfigurado = {
  clientId: "11111111-1111-1111-1111-111111111111",
  clientSecret: "segredo-azure-de-teste",
  redirectUri: "https://crm.exemplo/api/v1/agenda/microsoft/callback",
};
const AGORA = new Date("2026-08-26T12:00:00.000Z");

function resposta(corpo: unknown, status = 200): Response {
  return { status, json: async () => corpo } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trocarCodigoPorToken", () => {
  it("manda o MESMO redirect_uri do consentimento", async () => {
    vi.mocked(fetch).mockResolvedValue(
      resposta({ access_token: "EwB.x", expires_in: 3599, refresh_token: "0.r", token_type: "Bearer" }),
    );
    const r = await trocarCodigoPorToken(APP, "o-codigo", { agora: AGORA });
    expect(r.ok).toBe(true);
    const corpo = new URLSearchParams(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(corpo.get("redirect_uri")).toBe(APP.redirectUri);
    expect(corpo.get("grant_type")).toBe("authorization_code");
    expect(corpo.get("scope")).toContain("Calendars.ReadWrite");
    expect(corpo.get("scope")).toContain("offline_access");
    expect(corpo.get("scope")).toContain("User.Read");
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
  });

  it("não lança quando a rede falha", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    const r = await trocarCodigoPorToken(APP, "c", { agora: AGORA });
    expect(r.ok).toBe(false);
  });
});

describe("renovarToken", () => {
  it("não funde — quem chama passa por fundirTokens antes de gravar", async () => {
    vi.mocked(fetch).mockResolvedValue(
      resposta({ access_token: "EwB.novo", expires_in: 3600, token_type: "Bearer" }),
    );
    const r = await renovarToken(APP, "0.refresh", { agora: AGORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token.refresh_token).toBeNull();
    const fundido = fundirTokens(
      {
        access_token: "EwB.velho",
        refresh_token: "0.refresh",
        scope: ["Calendars.ReadWrite"],
        token_type: "Bearer",
        expira_em: "2026-08-26T12:00:00.000Z",
      },
      r.token,
    );
    expect(fundido.refresh_token).toBe("0.refresh");
  });
});
