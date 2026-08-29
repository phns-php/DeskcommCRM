import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

let linhaDoBanco: { client_id: string | null; client_secret_encrypted: string | null } | null = null;
let erroDaLeitura: { code: string; message: string } | null = null;
let decifrado: string | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: linhaDoBanco, error: erroDaLeitura }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async () => decifrado,
}));

const NO_ENV = {
  MICROSOFT_GRAPH_CLIENT_ID: "do-env-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  MICROSOFT_GRAPH_CLIENT_SECRET: "segredo-do-env",
  NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
};

async function importarComEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  const mod = await import("@/lib/agenda/microsoft/config");
  mod.invalidarCredencialDoMicrosoft();
  return mod;
}

beforeEach(() => {
  linhaDoBanco = null;
  erroDaLeitura = null;
  decifrado = null;
  process.env.MICROSOFT_GRAPH_CLIENT_ID = "";
  process.env.MICROSOFT_GRAPH_CLIENT_SECRET = "";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("configuracaoDoMicrosoft: banco primeiro, .env como piso", () => {
  it("o que está no BANCO vence o que está no .env", async () => {
    linhaDoBanco = {
      client_id: "do-banco-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      client_secret_encrypted: "\\xCIFRADO",
    };
    decifrado = "segredo-do-banco";
    const { configuracaoDoMicrosoft } = await importarComEnv(NO_ENV);
    const app = await configuracaoDoMicrosoft();
    expect(app?.clientId).toBe("do-banco-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(app?.clientSecret).toBe("segredo-do-banco");
  });

  it("sem linha no banco, vale o .env — é o piso de rollback", async () => {
    linhaDoBanco = null;
    const { configuracaoDoMicrosoft } = await importarComEnv(NO_ENV);
    const app = await configuracaoDoMicrosoft();
    expect(app?.clientId).toBe("do-env-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(app?.clientSecret).toBe("segredo-do-env");
  });

  it("tabela inexistente (clone sem a 0204) NÃO derruba a Agenda", async () => {
    erroDaLeitura = { code: "42P01", message: 'relation "platform_microsoft_oauth" does not exist' };
    const { configuracaoDoMicrosoft } = await importarComEnv(NO_ENV);
    const app = await configuracaoDoMicrosoft();
    expect(app?.clientId).toBe("do-env-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("decifra que falha cai para o .env INTEIRO — as fontes não se misturam", async () => {
    linhaDoBanco = {
      client_id: "do-banco-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      client_secret_encrypted: "\\xCORROMPIDO",
    };
    decifrado = null;
    const { configuracaoDoMicrosoft } = await importarComEnv(NO_ENV);
    const app = await configuracaoDoMicrosoft();
    expect(app?.clientId, "misturou o client_id do banco com o segredo do .env").toBe(
      "do-env-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(app?.clientSecret).toBe("segredo-do-env");
  });
});

describe("faltaParaConectarOMicrosoft: só reclama quando as DUAS fontes estão vazias", () => {
  it("com credencial no BANCO, não manda ninguém editar o .env", async () => {
    linhaDoBanco = {
      client_id: "do-banco-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      client_secret_encrypted: "\\xCIFRADO",
    };
    decifrado = "segredo-do-banco";
    const { faltaParaConectarOMicrosoft } = await importarComEnv({
      NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
      MICROSOFT_GRAPH_CLIENT_ID: "",
      MICROSOFT_GRAPH_CLIENT_SECRET: "",
    });
    expect(await faltaParaConectarOMicrosoft()).toEqual([]);
  });
});
