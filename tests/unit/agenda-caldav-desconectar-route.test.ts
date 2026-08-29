/**
 * DELETE /api/v1/agenda/caldav/desconectar — a senha sai do banco, os
 * bloqueios de horário também. O `status` sozinho não basta: a consulta de
 * ocupação não filtra status no where (mesmo argumento do Google).
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
  return new NextRequest("https://crm.exemplo/api/v1/agenda/caldav/desconectar", {
    method: "DELETE",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apagadas = [];
  atualizacao = null;
  conexoes = [{ id: CONEXAO, account_email: "ana" }];
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

describe("DELETE /api/v1/agenda/caldav/desconectar", () => {
  it("apaga eventos externos e a senha cifrada", async () => {
    const { DELETE } = await import("@/app/api/v1/agenda/caldav/desconectar/route");
    const r = await DELETE(pedido());
    expect(r.status).toBe(200);
    expect(apagadas).toContain("calendar_external_events");
    expect(apagadas).toContain("calendar_connection_calendars");
    expect(atualizacao?.oauth_access_token_encrypted).toBeNull();
    expect(atualizacao?.home_url).toBeNull();
    expect(atualizacao?.status).toBe("disconnected");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agenda.caldav.conexao_desconectada",
        resourceId: CONEXAO,
      }),
    );
  });

  it("não diz que desconectou o que não existe", async () => {
    conexoes = [];
    const { DELETE } = await import("@/app/api/v1/agenda/caldav/desconectar/route");
    const r = await DELETE(pedido());
    expect(r.status).toBe(404);
    expect(apagadas).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });
});
