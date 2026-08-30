/**
 * GET/PATCH da preferência "espelhar agenda externa" da organização.
 *
 * Gate agent+: quem usa a Agenda configura. Escrita via admin client — mesma
 * razão de `/settings/routing` (policy de `organizations` só deixa platform admin).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  lerConfigDaAgendaExterna,
  mesclarConfigDaAgendaExterna,
} from "@/lib/agenda/config-externa";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchShape = z.object({
  external_sync_enabled: z.boolean(),
});

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(lerConfigDaAgendaExterna(data?.settings as Record<string, unknown> | null), {
    requestId,
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!authz.ok) return authz.response;

  let body: z.infer<typeof patchShape>;
  try {
    body = patchShape.parse(await req.json());
  } catch {
    return fail("validation_failed", "payload inválido", 422, { requestId });
  }

  const admin = createAdminClient();
  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });

  const nextSettings = mesclarConfigDaAgendaExterna(
    orgRow?.settings as Record<string, unknown> | null,
    { external_sync_enabled: body.external_sync_enabled },
  );

  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", authz.org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  void audit({
    action: "agenda.external_sync_configurada",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { external_sync_enabled: body.external_sync_enabled },
  });

  return ok(lerConfigDaAgendaExterna(nextSettings), { requestId });
}
