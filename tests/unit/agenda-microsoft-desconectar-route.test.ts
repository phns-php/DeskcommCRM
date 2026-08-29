/**
 * DESCONECTAR A AGENDA DO OUTLOOK — e o que o `status` sozinho NÃO resolve.
 *
 * `lib/agenda/consulta.ts` lê a ocupação filtrando só por `user_id`. Uma
 * conexão `disconnected` continuaria bloqueando horário para sempre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CONEXAO = "33333333-3333-4333-8333-333333333333";

let apagadas: string[] = [];
let atualizacao: Record<string, unknown> | null = null;
let conexoes: Array<{ id: string; account_email: string }> = [];

function pedido(corpo?: unknown): NextRequest {
  return new NextRequest("https://crm.exemplo/api/v1/agenda/microsoft/desconectar", {
    method: "DELETE",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apagadas = [];
  atualizacao = null;
  conexoes = [{ id: CONEXAO, account_email: "ana@clinica.com.br" }];
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ANA } as never,
    org: { orgId: ORG } as never,
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => ({
      select: () => {
        const cadeia = {
          eq: () => cadeia,
          then: (r: (v: unknown) => unknown) => r({ data: conexoes, error: null }),
        };
        return cadeia;
      },
      delete: () => {
        apagadas.push(tabela);
        const cadeia = {
          eq: () => cadeia,
          in: () => cadeia,
          then: (r: (v: unknown) => unknown) => r({ error: null }),
        };
        return cadeia;
      },
      update: (linha: Record<string, unknown>) => {
        atualizacao = linha;
        const cadeia = {
          eq: () => cadeia,
          in: () => cadeia,
          then: (r: (v: unknown) => unknown) => r({ error: null }),
        };
        return cadeia;
      },
    }),
  } as never);
});

describe("DELETE /api/v1/agenda/microsoft/desconectar", () => {
  it("apaga os EVENTOS EXTERNOS — é o que o `status` sozinho não resolve", async () => {
    const { DELETE } = await import("@/app/api/v1/agenda/microsoft/desconectar/route");
    const r = await DELETE(pedido());
    expect(r.status).toBe(200);
    expect(apagadas).toContain("calendar_external_events");
  });

  it("apaga os CALENDÁRIOS", async () => {
    const { DELETE } = await import("@/app/api/v1/agenda/microsoft/desconectar/route");
    await DELETE(pedido());
    expect(apagadas).toContain("calendar_connection_calendars");
  });

  it("apaga o REFRESH TOKEN, não só marca o status", async () => {
    const { DELETE } = await import("@/app/api/v1/agenda/microsoft/desconectar/route");
    await DELETE(pedido());
    expect(atualizacao?.oauth_refresh_token_encrypted).toBeNull();
    expect(atualizacao?.status).toBe("disconnected");
  });

  it("não diz que desconectou o que não existe", async () => {
    conexoes = [];
    const { DELETE } = await import("@/app/api/v1/agenda/microsoft/desconectar/route");
    const r = await DELETE(pedido());
    expect(r.status).toBe(404);
    expect(apagadas).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("desconectar a agenda de OUTRA pessoa exige `manager`", async () => {
    const { DELETE } = await import("@/app/api/v1/agenda/microsoft/desconectar/route");
    vi.mocked(requireRole)
      .mockResolvedValueOnce({ ok: true, user: { id: ANA } as never, org: { orgId: ORG } as never })
      .mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) as never });
    const r = await DELETE(pedido({ user_id: "44444444-4444-4444-8444-444444444444" }));
    expect(r.status).toBe(403);
    expect(apagadas).toEqual([]);
  });
});
