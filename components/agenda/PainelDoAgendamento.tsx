"use client";

import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";

import { ResumoDoAgendamento } from "./ResumoDoAgendamento";
import type { Agendamento } from "./tipos";

/**
 * O clique no card — ver, não editar o horário.
 *
 * Remarcar e cancelar já existiam no histórico; o card era mudo. Quem atende
 * clica no bloco para lembrar quem vem e do que se trata, e daqui segue para
 * remarcar ou cancelar sem voltar à lista.
 */
export function PainelDoAgendamento({
  agendamento,
  onRemarcar,
  onCancelar,
}: {
  agendamento: Agendamento;
  onRemarcar?: (id: string) => void;
  onCancelar?: (id: string) => void;
}) {
  const t = useT();
  const vivo =
    agendamento.situacao !== "cancelled" &&
    agendamento.situacao !== "completed" &&
    agendamento.situacao !== "no_show";

  return (
    <div className="mt-4 space-y-4" data-testid="painel-do-agendamento">
      <ResumoDoAgendamento agendamento={agendamento} />
      {vivo && (onRemarcar || onCancelar) ? (
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          {onCancelar ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="cancelar-pelo-detalhe"
              onClick={() => onCancelar(agendamento.id)}
            >
              {t("Cancelar")}
            </Button>
          ) : null}
          {onRemarcar ? (
            <Button
              size="sm"
              data-testid="remarcar-pelo-detalhe"
              onClick={() => onRemarcar(agendamento.id)}
            >
              {t("Remarcar")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
