/**
 * De quem é a agenda do Outlook que acabou de ser autorizada.
 *
 * No Graph o e-mail NÃO é o id do calendário: sai de `/me` (`mail` ou, se
 * vazio, `userPrincipalName`). Sem um dos dois a conexão não tem chave única.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contaDaAgendaPrimaria } from "@/lib/agenda/microsoft/conta";

function resposta(corpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as unknown as Response;
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contaDaAgendaPrimaria", () => {
  it("prefere `mail` quando os dois vêm", async () => {
    vi.mocked(fetch).mockResolvedValue(
      resposta({ mail: "ana@clinica.com.br", userPrincipalName: "ana@tenant.onmicrosoft.com" }),
    );
    const r = await contaDaAgendaPrimaria("token");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conta.email).toBe("ana@clinica.com.br");
    expect(r.conta.fuso).toBeNull();
  });

  it("cai no UPN quando a caixa não tem `mail` — contas Azure sem Exchange", async () => {
    vi.mocked(fetch).mockResolvedValue(
      resposta({ mail: null, userPrincipalName: "ana@tenant.onmicrosoft.com" }),
    );
    const r = await contaDaAgendaPrimaria("token");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conta.email).toBe("ana@tenant.onmicrosoft.com");
  });

  it("recusa conta sem e-mail nenhum — gravar string vazia colidiria duas contas", async () => {
    vi.mocked(fetch).mockResolvedValue(resposta({ mail: "", userPrincipalName: "" }));
    const r = await contaDaAgendaPrimaria("token");
    expect(r.ok).toBe(false);
  });

  it("não lança quando a rede falha", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    const r = await contaDaAgendaPrimaria("token");
    expect(r.ok).toBe(false);
  });
});
