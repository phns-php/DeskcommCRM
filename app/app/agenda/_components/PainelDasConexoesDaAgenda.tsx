"use client";

import Link from "next/link";
import * as React from "react";

import { CartaoDaConexaoCalDav } from "./CartaoDaConexaoCalDav";
import { CartaoDaConexaoGoogle } from "./CartaoDaConexaoGoogle";
import { CartaoDaConexaoMicrosoft } from "./CartaoDaConexaoMicrosoft";
import { PORTA_HORARIOS, PORTA_TIPOS } from "./PortasDaAgenda";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, Clock, Gear, Globe, GoogleLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Provedor = "google" | "outlook" | "caldav";

/**
 * Barra compacta de configuração — a grade fica em primeiro plano.
 *
 * Antes: três botões grandes + portas empilhadas. Agora: ícones com selo
 * Conectado; o detalhe (conectar, calendários Google, CalDAV) abre num Sheet.
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
    conectado: boolean;
    titulo: string;
  }> = [
    {
      id: "google",
      rotulo: "Google",
      icone: <GoogleLogo size={18} weight="bold" aria-hidden />,
      conectado: Boolean(contaConectada),
      titulo: contaConectada ?? t("Configurar Google"),
    },
    {
      id: "outlook",
      rotulo: "Outlook",
      icone: <CalendarBlank size={18} weight="bold" aria-hidden />,
      conectado: Boolean(contaOutlook),
      titulo: contaOutlook ?? t("Configurar Outlook"),
    },
    {
      id: "caldav",
      rotulo: "CalDAV",
      icone: <Globe size={18} weight="bold" aria-hidden />,
      conectado: Boolean(contaCalDav),
      titulo: contaCalDav ?? t("Configurar CalDAV"),
    },
  ];

  return (
    <section
      data-testid="painel-conexoes-agenda"
      aria-label={t("Agendas externas")}
      className="flex flex-wrap items-center gap-2"
    >
      {provedores.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`botao-provedor-${p.id}`}
          title={p.titulo}
          aria-expanded={aberto === p.id}
          onClick={() => setAberto(p.id)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
            p.conectado
              ? "border-success-fg/30 bg-success-bg text-success-fg"
              : "border-border bg-surface text-text hover:border-accent/40 hover:bg-surface-elevated/60",
          )}
        >
          <span className="text-current opacity-80">{p.icone}</span>
          <span>{p.rotulo}</span>
          {p.conectado ? (
            <span className="text-[10px] uppercase tracking-wide opacity-80">{t("Conectado")}</span>
          ) : (
            <Gear size={14} weight="bold" aria-hidden className="opacity-60" />
          )}
        </button>
      ))}

      <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />

      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-9 rounded-full"
        data-testid="porta-tipos"
      >
        <Link href={PORTA_TIPOS}>
          <CalendarBlank size={16} weight="bold" aria-hidden />
          <span>{t("Tipos de agendamento")}</span>
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-9 rounded-full"
        data-testid="porta-horarios"
      >
        <Link href={PORTA_HORARIOS}>
          <Clock size={16} weight="bold" aria-hidden />
          <span>{t("Horários de atendimento")}</span>
        </Link>
      </Button>

      <Sheet open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {aberto === "google"
                ? t("Configurar Google")
                : aberto === "outlook"
                  ? t("Configurar Outlook")
                  : t("Configurar CalDAV")}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3" data-testid={aberto ? `detalhe-provedor-${aberto}` : undefined}>
            {aberto === "google" ? (
              <CartaoDaConexaoGoogle
                configurado={googleConfigurado}
                falta={faltaNoGoogle}
                linkDeConfiguracao={linkDeConfiguracaoDoGoogle}
                contaConectada={contaConectada}
                enderecoDeRetorno={enderecoDeRetorno}
              />
            ) : null}
            {aberto === "outlook" ? (
              <CartaoDaConexaoMicrosoft
                configurado={microsoftConfigurado}
                falta={faltaNoMicrosoft}
                linkDeConfiguracao={linkDeConfiguracaoDoMicrosoft}
                contaConectada={contaOutlook}
                enderecoDeRetorno={enderecoDeRetornoMicrosoft}
              />
            ) : null}
            {aberto === "caldav" ? (
              <CartaoDaConexaoCalDav contaConectada={contaCalDav} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
