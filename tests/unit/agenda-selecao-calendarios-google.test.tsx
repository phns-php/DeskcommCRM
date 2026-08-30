import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SelecaoDeCalendariosGoogle } from "@/app/app/agenda/_components/SelecaoDeCalendariosGoogle";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("seleção de calendários Google", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/calendarios") && !init?.method) {
          return {
            ok: true,
            json: async () => ({
              data: {
                connection_id: "cccccccc-0000-4000-8000-00000000000c",
                destination_calendar_id: "ana@clinica.com.br",
                calendarios: [
                  {
                    id: "bbbbbbbb-0000-4000-8000-00000000000b",
                    external_calendar_id: "ana@clinica.com.br",
                    name: "Ana",
                    is_primary: true,
                    counts_for_conflicts: true,
                    is_destination: true,
                  },
                ],
                falhas_recentes: [
                  {
                    appointment_id: "ffffffff-0000-4000-8000-00000000000f",
                    title: "Consulta",
                    starts_at: "2026-09-02T13:00:00.000Z",
                    erro: "HTTP 400 (invalid) — Invalid resource id value.",
                    google_calendar_id: "bbbbbbbb-0000-4000-8000-00000000000b",
                  },
                ],
              },
            }),
          } as Response;
        }
        if (typeof url === "string" && url.includes("/calendarios") && init?.method === "POST") {
          return { ok: true, json: async () => ({ data: { gravados: 1 } }) } as Response;
        }
        if (typeof url === "string" && url.includes("/sincronizar") && init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              data: {
                ida: { publicados: 1, apagados: 0, falhas: 0 },
                volta: { gravados: 2, falhas: 0 },
              },
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );
  });

  it("mostra a chave da conexão, o calendarId do Google, o erro e o botão de sync", async () => {
    render(<SelecaoDeCalendariosGoogle />);
    expect(await screen.findByTestId("ids-da-conexao-google")).toBeTruthy();
    expect(screen.getByTestId("ids-da-conexao-google").textContent).toContain(
      "cccccccc-0000-4000-8000-00000000000c",
    );
    expect(screen.getByTestId("ids-da-conexao-google").textContent).toContain("ana@clinica.com.br");
    expect(screen.getByTestId("falhas-sync-google").textContent).toMatch(/Invalid resource id/i);
    expect(screen.getByTestId("sincronizar-agenda-google")).toBeTruthy();
  });

  it("Atualizar e sincronizar chama lista e depois o sync", async () => {
    const user = userEvent.setup();
    render(<SelecaoDeCalendariosGoogle />);
    await screen.findByTestId("sincronizar-agenda-google");
    await user.click(screen.getByTestId("sincronizar-agenda-google"));
    await waitFor(() => {
      expect(screen.getByTestId("resumo-sync-google").textContent).toMatch(/1 enviados/);
    });
    const fetchMock = vi.mocked(fetch);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/calendarios"))).toBe(true);
    expect(urls.some((u) => u.includes("/sincronizar"))).toBe(true);
  });
});
