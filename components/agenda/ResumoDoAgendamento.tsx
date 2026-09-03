"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";

import { format } from "date-fns";
import Link from "next/link";

import { phoneForDisplay } from "@/lib/channels/phone-variants";

import type { Agendamento } from "./tipos";

/**
 * O que a equipe precisa ver de um compromisso — no hover e no detalhe.
 *
 * Um só, de propósito: tooltip e Sheet que divergem no primeiro ajuste voltam
 * a mentir um para o outro (a grade dizia uma coisa, o clique abria outra).
 */
export function ResumoDoAgendamento({
  agendamento,
  compacto = false,
}: {
  agendamento: Agendamento;
  compacto?: boolean;
}) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const quando = format(
    new Date(agendamento.comeca),
    t("EEEE, d 'de' MMMM 'às' HH:mm"),
    { locale: localeDaData },
  );
  const telefone = phoneForDisplay(agendamento.contatoTelefone);
  const email = agendamento.contatoEmail?.trim() || "";

  return (
    <div
      data-testid={compacto ? "resumo-do-agendamento" : "detalhe-do-agendamento"}
      className={compacto ? "max-w-[240px] space-y-1 text-left" : "space-y-3"}
    >
      <p className={compacto ? "text-xs font-semibold leading-4" : "text-base font-semibold"}>
        {agendamento.titulo}
      </p>
      {agendamento.origem === "mcp" ? (
        <p className="text-[10px] font-medium uppercase tracking-wide text-accent">{t("IA")}</p>
      ) : null}
      <p className={compacto ? "text-[11px] tabular-nums text-text-muted" : "text-sm text-text-muted"}>
        {quando}
      </p>
      {agendamento.quemSeraAtendido ? (
        compacto || !agendamento.contatoId ? (
          <p className={compacto ? "truncate text-[11px] text-text" : "text-sm"}>
            {agendamento.quemSeraAtendido}
          </p>
        ) : (
          <Link
            href={`/app/contacts/${agendamento.contatoId}`}
            data-testid="abrir-ficha-do-contato"
            className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            {agendamento.quemSeraAtendido}
          </Link>
        )
      ) : null}
      {!compacto && (telefone || email) ? (
        <div className="space-y-0.5 text-sm text-text-muted" data-testid="contato-do-agendamento">
          {telefone ? <p>{telefone}</p> : null}
          {email ? <p>{email}</p> : null}
        </div>
      ) : null}
      {agendamento.descricao ? (
        <p
          className={
            compacto
              ? "line-clamp-4 text-[11px] leading-4 text-text-muted"
              : "whitespace-pre-wrap text-sm leading-5 text-text"
          }
        >
          {agendamento.descricao}
        </p>
      ) : compacto ? null : (
        <p className="text-sm text-text-subtle">{t("Sem descrição")}</p>
      )}
    </div>
  );
}
