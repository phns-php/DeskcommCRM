import { uuidInformado } from "@/lib/agenda/uuid-informado";
import type { McpContext } from "@/lib/mcp/types";

/**
 * Quem está do outro lado DESTE turno.
 *
 * No WhatsApp o runtime já sabe (`job.contact_id` / `ai_agent_runs.contact_id`).
 * O modelo copiar UUID — ou omitir, ou mandar o lead do funil — foi medido
 * em 2026-09-08: marcou o compromisso e na listagem seguinte ouviu que não
 * estava marcado. O id do turno vence o que o modelo mandar.
 */
export function clienteDoTurno(ctx: McpContext, informado?: string): string | undefined {
  return uuidInformado(ctx.contactId ?? undefined) ?? uuidInformado(informado);
}

/**
 * Preenche `contact_id` nas tools que o aceitam, ANTES do gate de escopo.
 * Sem isto `crm_book_appointment` recusa `contact_id ausente` quando o modelo
 * omite o campo — mesmo com o contato já no contexto do turno.
 */
export function argumentosComClienteDoTurno(
  inputSchema: object,
  ctx: McpContext,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const doTurno = uuidInformado(ctx.contactId ?? undefined);
  if (!doTurno) return args;
  if (!Object.prototype.hasOwnProperty.call(inputSchema, "contact_id")) return args;
  return { ...args, contact_id: doTurno };
}
