/**
 * POST /api/v1/agenda/caldav/conectar
 *
 * O que estes casos prendem: a senha NÃO é gravada sem handshake; metadata
 * recusada não chega no upsert; 401 do CalDAV NÃO vira 401 da sessão do CRM
 * (senão o cartão parece logout).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { descobrirCalDav } from "@/lib/agenda/caldav/descobrir";
import { fail } from "@/lib/api/wrappers";
import { PROVEDOR_CALDAV } from "@/lib/agenda/tipos";
import type { AuthUser, ActiveOrg } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "\\xdeadbeef") }));
vi.mock("@/lib/agenda/caldav/descobrir", () => ({ descobrirCalDav: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 8, window_sec: 60 })),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CONEXAO = "33333333-3333-4333-8333-333333333333";

const usuario: AuthUser = {
  id: ANA,
  email: "ana@clinica.com.br",
  full_name: "Ana",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR",
  organizations: [{ organization_id: ORG, organization_name: "Clínica", role: "agent" }],
};
const orgAtiva: ActiveOrg = { orgId: ORG, name: "Clínica", role: "agent" };

let upsertRecebido: Record<string, unknown> | null = null;

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("https://crm.exemplo/api/v1/agenda/caldav/conectar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-1" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertRecebido = null;
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: usuario, org: orgAtiva });
  vi.mocked(encryptWebhookSecret).mockResolvedValue("\\xdeadbeef");
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      if (tabela === "calendar_connections") {
        return {
          upsert: (linha: Record<string, unknown>) => {
            upsertRecebido = linha;
            return {
              select: () => ({
                single: async () => ({ data: { id: CONEXAO }, error: null }),
              }),
            };
          },
        };
      }
      return {
        upsert: async () => ({ error: null }),
      };
    },
  } as never);
});

describe("POST /api/v1/agenda/caldav/conectar", () => {
  it("grava provider CalDAV e a senha CIFRADA — nunca o plaintext", async () => {
    vi.mocked(descobrirCalDav).mockResolvedValue({
      ok: true,
      homeUrl: "https://192.168.1.10:8443/calendars/ana/",
    });
    const { POST } = await import("@/app/api/v1/agenda/caldav/conectar/route");
    const r = await POST(
      pedido({
        home_url: "https://192.168.1.10:8443/dav",
        usuario: "ana",
        senha: "senha-de-aplicativo",
      }),
    );
    expect(r.status).toBe(201);
    expect(upsertRecebido?.provider).toBe(PROVEDOR_CALDAV);
    expect(upsertRecebido?.oauth_access_token_encrypted).toBe("\\xdeadbeef");
    expect(upsertRecebido?.home_url).toBe("https://192.168.1.10:8443/calendars/ana/");
    expect(JSON.stringify(upsertRecebido)).not.toContain("senha-de-aplicativo");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agenda.caldav.conexao_concluida", resourceId: CONEXAO }),
    );
  });

  it("handshake recusado NÃO grava conexão", async () => {
    vi.mocked(descobrirCalDav).mockResolvedValue({ ok: false, motivo: "nao_e_caldav" });
    const { POST } = await import("@/app/api/v1/agenda/caldav/conectar/route");
    const r = await POST(
      pedido({ home_url: "https://192.168.1.10/", usuario: "ana", senha: "x" }),
    );
    expect(r.status).toBe(422);
    expect(upsertRecebido).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agenda.caldav.conexao_falhou" }),
    );
  });

  it("senha errada no CalDAV responde 422 — nunca 401 da sessão", async () => {
    vi.mocked(descobrirCalDav).mockResolvedValue({ ok: false, motivo: "credencial" });
    const { POST } = await import("@/app/api/v1/agenda/caldav/conectar/route");
    const r = await POST(
      pedido({ home_url: "https://192.168.1.10/dav", usuario: "ana", senha: "errada" }),
    );
    expect(r.status).toBe(422);
    expect(upsertRecebido).toBeNull();
  });

  it("URL recusada (metadata) não chega no upsert", async () => {
    vi.mocked(descobrirCalDav).mockResolvedValue({ ok: false, motivo: "url_recusada" });
    const { POST } = await import("@/app/api/v1/agenda/caldav/conectar/route");
    const r = await POST(
      pedido({
        home_url: "http://169.254.169.254/latest/meta-data/",
        usuario: "ana",
        senha: "x",
      }),
    );
    expect(r.status).toBe(422);
    expect(upsertRecebido).toBeNull();
  });

  it("sem papel, o gate canônico responde — não começa handshake", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "sem permissão", 403, { requestId: "req-1" }),
    });
    const { POST } = await import("@/app/api/v1/agenda/caldav/conectar/route");
    const r = await POST(
      pedido({ home_url: "https://192.168.1.10/dav", usuario: "ana", senha: "x" }),
    );
    expect(r.status).toBe(403);
    expect(descobrirCalDav).not.toHaveBeenCalled();
  });
});
