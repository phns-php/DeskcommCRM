/**
 * Knob da organização: sincronizar (espelhar) agendas externas ou só CRM.
 *
 * Mora em `organizations.settings.agenda.external_sync_enabled`.
 * Ausente = true — instalação que já conectou Google não perde o push em
 * silêncio ao atualizar.
 */

export type ConfigDaAgendaExterna = {
  /** true = CRM espelha Google/Outlook/CalDAV (push + ocupação). false = só CRM. */
  external_sync_enabled: boolean;
};

export const CONFIG_AGENDA_EXTERNA_PADRAO: ConfigDaAgendaExterna = {
  external_sync_enabled: true,
};

export function lerConfigDaAgendaExterna(
  settings: Record<string, unknown> | null | undefined,
): ConfigDaAgendaExterna {
  const bloco =
    settings && typeof settings.agenda === "object" && settings.agenda !== null
      ? (settings.agenda as Record<string, unknown>)
      : {};
  if (typeof bloco.external_sync_enabled === "boolean") {
    return { external_sync_enabled: bloco.external_sync_enabled };
  }
  return { ...CONFIG_AGENDA_EXTERNA_PADRAO };
}

/** Merge não-destrutivo de `settings.agenda`. */
export function mesclarConfigDaAgendaExterna(
  settings: Record<string, unknown> | null | undefined,
  patch: Partial<ConfigDaAgendaExterna>,
): Record<string, unknown> {
  const atual = (settings ?? {}) as Record<string, unknown>;
  const agendaAtual =
    typeof atual.agenda === "object" && atual.agenda !== null
      ? (atual.agenda as Record<string, unknown>)
      : {};
  return {
    ...atual,
    agenda: {
      ...agendaAtual,
      ...patch,
    },
  };
}
