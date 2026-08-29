"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { invalidarCredencialDoMicrosoft } from "@/lib/agenda/microsoft/config";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export type UpdateMicrosoftOAuthResult =
  | { ok: true }
  | { ok: false; error: string; details?: unknown };

/**
 * Cadastra o app OAuth do Microsoft Graph DESTA INSTALAÇÃO — sem SSH e sem
 * editar `.env`. Clone de `updateGoogleOAuth.ts`.
 *
 * O gate é `is_platform_admin`, não `admin` do tenant: o objeto é a
 * INSTALAÇÃO. Num revendedor que hospeda várias empresas, deixar o admin de um
 * tenant trocar isso derrubaria a conexão do Outlook de TODOS.
 *
 * Se `fn_encrypt_oauth` não puder cifrar, o save RECUSA. Cair para texto puro
 * seria pior que o defeito original.
 */
const entradaSchema = z.object({
  // Client id do Azure é UUID, mas a tela aceita o valor copiado inteiro.
  client_id: z.string().trim().min(10).max(300),
  client_secret: z.string().trim().min(10).max(300).optional(),
});

export type MicrosoftOAuthInput = z.infer<typeof entradaSchema>;

export async function updateMicrosoftOAuth(
  input: MicrosoftOAuthInput,
): Promise<UpdateMicrosoftOAuthResult> {
  const { user: authUser } = await requirePlatformAdmin();

  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", details: parsed.error.flatten() };
  }

  const admin = createAdminClient();
  const valores: Record<string, unknown> = {
    client_id: parsed.data.client_id,
    updated_by: authUser.id,
  };

  if (parsed.data.client_secret) {
    const cifrado = await encryptWebhookSecret(admin, parsed.data.client_secret);
    if (!cifrado) {
      return {
        ok: false,
        error:
          "cifra indisponível nesta instalação (GUC app.nuvemshop_oauth_key ausente) — o segredo não foi gravado",
      };
    }
    valores.client_secret_encrypted = cifrado;
  }

  const { error } = await admin
    .from("platform_microsoft_oauth")
    .upsert({ id: 1, ...valores }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  invalidarCredencialDoMicrosoft();

  const cabecalhos = await headers();
  await audit({
    action: "platform_microsoft_oauth.updated",
    actorUserId: authUser.id,
    resourceType: "platform_microsoft_oauth",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    metadata: {
      campos: Object.keys(valores).filter((k) => k !== "updated_by"),
      segredo_trocado: Boolean(parsed.data.client_secret),
    },
  });

  return { ok: true };
}
