"use client";

import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, Clock } from "@/lib/ui/icons";

/**
 * As PORTAS da Agenda para o que se configura em outro lugar.
 *
 * A Agenda é onde o dia acontece. Tipos de agendamento e jornada de atendimento
 * já têm tela — Configurações e Equipe. O que faltava era o CAMINHO a partir da
 * tela que a pessoa abre de manhã. Ter tela e ser alcançável são propriedades
 * diferentes (doutrina: invariante 6 + item 14 do DoD).
 *
 * ─── Por que SÓ estas duas, e não Outlook/CalDAV ──────────────────────────
 *
 * Botão que não leva a lugar nenhum é controle decorativo, e esta base já pagou
 * por ele (o "Novo agendamento" mudo, o "Ver na agenda" sem onClick). Outlook e
 * CalDAV ainda não têm tela: nasceriam desabilitados "em breve", que é o mesmo
 * defeito com outra roupa. Entram quando o adapter existir, no mesmo cartão das
 * conexões — não aqui.
 */
export const PORTA_TIPOS = "/app/settings/tenant/agenda";
export const PORTA_HORARIOS = "/app/team?aba=atendimento";

export function PortasDaAgenda() {
  const t = useT();
  return (
    <nav
      data-testid="portas-da-agenda"
      aria-label={t("Ajustes da agenda")}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
    >
      <Link
        href={PORTA_TIPOS}
        data-testid="porta-tipos"
        className="inline-flex items-center gap-1.5 text-text-muted underline-offset-2 hover:text-text hover:underline"
      >
        <CalendarBlank size={14} weight="bold" aria-hidden />
        {t("Tipos de agendamento")}
      </Link>
      <Link
        href={PORTA_HORARIOS}
        data-testid="porta-horarios"
        className="inline-flex items-center gap-1.5 text-text-muted underline-offset-2 hover:text-text hover:underline"
      >
        <Clock size={14} weight="bold" aria-hidden />
        {t("Horários de atendimento")}
      </Link>
    </nav>
  );
}
