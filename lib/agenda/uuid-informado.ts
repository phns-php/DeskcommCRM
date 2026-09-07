/**
 * UUID que o modelo mandou de verdade — não o placeholder que ele inventa
 * quando o schema marca o campo como opcional.
 *
 * Medido em produção (2026-09-07): `crm_list_appointments` veio com
 * `lead_id` e `owner_user_id` = `00000000-0000-0000-0000-000000000000`.
 * O zero é UUID válido, então o Zod aceita; a listagem trata como recorte
 * real, não acha vínculo e devolve lista vazia — com o compromisso do
 * cliente no banco. Remarcar vira handoff.
 */

export const UUID_NULO = "00000000-0000-0000-0000-000000000000";

export function uuidInformado(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "" || s === UUID_NULO) return undefined;
  return s;
}
