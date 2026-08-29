"use client";

import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Cartão da agenda CalDAV — iCloud, Nextcloud, NAS da clínica.
 *
 * Diferente do Google: não falta app OAuth na instalação. A pessoa cola o
 * endereço e uma senha de aplicativo. Botão "em breve" aqui seria o defeito
 * que a ordem desta entrega recusou: porta só existe quando o adapter existe.
 */
export function CartaoDaConexaoCalDav({ contaConectada }: { contaConectada?: string | null }) {
  const t = useT();
  const router = useRouter();
  const [desconectando, setDesconectando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  if (contaConectada) {
    return (
      <div
        data-testid="caldav-conectado"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="text-text-muted">{t("CalDAV conectado:")} </span>
          <span className="font-medium">{contaConectada}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="desconectar-caldav"
          disabled={desconectando}
          onClick={() => {
            setDesconectando(true);
            void fetch("/api/v1/agenda/caldav/desconectar", { method: "DELETE" })
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
    <form
      data-testid="cartao-caldav"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const home_url = String(dados.get("home_url") ?? "").trim();
        const usuario = String(dados.get("usuario") ?? "").trim();
        const senha = String(dados.get("senha") ?? "");
        setErro(null);
        setEnviando(true);
        void fetch("/api/v1/agenda/caldav/conectar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ home_url, usuario, senha }),
        })
          .then(async (r) => {
            const corpo = (await r.json().catch(() => null)) as {
              error?: { message?: string };
            } | null;
            if (!r.ok) {
              setErro(corpo?.error?.message ?? t("Não consegui conectar esta agenda."));
              setEnviando(false);
              return;
            }
            router.refresh();
          })
          .catch(() => {
            setErro(t("Não consegui conectar esta agenda."));
            setEnviando(false);
          });
      }}
    >
      <div>
        <p className="text-sm font-medium text-text">{t("Conectar agenda CalDAV")}</p>
        <p className="mt-1 text-xs leading-4 text-text-muted">
          {t(
            "iCloud, Nextcloud ou a agenda da sua rede. Use senha de aplicativo, não a senha da conta. O endereço na rede local é aceito.",
          )}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="caldav-home-url">{t("Endereço da agenda")}</Label>
          <Input
            id="caldav-home-url"
            name="home_url"
            data-testid="caldav-home-url"
            type="text"
            inputMode="url"
            required
            autoComplete="off"
            placeholder="https://caldav.icloud.com/"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="caldav-usuario">{t("Usuário")}</Label>
          <Input
            id="caldav-usuario"
            name="usuario"
            data-testid="caldav-usuario"
            type="text"
            required
            autoComplete="username"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="caldav-senha">{t("Senha de aplicativo")}</Label>
          <Input
            id="caldav-senha"
            name="senha"
            data-testid="caldav-senha"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1"
          />
        </div>
      </div>
      {erro ? (
        <p data-testid="caldav-erro" className="text-xs text-error" role="alert">
          {erro}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="outline" size="sm" data-testid="conectar-caldav" disabled={enviando}>
          {enviando ? t("Conectando…") : t("Conectar")}
        </Button>
      </div>
    </form>
  );
}
