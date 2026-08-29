"use client";

import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import * as React from "react";
import { useRouter } from "next/navigation";

import { CalendarBlank } from "@/lib/ui/icons";

/**
 * O cartão da agenda do Outlook — e o caso que importa é o de quem NÃO tem.
 *
 * `MICROSOFT_GRAPH_CLIENT_ID` e `_SECRET` são opcionais, então 100% das
 * instalações novas chegam aqui sem elas. Nesse estado o botão NÃO aparece:
 * a tela explica o que falta e, para quem administra a instalação, aponta
 * para `/admin/microsoft`.
 */
export function CartaoDaConexaoMicrosoft({
  configurado,
  falta,
  contaConectada,
  enderecoDeRetorno,
  linkDeConfiguracao,
}: {
  configurado: boolean;
  falta: string[];
  contaConectada?: string | null;
  enderecoDeRetorno?: string;
  linkDeConfiguracao?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [desconectando, setDesconectando] = React.useState(false);

  if (!configurado) {
    return (
      <div
        data-testid="cartao-outlook"
        className="rounded-lg border border-border bg-surface-elevated/50 p-3"
      >
        <p className="text-sm font-medium text-text">
          {t("Sincronizar com o Outlook ainda não está disponível")}
        </p>
        {linkDeConfiguracao ? (
          <p className="mt-1 text-xs leading-4 text-text-muted">
            {t(
              "Falta cadastrar o aplicativo do Outlook desta instalação. Leva um minuto e você faz por aqui mesmo.",
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs leading-4 text-text-muted">
            {t(
              "Esta instalação não tem as credenciais do Outlook cadastradas — não é nada que você tenha feito. Quem instalou o sistema precisa configurar",
            )}
            {falta.length > 0 ? (
              <>
                {" "}
                <span data-testid="o-que-falta-outlook" className="font-mono text-[11px]">
                  {falta.join(` ${t("e")} `)}
                </span>
              </>
            ) : (
              ` ${t("as credenciais")}`
            )}
          </p>
        )}
        {linkDeConfiguracao ? (
          <a
            href={linkDeConfiguracao}
            data-testid="ir-configurar-outlook"
            className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            {t("Cadastrar as credenciais do Outlook")}
          </a>
        ) : null}
        {enderecoDeRetorno ? (
          <p className="mt-2 text-xs leading-4 text-text-muted">
            {t("E, no Azure, registrar este endereço de retorno —")}{" "}
            <span className="font-medium">{t("exatamente assim")}</span>:{" "}
            <code
              data-testid="endereco-de-retorno-outlook"
              className="select-all break-all font-mono text-[11px] text-text"
            >
              {enderecoDeRetorno}
            </code>
          </p>
        ) : null}
        <p className="mt-2 text-xs leading-4 text-text-muted">
          {t("Até lá a agenda funciona normalmente, só não troca compromissos com o Outlook.")}
        </p>
      </div>
    );
  }

  if (contaConectada) {
    return (
      <div
        data-testid="outlook-conectado"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <CalendarBlank size={16} weight="bold" className="shrink-0 text-text-muted" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="text-text-muted">{t("Agenda do Outlook conectada:")} </span>
          <span className="font-medium">{contaConectada}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="desconectar-outlook"
          disabled={desconectando}
          onClick={() => {
            setDesconectando(true);
            void fetch("/api/v1/agenda/microsoft/desconectar", { method: "DELETE" })
              .then(async (r) => {
                if (!r.ok) throw new Error(await r.text());
                router.refresh();
              })
              .catch(() => setDesconectando(false));
          }}
        >
          {desconectando ? t("Desconectando…") : t("Desconectar")}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="cartao-outlook"
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <p className="min-w-0 flex-1 text-sm text-text-muted">
        {t(
          "Conecte sua agenda do Outlook para ver aqui o que já está marcado lá — e enviar para lá o que for marcado aqui.",
        )}
      </p>
      <Button variant="outline" size="sm" data-testid="conectar-outlook" asChild>
        <a href="/api/v1/agenda/microsoft/connect">
          <CalendarBlank size={16} weight="bold" aria-hidden />
          <span>{t("Conectar Outlook")}</span>
        </a>
      </Button>
    </div>
  );
}
