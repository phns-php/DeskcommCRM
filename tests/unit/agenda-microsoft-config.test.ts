/**
 * O app OAuth do Microsoft Graph desta instalação — o leitor PURO do ambiente.
 *
 * A resolução com banco tem cerca própria em `agenda-microsoft-credencial-do-banco`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

async function importarComEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  return import("@/lib/agenda/microsoft/config");
}

beforeEach(() => {
  process.env.MICROSOFT_GRAPH_CLIENT_ID = "";
  process.env.MICROSOFT_GRAPH_CLIENT_SECRET = "";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

const COMPLETO = {
  MICROSOFT_GRAPH_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
  MICROSOFT_GRAPH_CLIENT_SECRET: "segredo-azure-de-teste",
  NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
};

describe("configuracaoDoAmbiente", () => {
  it("devolve a configuração quando a instalação tem app OAuth", async () => {
    const { configuracaoDoAmbiente } = await importarComEnv(COMPLETO);
    expect(configuracaoDoAmbiente()).toEqual({
      clientId: "11111111-1111-1111-1111-111111111111",
      clientSecret: "segredo-azure-de-teste",
      redirectUri: "https://crm.exemplo/api/v1/agenda/microsoft/callback",
    });
  });

  it("devolve `null` — e NÃO lança — quando falta chave", async () => {
    const { configuracaoDoAmbiente } = await importarComEnv({
      ...COMPLETO,
      MICROSOFT_GRAPH_CLIENT_SECRET: "",
    });
    expect(() => configuracaoDoAmbiente()).not.toThrow();
    expect(configuracaoDoAmbiente()).toBeNull();
  });

  it("espaço em branco não conta como configurado", async () => {
    const { configuracaoDoAmbiente } = await importarComEnv({
      ...COMPLETO,
      MICROSOFT_GRAPH_CLIENT_ID: "   ",
    });
    expect(configuracaoDoAmbiente()).toBeNull();
  });
});

describe("enderecoDeRetorno", () => {
  it("é UMA fonte só, e o consentimento e a troca do código usam ela", async () => {
    const { enderecoDeRetorno, configuracaoDoAmbiente } = await importarComEnv(COMPLETO);
    expect(configuracaoDoAmbiente()?.redirectUri).toBe(enderecoDeRetorno());
  });

  it("não produz barra dupla nem barra final", async () => {
    const { enderecoDeRetorno } = await importarComEnv(COMPLETO);
    expect(enderecoDeRetorno("https://crm.exemplo/")).toBe(
      "https://crm.exemplo/api/v1/agenda/microsoft/callback",
    );
    expect(enderecoDeRetorno("https://crm.exemplo///")).toBe(
      "https://crm.exemplo/api/v1/agenda/microsoft/callback",
    );
  });
});

describe("faltaParaConectarOMicrosoft", () => {
  it("diz o que falta pelo NOME, em vez de só desabilitar o botão", async () => {
    const { faltaParaConectarOMicrosoft } = await importarComEnv({
      ...COMPLETO,
      MICROSOFT_GRAPH_CLIENT_ID: "",
      MICROSOFT_GRAPH_CLIENT_SECRET: "",
    });
    expect(await faltaParaConectarOMicrosoft()).toEqual([
      "MICROSOFT_GRAPH_CLIENT_ID",
      "MICROSOFT_GRAPH_CLIENT_SECRET",
    ]);
  });

  it("nada falta quando está tudo lá", async () => {
    const { faltaParaConectarOMicrosoft } = await importarComEnv(COMPLETO);
    expect(await faltaParaConectarOMicrosoft()).toEqual([]);
  });
});
