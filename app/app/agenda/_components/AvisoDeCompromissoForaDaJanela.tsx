"use client";

import { addDays, format, startOfDay } from "date-fns";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useAgendamentos } from "@/hooks/agenda/useAgendamentos";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";

/**
 * A grade desenha UMA semana (ou um dia/mês). O agente marca o primeiro horário
 * livre nos próximos 14 dias — muitas vezes na semana seguinte. Sem este aviso,
 * a pessoa abre a Agenda, não vê o card e conclui que "o agente não marcou".
 */
export function AvisoDeCompromissoForaDaJanela({
  recorte,
  onIrPara,
}: {
  recorte: { de: string; ate: string };
  onIrPara: (instanteISO: string) => void;
}) {
  const t = useT();
  const localeDaData = useLocaleDeData();

  // Olha o que vem DEPOIS da janela desenhada — não o passado.
  const horizonte = React.useMemo(() => {
    const fimDaJanela = new Date(recorte.ate);
    return {
      de: fimDaJanela.toISOString(),
      ate: addDays(fimDaJanela, 45).toISOString(),
    };
  }, [recorte.ate]);

  const { data } = useAgendamentos(horizonte);
  const proximo = data?.find((a) => a.situacao !== "cancelled") ?? null;

  if (!proximo) return null;

  const quando = format(startOfDay(new Date(proximo.comeca)), t("EEEE, d 'de' MMMM"), {
    locale: localeDaData,
  });

  return (
    <div
      data-testid="aviso-compromisso-fora-da-janela"
      className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0 text-sm text-text">
        <span className="font-medium">{t("Há compromisso fora desta visão")}</span>
        <span className="text-text-muted">
          {" — "}
          {proximo.titulo}
          {proximo.quemSeraAtendido ? ` (${proximo.quemSeraAtendido})` : ""}
          {", "}
          {quando}
          {proximo.origem === "mcp" ? ` · ${t("marcado pela IA")}` : ""}
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="ir-para-compromisso-fora"
        className="shrink-0"
        onClick={() => onIrPara(proximo.comeca)}
      >
        {t("Ir para a data")}
      </Button>
    </div>
  );
}
