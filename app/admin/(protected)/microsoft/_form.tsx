"use client";

import { useT } from "@/hooks/i18n/useT";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateMicrosoftOAuth } from "@/app/actions/settings/updateMicrosoftOAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  readonly clientIdSalvo: string | null;
  readonly temSegredoSalvo: boolean;
  readonly atualizadoEm: string | null;
  readonly temNoAmbiente: boolean;
  readonly enderecoDeRetorno: string;
}

export function FormularioDoMicrosoft({
  clientIdSalvo,
  temSegredoSalvo,
  atualizadoEm,
  temNoAmbiente,
  enderecoDeRetorno,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [clientId, setClientId] = useState(clientIdSalvo ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [salvando, iniciar] = useTransition();

  const podeSalvar =
    clientId.trim().length >= 10 && (temSegredoSalvo || clientSecret.trim().length >= 10);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Agenda do Outlook desta instalação")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Com estas duas informações, quem atende consegue conectar a agenda pessoal do Outlook e ver os compromissos do CRM lá. Elas valem para a instalação inteira — cada pessoa conecta a conta dela depois, sozinha.",
          )}
        </p>
      </header>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="redirect">{t("Endereço de retorno")}</Label>
          <Input id="redirect" readOnly value={enderecoDeRetorno} data-testid="microsoft-redirect" />
          <p className="text-xs text-muted-foreground">
            {t(
              "Cole exatamente isto em URIs de redirecionamento, na tela de autenticação do registro de aplicativo no Azure.",
            )}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-id">{t("ID do aplicativo")}</Label>
          <Input
            id="client-id"
            data-testid="microsoft-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-secret">{t("Segredo do cliente")}</Label>
          <Input
            id="client-secret"
            data-testid="microsoft-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={temSegredoSalvo ? "••••••••" : ""}
          />
          <p className="text-xs text-muted-foreground">
            {temSegredoSalvo
              ? t(
                  "Já existe uma chave cadastrada. Deixe em branco para mantê-la, ou digite uma nova para substituir.",
                )
              : t("Ela é guardada cifrada e nunca volta a aparecer nesta tela.")}
          </p>
        </div>

        {temNoAmbiente ? (
          <p
            data-testid="microsoft-tem-no-ambiente"
            className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
          >
            {t(
              "Esta instalação já tem as credenciais no arquivo de configuração do servidor. O que você salvar aqui passa a valer no lugar delas; apagar o que está aqui faz o sistema voltar a usar as do arquivo.",
            )}
          </p>
        ) : null}

        <p className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs leading-4 text-text-muted">
          <strong className="font-semibold text-text">{t("Ao trocar uma credencial já em uso:")}</strong>{" "}
          {t(
            "quem já conectou a agenda vai precisar conectar de novo. A Microsoft invalida as autorizações antigas quando o aplicativo muda — não há como evitar, e ninguém perde compromisso por isso.",
          )}
        </p>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {atualizadoEm ? (
              <>
                {t("Última alteração em")} {atualizadoEm}.
              </>
            ) : (
              t("Nunca configurado por aqui.")
            )}
          </span>
          <Button
            data-testid="microsoft-salvar"
            disabled={!podeSalvar || salvando}
            onClick={() =>
              iniciar(async () => {
                const r = await updateMicrosoftOAuth({
                  client_id: clientId.trim(),
                  ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
                });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(t("Credenciais do Outlook salvas."));
                setClientSecret("");
                router.refresh();
              })
            }
          >
            {salvando ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
