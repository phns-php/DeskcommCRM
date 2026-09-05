/**
 * POST /api/v1/admin/users/[id]/password
 *
 * Platform admin redefine a senha de um usuário no GoTrue. A senha nunca
 * volta no corpo, no audit nem no detalhe de erro — só o fato de ter
 * mudado, e quem mudou.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres").max(72),
});

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return Buffer.from(email.toLowerCase()).toString("hex").slice(0, 12) + "...";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id } = await params;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "User id inválido", 400, { requestId });
  }

  let password: string;
  try {
    const raw: unknown = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const first =
        parsed.error.issues[0]?.message ?? "Senha deve ter pelo menos 8 caracteres";
      return fail("validation_failed", first, 422, { requestId });
    }
    password = parsed.data.password;
  } catch {
    return fail("invalid_request", "Invalid request body", 400, { requestId });
  }

  const admin = createAdminClient();

  const { data: authUserData, error: authError } =
    await admin.auth.admin.getUserById(id);

  if (authError || !authUserData?.user) {
    return fail("not_found", "User not found", 404, { requestId });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    password,
  });

  if (updateError) {
    return fail("internal_error", "Não foi possível alterar a senha.", 500, {
      requestId,
      details: { code: updateError.code ?? null },
    });
  }

  void audit({
    action: "platform_admin.user_password_updated",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    resourceType: "user",
    resourceId: id,
    requestId,
    metadata: {
      email_hash: hashEmail(authUserData.user.email),
    },
  });

  return ok({ updated: true }, { requestId });
}
