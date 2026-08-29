"use client";

import * as React from "react";

import { CartaoDaConexaoCalDav } from "./CartaoDaConexaoCalDav";
import { CartaoDaConexaoGoogle } from "./CartaoDaConexaoGoogle";
import { CartaoDaConexaoMicrosoft } from "./CartaoDaConexaoMicrosoft";

import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, Globe, GoogleLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Provedor = "google" | "outlook" | "caldav";

/**
 * As três conexões da Agenda como botões grandes — o formulário só abre ao clicar.
 *
 * Antes os três cartões vinham empilhados e o CalDAV já nascia com o formulário
 * aberto, ocupando metade da tela. Quem só queria ver a grade via configuração
 * antes do produto. Botão → detalhe é o mesmo gesto das portas da Agenda.
 */
export function PainelDasConexoesDaAgenda({
  googleConfigurado,
  microsoftConfigurado,
  contaConectada,
  contaOutlook,
  contaCalDav,
  enderecoDeRetorno,
  enderecoDeRetornoMicrosoft,
  faltaNoGoogle,
  faltaNoMicrosoft,
  linkDeConfiguracaoDoGoogle,
  linkDeConfiguracaoDoMicrosoft,
}: {
  googleConfigurado: boolean;
  microsoftConfigurado: boolean;
  contaConectada?: string | null;
  contaOutlook?: string | null;
  contaCalDav?: string | null;
  enderecoDeRetorno?: string;
  enderecoDeRetornoMicrosoft?: string;
  faltaNoGoogle: string[];
  faltaNoMicrosoft: string[];
  linkDeConfiguracaoDoGoogle?: string;
  linkDeConfiguracaoDoMicrosoft?: string;
}) {
  const t = useT();
  const [aberto, setAberto] = React.useState<Provedor | null>(null);

  const provedores: Array<{
    id: Provedor;
    rotulo: string;
    icone: React.ReactNode;
    status: string;
    conectado: boolean;
  }> = [
    {
      id: "google",
      rotulo: "Google",
      icone: <GoogleLogo size={20} weight="bold" aria-hidden />,
      status: contaConectada
        ? contaConectada
        : googleConfigurado
          ? t("Conectar")
          : t("Não configurado"),
      conectado: Boolean(contaConectada),
    },
    {
      id: "outlook",
      rotulo: "Outlook",
      icone: <CalendarBlank size={20} weight="bold" aria-hidden />,
      status: contaOutlook
        ? contaOutlook
        : microsoftConfigurado
          ? t("Conectar")
          : t("Não configurado"),
      conectado: Boolean(contaOutlook),
    },
    {
      id: "caldav",
      rotulo: "CalDAV",
      icone: <Globe size={20} weight="bold" aria-hidden />,
      status: contaCalDav ? contaCalDav : t("Conectar"),
      conectado: Boolean(contaCalDav),
    },
  ];

  return (
    <section
      data-testid="painel-conexoes-agenda"
      aria-label={t("Agendas externas")}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {provedores.map((p) => {
          const selecionado = aberto === p.id;
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`botao-provedor-${p.id}`}
              aria-expanded={selecionado}
              aria-controls={`painel-provedor-${p.id}`}
              onClick={() => setAberto((atual) => (atual === p.id ? null : p.id))}
              className={cn(
                "flex min-h-[4.5rem] flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                selecionado
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border bg-surface hover:border-accent/40 hover:bg-surface-elevated/60",
                p.conectado && !selecionado && "border-success-fg/30",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <span className="text-text-muted">{p.icone}</span>
                <span className="text-sm font-semibold text-text">{p.rotulo}</span>
                {p.conectado ? (
                  <span className="ml-auto rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success-fg">
                    {t("Conectado")}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-xs text-text-muted" title={p.status}>
                {p.status}
              </span>
            </button>
          );
        })}
      </div>

      {aberto === "google" ? (
        <div id="painel-provedor-google" data-testid="detalhe-provedor-google">
          <CartaoDaConexaoGoogle
            configurado={googleConfigurado}
            falta={faltaNoGoogle}
            linkDeConfiguracao={linkDeConfiguracaoDoGoogle}
            contaConectada={contaConectada}
            enderecoDeRetorno={enderecoDeRetorno}
          />
        </div>
      ) : null}

      {aberto === "outlook" ? (
        <div id="painel-provedor-outlook" data-testid="detalhe-provedor-outlook">
          <CartaoDaConexaoMicrosoft
            configurado={microsoftConfigurado}
            falta={faltaNoMicrosoft}
            linkDeConfiguracao={linkDeConfiguracaoDoMicrosoft}
            contaConectada={contaOutlook}
            enderecoDeRetorno={enderecoDeRetornoMicrosoft}
          />
        </div>
      ) : null}

      {aberto === "caldav" ? (
        <div id="painel-provedor-caldav" data-testid="detalhe-provedor-caldav">
          <CartaoDaConexaoCalDav contaConectada={contaCalDav} />
        </div>
      ) : null}
    </section>
  );
}
