"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CartaoDaConexaoCalDav } from "./CartaoDaConexaoCalDav";
import { CartaoDaConexaoGoogle } from "./CartaoDaConexaoGoogle";
import { CartaoDaConexaoMicrosoft } from "./CartaoDaConexaoMicrosoft";
import { PORTA_HORARIOS, PORTA_TIPOS } from "./PortasDaAgenda";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, Clock, Gear, Globe, GoogleLogo } from "@/lib/ui/icons";

/**
 * Um botão na Agenda — o resto mora no modal.
 *
 * A página fica só com a grade. Conexões externas (espelho Google/Outlook/CalDAV)
 * e atalhos de tipos/jornada abrem aqui, sem empilhar cartões no topo.
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
  sincronizacaoExternaInicial = true,
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
  /** Valor vindo do servidor (`organizations.settings.agenda`). */
  sincronizacaoExternaInicial?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [espelho, setEspelho] = React.useState(sincronizacaoExternaInicial);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEspelho(sincronizacaoExternaInicial);
  }, [sincronizacaoExternaInicial]);

  const algumaConectada = Boolean(contaConectada || contaOutlook || contaCalDav);

  async function alternarEspelho(ligado: boolean) {
    setSalvando(true);
    setErro(null);
    const anterior = espelho;
    setEspelho(ligado);
    try {
      const r = await fetch("/api/v1/agenda/config-externa", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ external_sync_enabled: ligado }),
      });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e) {
      setEspelho(anterior);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div data-testid="painel-conexoes-agenda" className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="botao-configurar-agenda-externa"
        onClick={() => setAberto(true)}
        className="gap-1.5"
      >
        <Gear size={16} weight="bold" aria-hidden />
        {t("Configurar Agenda Externa")}
        {algumaConectada && espelho ? (
          <span className="rounded-full bg-success-bg px-1.5 py-0.5 text-[10px] font-medium uppercase text-success-fg">
            {t("Ativa")}
          </span>
        ) : null}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          data-testid="modal-agenda-externa"
          className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
            <DialogTitle>{t("Configurar Agenda Externa")}</DialogTitle>
            <DialogDescription>
              {t(
                "Escolha se as marcações ficam só no CRM ou também espelham o servidor de agenda conectado.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            <div
              data-testid="switch-espelho-externo"
              className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated/40 p-3"
            >
              <Switch
                id="espelho-externo"
                checked={espelho}
                disabled={salvando}
                onCheckedChange={(v) => void alternarEspelho(v)}
                aria-label={t("Ativar conexão externa")}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="espelho-externo" className="cursor-pointer text-sm font-medium text-text">
                  {t("Ativar conexão externa")}
                </label>
                <p className="text-xs leading-4 text-text-muted">
                  {espelho
                    ? t(
                        "Ligado: a Agenda do CRM espelha o servidor configurado (ocupação e envio das marcações).",
                      )
                    : t(
                        "Desligado: as marcações ficam apenas na Agenda do CRM — sem enviar nem importar do Google, Outlook ou CalDAV.",
                      )}
                </p>
              </div>
            </div>

            {erro ? (
              <p data-testid="erro-config-externa" className="text-xs text-destructive">
                {erro}
              </p>
            ) : null}

            {espelho ? (
              <Tabs defaultValue="google" className="w-full">
                <TabsList className="w-full justify-start" data-testid="abas-provedores-externos">
                  <TabsTrigger value="google" data-testid="aba-google" className="gap-1.5">
                    <GoogleLogo size={14} weight="bold" aria-hidden />
                    Google
                    {contaConectada ? (
                      <span className="text-[10px] text-success-fg">●</span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="outlook" data-testid="aba-outlook" className="gap-1.5">
                    <CalendarBlank size={14} weight="bold" aria-hidden />
                    Outlook
                    {contaOutlook ? (
                      <span className="text-[10px] text-success-fg">●</span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="caldav" data-testid="aba-caldav" className="gap-1.5">
                    <Globe size={14} weight="bold" aria-hidden />
                    CalDAV
                    {contaCalDav ? (
                      <span className="text-[10px] text-success-fg">●</span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="google" className="mt-3" data-testid="detalhe-provedor-google">
                  <CartaoDaConexaoGoogle
                    configurado={googleConfigurado}
                    falta={faltaNoGoogle}
                    linkDeConfiguracao={linkDeConfiguracaoDoGoogle}
                    contaConectada={contaConectada}
                    enderecoDeRetorno={enderecoDeRetorno}
                  />
                </TabsContent>
                <TabsContent value="outlook" className="mt-3" data-testid="detalhe-provedor-outlook">
                  <CartaoDaConexaoMicrosoft
                    configurado={microsoftConfigurado}
                    falta={faltaNoMicrosoft}
                    linkDeConfiguracao={linkDeConfiguracaoDoMicrosoft}
                    contaConectada={contaOutlook}
                    enderecoDeRetorno={enderecoDeRetornoMicrosoft}
                  />
                </TabsContent>
                <TabsContent value="caldav" className="mt-3" data-testid="detalhe-provedor-caldav">
                  <CartaoDaConexaoCalDav contaConectada={contaCalDav} />
                </TabsContent>
              </Tabs>
            ) : (
              <p
                data-testid="aviso-so-crm"
                className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-text-muted"
              >
                {t(
                  "Com a conexão externa desligada, configure Google, Outlook ou CalDAV depois de ativar o espelho.",
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
