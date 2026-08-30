"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

type Calendario = {
  id: string;
  external_calendar_id: string;
  name: string;
  is_primary: boolean;
  counts_for_conflicts: boolean;
  is_destination: boolean;
};

type FalhaRecente = {
  appointment_id: string;
  title: string | null;
  starts_at: string;
  erro: string | null;
  google_calendar_id: string | null;
};

/**
 * Escolhe qual calendário do Google ocupa horário e qual recebe o que o CRM marca.
 * Schema já tinha `counts_for_conflicts` / `is_destination` — faltava a tela.
 */
export function SelecaoDeCalendariosGoogle() {
  const t = useT();
  const [calendarios, setCalendarios] = React.useState<Calendario[] | null>(null);
  const [connectionId, setConnectionId] = React.useState<string | null>(null);
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  const [falhas, setFalhas] = React.useState<FalhaRecente[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [atualizando, setAtualizando] = React.useState(false);
  const [sincronizando, setSincronizando] = React.useState(false);
  const [salvandoId, setSalvandoId] = React.useState<string | null>(null);
  const [resumoSync, setResumoSync] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/v1/agenda/google/calendarios");
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${r.status}`);
      }
      const json = (await r.json()) as {
        data: {
          calendarios: Calendario[];
          connection_id?: string;
          destination_calendar_id?: string | null;
          falhas_recentes?: FalhaRecente[];
        };
      };
      setCalendarios(json.data.calendarios);
      setConnectionId(json.data.connection_id ?? null);
      setDestinationId(json.data.destination_calendar_id ?? null);
      setFalhas(json.data.falhas_recentes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCalendarios([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(id: string, patch: Partial<Pick<Calendario, "counts_for_conflicts" | "is_destination">>) {
    setSalvandoId(id);
    setErro(null);
    try {
      const r = await fetch("/api/v1/agenda/google/calendarios", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendar_id: id, ...patch }),
      });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${r.status}`);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvandoId(null);
    }
  }

  async function atualizarLista() {
    setAtualizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/agenda/google/calendarios", { method: "POST" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${r.status}`);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAtualizando(false);
    }
  }

  async function sincronizarAgora() {
    setSincronizando(true);
    setErro(null);
    setResumoSync(null);
    try {
      const lista = await fetch("/api/v1/agenda/google/calendarios", { method: "POST" });
      if (!lista.ok) {
        const corpo = (await lista.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${lista.status}`);
      }
      const r = await fetch("/api/v1/agenda/google/sincronizar", { method: "POST" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(corpo?.error?.message ?? `HTTP ${r.status}`);
      }
      const json = (await r.json()) as {
        data: {
          ida: { publicados: number; apagados: number; falhas: number };
          volta: { gravados: number; falhas: number };
        };
      };
      const { ida, volta } = json.data;
      setResumoSync(
        `${ida.publicados} enviados, ${ida.apagados} apagados, ${ida.falhas} falhas na ida · ${volta.gravados} lidos do Google, ${volta.falhas} falhas na volta`,
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando) {
    return (
      <p data-testid="calendarios-google-carregando" className="mt-2 text-xs text-text-muted">
        {t("Carregando…")}
      </p>
    );
  }

  return (
    <div
      data-testid="selecao-calendarios-google"
      className="mt-3 space-y-2 rounded-md border border-border/60 bg-surface-elevated/40 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text">{t("Qual agenda do Google usar")}</p>
          <p className="text-[11px] leading-4 text-text-muted">
            {t(
              "Ocupa horário entra na disponibilidade. Recebe do CRM é para onde vão as marcações daqui.",
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            size="sm"
            data-testid="sincronizar-agenda-google"
            disabled={sincronizando || atualizando}
            onClick={() => void sincronizarAgora()}
          >
            {sincronizando ? t("Sincronizando…") : t("Atualizar e sincronizar")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="atualizar-calendarios-google"
            disabled={atualizando || sincronizando}
            onClick={() => void atualizarLista()}
          >
            {atualizando ? t("Atualizando…") : t("Só atualizar lista")}
          </Button>
        </div>
      </div>

      {connectionId || destinationId ? (
        <dl
          data-testid="ids-da-conexao-google"
          className="grid gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-2 text-[11px] text-text-muted"
        >
          <div className="flex min-w-0 justify-between gap-2">
            <dt className="shrink-0">{t("Chave da conexão")}</dt>
            <dd className="truncate font-mono text-text" title={connectionId ?? ""}>
              {connectionId ?? "—"}
            </dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2">
            <dt className="shrink-0">{t("ID do calendário no Google")}</dt>
            <dd className="truncate font-mono text-text" title={destinationId ?? ""}>
              {destinationId ?? "—"}
            </dd>
          </div>
        </dl>
      ) : null}

      {resumoSync ? (
        <p data-testid="resumo-sync-google" className="text-[11px] text-text-muted">
          {resumoSync}
        </p>
      ) : null}

      {erro ? (
        <p data-testid="calendarios-google-erro" className="text-xs text-destructive">
          {erro}
        </p>
      ) : null}

      {falhas.length > 0 ? (
        <ul
          data-testid="falhas-sync-google"
          className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2"
        >
          <li className="text-[11px] font-medium text-destructive">
            {t("O Google recusou estas marcações — repetir o cron não muda o resultado até o destino estar certo.")}
          </li>
          {falhas.map((f) => (
            <li key={f.appointment_id} className="text-[11px] text-text">
              <span className="font-medium">{f.title ?? t("Agendamento")}</span>
              {": "}
              <span className="text-destructive">{f.erro}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {(calendarios ?? []).length === 0 ? (
        <p className="text-xs text-text-muted">
          {t("Nenhum calendário listado. Clique em atualizar ou reconecte o Google.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {(calendarios ?? []).map((c) => (
            <li
              key={c.id}
              data-testid={`calendario-google-${c.id}`}
              className="flex flex-col gap-2 rounded-md border border-border/50 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">
                  {c.name}
                  {c.is_primary ? (
                    <span className="ml-1 text-[10px] font-normal uppercase text-text-muted">
                      ({t("principal")})
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-text-muted">{c.external_calendar_id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text">
                  <Switch
                    checked={c.counts_for_conflicts}
                    disabled={salvandoId === c.id}
                    data-testid={`ocupa-${c.id}`}
                    onCheckedChange={(v) => void patch(c.id, { counts_for_conflicts: v })}
                  />
                  {t("Ocupa horário")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text">
                  <Switch
                    checked={c.is_destination}
                    disabled={salvandoId === c.id}
                    data-testid={`destino-${c.id}`}
                    onCheckedChange={(v) => void patch(c.id, { is_destination: v })}
                  />
                  {t("Recebe agendamentos do CRM")}
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
