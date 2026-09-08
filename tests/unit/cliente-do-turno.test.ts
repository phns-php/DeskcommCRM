import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { argumentosComClienteDoTurno, clienteDoTurno } from "@/lib/mcp/cliente-do-turno";
import type { McpContext } from "@/lib/mcp/types";

const ctx: McpContext = {
  organizationId: "org-1",
  role: "agent",
  actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
  apiTokenId: "tok-1",
  requestId: "req-1",
  supabase: {} as unknown as SupabaseClient,
};

const CONTATO = "b1da7081-04aa-4f49-a5a5-7952af149094";
const OUTRO = "11111111-1111-4111-8111-111111111111";

describe("cliente do turno — o WhatsApp já sabe quem é", () => {
  it("o id do turno vence o que o modelo mandou", () => {
    expect(clienteDoTurno({ ...ctx, contactId: CONTATO }, OUTRO)).toBe(CONTATO);
  });

  it("sem turno, vale o que o modelo mandou (MCP HTTP)", () => {
    expect(clienteDoTurno(ctx, CONTATO)).toBe(CONTATO);
  });

  it("UUID zero do modelo não conta", () => {
    expect(clienteDoTurno(ctx, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("preenche contact_id nas tools que o aceitam, antes do gate de escopo", () => {
    const args = argumentosComClienteDoTurno(
      { contact_id: true, starts_at: true },
      { ...ctx, contactId: CONTATO },
      { starts_at: "2026-09-01T14:00:00Z" },
    );
    expect(args.contact_id).toBe(CONTATO);
  });

  it("não inventa contact_id em ferramenta que não tem o campo", () => {
    const args = argumentosComClienteDoTurno(
      { appointment_id: true },
      { ...ctx, contactId: CONTATO },
      { appointment_id: OUTRO },
    );
    expect(args).toEqual({ appointment_id: OUTRO });
  });
});

describe("o contato do turno chega na ponte, não só no prompt", () => {
  it("os montadores passam o contact_id do job/run", () => {
    const raiz = resolve(__dirname, "../..");
    const mcpTools = readFileSync(resolve(raiz, "lib/agent-engine/edge/crm/mcp-tools.ts"), "utf8");
    const inbound = readFileSync(resolve(raiz, "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
    const operator = readFileSync(resolve(raiz, "lib/agent-engine/agent/operator-turn.ts"), "utf8");
    const runtime = readFileSync(resolve(raiz, "lib/ai/runtime/agent.ts"), "utf8");
    expect(mcpTools).toMatch(/contactId: ids\.contactId/);
    expect(inbound).toMatch(/contactId: leadId/);
    expect(operator).toMatch(/contactId: leadId/);
    expect(runtime).toMatch(/contactId: run\.contact_id/);
  });
});
