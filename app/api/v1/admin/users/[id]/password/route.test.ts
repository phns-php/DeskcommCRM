import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/v1/admin/users/[id]/password — o platform admin redefine a senha.
 *
 * O que estes casos prendem: a senha chega ao GoTrue e some de todo o resto
 * (corpo, audit, detalhe de erro). Um vazamento aqui é pior que a feature
 * não existir.
 */

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "ce2fa2b3-1bba-4f6b-b6f4-02001b851433";
const SENHA = "segredo-super-123";

function pedido(id: string, corpo: unknown) {
  return new NextRequest(`http://localhost/api/v1/admin/users/${id}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function stubAuth(cfg: {
  user?: { id: string; email: string | null } | null;
  getError?: { message: string } | null;
  updateError?: { message: string; code?: string } | null;
}) {
  const getUserById = vi.fn(async () => ({
    data: cfg.user ? { user: cfg.user } : { user: null },
    error: cfg.getError ?? null,
  }));
  const updateUserById = vi.fn(async () => ({
    data: { user: cfg.user },
    error: cfg.updateError ?? null,
  }));
  return {
    stub: { auth: { admin: { getUserById, updateUserById } } },
    getUserById,
    updateUserById,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: true },
  } as never);
});

describe("POST /api/v1/admin/users/[id]/password", () => {
  it("recusa quem não é platform admin", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error("forbidden"));
    const { POST } = await import("./route");
    const res = await POST(pedido(USER_ID, { password: SENHA }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("senha curta devolve 422 sem ecoar o valor", async () => {
    const { POST } = await import("./route");
    const curta = "abc";
    const res = await POST(pedido(USER_ID, { password: curta }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(422);
    const texto = JSON.stringify(await res.json());
    expect(texto).not.toContain(curta);
  });

  it("usuário inexistente devolve 404", async () => {
    const { stub } = stubAuth({ user: null, getError: { message: "not found" } });
    vi.mocked(createAdminClient).mockReturnValue(stub as never);
    const { POST } = await import("./route");
    const res = await POST(pedido(USER_ID, { password: SENHA }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("grava no GoTrue e audita sem a senha", async () => {
    const { stub, updateUserById } = stubAuth({
      user: { id: USER_ID, email: "ana@example.com" },
    });
    vi.mocked(createAdminClient).mockReturnValue(stub as never);
    const { POST } = await import("./route");
    const res = await POST(pedido(USER_ID, { password: SENHA }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(USER_ID, { password: SENHA });

    const corpo = JSON.stringify(await res.json());
    expect(corpo).not.toContain(SENHA);
    expect(JSON.parse(corpo)).toEqual({ data: { updated: true } });

    expect(audit).toHaveBeenCalledOnce();
    const entrada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(entrada?.action).toBe("platform_admin.user_password_updated");
    expect(entrada?.resourceId).toBe(USER_ID);
    expect(JSON.stringify(entrada)).not.toContain(SENHA);
    expect(JSON.stringify(entrada)).not.toContain("ana@example.com");
  });

  it("falha do GoTrue não devolve a senha", async () => {
    const { stub } = stubAuth({
      user: { id: USER_ID, email: "ana@example.com" },
      updateError: { message: `weak password near ${SENHA}`, code: "weak_password" },
    });
    vi.mocked(createAdminClient).mockReturnValue(stub as never);
    const { POST } = await import("./route");
    const res = await POST(pedido(USER_ID, { password: SENHA }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    expect(res.status).toBe(500);
    const texto = JSON.stringify(await res.json());
    expect(texto).not.toContain(SENHA);
  });
});
