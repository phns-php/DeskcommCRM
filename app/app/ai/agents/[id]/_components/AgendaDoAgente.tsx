"use client";
/**
 * Qual calendário Google ESTE agente usa para marcar / consultar / remarcar / cancelar.
 *
 * Só faz sentido com o espelho externo ligado e Google saudável — senão a
 * seção explica o que falta, em vez de oferecer um select mudo.
 */
import * as React from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import type { CalendarioGoogleDaOrg } from "@/lib/agenda/agenda-do-agente";

const NENHUM = "__none__";

export function AgendaDoAgente({
  calendarios,
  sincronizacaoExterna,
  value,
  onChange,
  disabled = false,
}: {
  calendarios: CalendarioGoogleDaOrg[];
  sincronizacaoExterna: boolean;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const podeEscolher = sincronizacaoExterna && calendarios.length > 0;

  return (
    <Card className="space-y-3 p-4" data-testid="agenda-do-agente">
      <div>
        <h3 className="text-sm font-medium">{t("Agenda Google deste agente")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Marcações, consultas, remarcações e cancelamentos deste agente usam o calendário escolhido. Assim cada profissional pode ter o próprio agente.",
          )}
        </p>
      </div>

      {!sincronizacaoExterna ? (
        <p data-testid="agenda-do-agente-espelho-off" className="text-xs text-muted-foreground">
          {t(
            "A conexão externa está desligada. Ligue em Agenda › Configurar Agenda Externa para o agente usar o Google.",
          )}
        </p>
      ) : calendarios.length === 0 ? (
        <p data-testid="agenda-do-agente-sem-google" className="text-xs text-muted-foreground">
          {t(
            "Nenhum calendário Google conectado. Conecte o Google em Agenda › Configurar Agenda Externa.",
          )}
        </p>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="agenda-google-do-agente">{t("Calendário Google")}</Label>
          <Select
            value={value || NENHUM}
            onValueChange={(v) => onChange(v === NENHUM ? "" : v)}
            disabled={disabled || !podeEscolher}
          >
            <SelectTrigger id="agenda-google-do-agente" data-testid="select-agenda-google-do-agente">
              <SelectValue placeholder={t("Nenhum — usa o responsável do tipo de agendamento")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>
                {t("Nenhum — usa o responsável do tipo de agendamento")}
              </SelectItem>
              {calendarios.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                  {c.conta ? ` · ${c.conta}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </Card>
  );
}
