/**
 * A ida do OAuth do Outlook: quem pode conectar, e o que a pessoa vê quando não dá.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: vi.fn(() => true) }));
// Sem isto, `configuracaoDoMicrosoft` lê o banco real (se houver) e o caso
// "sem chave na instalação" fica verde ou vermelho conforme o ambiente, não
// conforme o `.env` que o teste acabou de montar.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

const usuario: AuthUser = {
  id: ANA,
  email: "ana@clinica.com.br",
  full_name: "Ana",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR" as const,
  organizations: [{ organization_id: ORG, organization_name: "Clínica", role: "agent" }],
};
const orgAtiva: ActiveOrg = { orgId: ORG, name: "Clínica", role: "agent" };

function pedido(): NextRequest {
  return new NextRequest("https://crm.exemplo/api/v1/agenda/microsoft/connect", {
    headers: { "x-request-id": "req-1" },
  });
}

async function rotaComEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  return import("@/app/api/v1/agenda/microsoft/connect/route");
}

const CONFIGURADO = {
  MICROSOFT_GRAPH_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
  MICROSOFT_GRAPH_CLIENT_SECRET: "segredo-azure-de-teste",
  NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
  INTERNAL_SECRET: "um-segredo-de-instalacao-bem-comprido",
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: usuario, org: orgAtiva });
  vi.mocked(audit).mockClear();
});

describe("GET /api/v1/agenda/microsoft/connect", () => {
  it("manda para o consentimento da Microsoft com consent + state, SEM access_type", async () => {
    const { GET } = await rotaComEnv(CONFIGURADO);
    const res = await GET(pedido());

    expect(res.status).toBe(307);
    const destino = new URL(res.headers.get("location") ?? "");
    expect(destino.origin + destino.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(destino.searchParams.has("access_type")).toBe(false);
    expect(destino.searchParams.get("prompt")).toBe("consent");
    expect(destino.searchParams.get("state")).toBeTruthy();
    expect(destino.searchParams.get("login_hint")).toBe("ana@clinica.com.br");
    expect(destino.searchParams.get("scope")).toContain("Calendars.ReadWrite");
    expect(destino.searchParams.get("scope")).toContain("offline_access");
    expect(destino.searchParams.get("scope")).toContain("User.Read");
  });

  it("o `state` carrega a PESSOA, não só a organização", async () => {
    const { GET } = await rotaComEnv(CONFIGURADO);
    const res = await GET(pedido());
    const state = new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "";

    const { verificarEstado } = await import("@/lib/agenda/google/estado");
    expect(verificarEstado(state, { segredo: CONFIGURADO.INTERNAL_SECRET, agora: new Date() })).toMatchObject({
      organizationId: ORG,
      userId: ANA,
    });
  });

  it("sem chave na instalação, volta para a Agenda — nunca JSON, nunca 500", async () => {
    const { GET } = await rotaComEnv({ ...CONFIGURADO, MICROSOFT_GRAPH_CLIENT_ID: "" });
    const res = await GET(pedido());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://crm.exemplo/app/agenda?erro=outlook_nao_configurado");
  });

  it("instalação sem chave NÃO enche o audit log", async () => {
    const { GET } = await rotaComEnv({ ...CONFIGURADO, MICROSOFT_GRAPH_CLIENT_SECRET: "" });
    await GET(pedido());
    expect(audit).not.toHaveBeenCalled();
  });

  it("segredo de assinatura curto RECUSA, e a recusa é auditada", async () => {
    const { GET } = await rotaComEnv({ ...CONFIGURADO, INTERNAL_SECRET: "curto" });
    const res = await GET(pedido());
    expect(res.headers.get("location")).toBe("https://crm.exemplo/app/agenda?erro=segredo_indisponivel");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agenda.microsoft.conexao_falhou" }),
    );
  });

  it("quem não tem papel não passa, e a resposta é a do gate — não um redirect", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "sem permissão", 403, { requestId: "req-1" }),
    });
    const { GET } = await rotaComEnv(CONFIGURADO);
    const res = await GET(pedido());
    expect(res.status).toBe(403);
  });

  it("pede `agent`, que é o mesmo piso que a 0177 exige para escrever compromisso", async () => {
    const { GET } = await rotaComEnv(CONFIGURADO);
    await GET(pedido());
    expect(requireRole).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ resource: "calendar_connections" }),
    );
  });
});
