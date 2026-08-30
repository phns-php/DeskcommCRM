import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  lerAgendaDoAgente,
  mesclarAgendaDoAgente,
  resolverAgendaDoAgente,
} from "@/lib/agenda/agenda-do-agente";

const CAL = "11111111-1111-4111-8111-111111111111";

describe("lerAgendaDoAgente", () => {
  it("ausente → sem binding", () => {
    expect(lerAgendaDoAgente(null)).toEqual({ calendar_connection_calendar_id: null });
    expect(lerAgendaDoAgente({})).toEqual({ calendar_connection_calendar_id: null });
  });

  it("só aceita UUID v4 — lixo no jsonb não vira ponteiro", () => {
    expect(
      lerAgendaDoAgente({ agenda: { calendar_connection_calendar_id: "nao-e-uuid" } }),
    ).toEqual({ calendar_connection_calendar_id: null });
    expect(
      lerAgendaDoAgente({ agenda: { calendar_connection_calendar_id: CAL } }),
    ).toEqual({ calendar_connection_calendar_id: CAL });
  });
});

describe("mesclarAgendaDoAgente", () => {
  it("não apaga outras chaves de config nem de agenda", () => {
    const next = mesclarAgendaDoAgente(
      { rag_top_k: 7, agenda: { outro: 1, calendar_connection_calendar_id: null } },
      { calendar_connection_calendar_id: CAL },
    );
    expect(next.rag_top_k).toBe(7);
    expect(next.agenda).toEqual({
      outro: 1,
      calendar_connection_calendar_id: CAL,
    });
  });
});

describe("resolverAgendaDoAgente", () => {
  it("espelho da org desligado → null sem consultar calendário", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;
    const r = await resolverAgendaDoAgente(
      supabase,
      "org-1",
      { agenda: { calendar_connection_calendar_id: CAL } },
      { agenda: { external_sync_enabled: false } },
    );
    expect(r).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("sem ponteiro gravado → null sem consultar calendário", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;
    const r = await resolverAgendaDoAgente(supabase, "org-1", {}, { agenda: { external_sync_enabled: true } });
    expect(r).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("a fiação — senão o select só mexe na tela", () => {
  const raiz = process.cwd();

  it("a tela grava, o motor lê, as tools aplicam", () => {
    const form = readFileSync(
      join(raiz, "app", "app", "ai", "agents", "[id]", "_components", "AgentForm.tsx"),
      "utf8",
    );
    const edit = readFileSync(join(raiz, "app", "app", "ai", "agents", "[id]", "page.tsx"), "utf8");
    const novo = readFileSync(join(raiz, "app", "app", "ai", "agents", "new", "page.tsx"), "utf8");
    const tools = readFileSync(join(raiz, "lib", "mcp", "tools", "agendamento.ts"), "utf8");
    const ponte = readFileSync(
      join(raiz, "lib", "agent-engine", "edge", "crm", "mcp-tools.ts"),
      "utf8",
    );
    const push = readFileSync(
      join(raiz, "app", "api", "v1", "cron", "agenda-google-push", "route.ts"),
      "utf8",
    );

    expect(form).toContain("saveAgendaDoAgenteAction");
    expect(form).toContain("AgendaDoAgente");
    expect(edit).toContain("contextoDaAgendaParaOAgente");
    expect(novo).toContain("contextoDaAgendaParaOAgente");
    expect(ponte).toContain("agentConfig.calendarConnectionCalendarId");
    expect(tools).toContain("ctx.agendaDoAgente");
    expect(tools).toContain("google_calendar_id");
    expect(push).toContain("google_calendar_id");
  });
});
