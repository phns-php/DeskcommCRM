import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgendaDoAgente } from "@/app/app/ai/agents/[id]/_components/AgendaDoAgente";
import type { CalendarioGoogleDaOrg } from "@/lib/agenda/agenda-do-agente";

const CAL: CalendarioGoogleDaOrg = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Consultório da Ana",
  conta: "clinica@exemplo.com",
  ownerUserId: "u-1",
  externalCalendarId: "ana@exemplo.com",
  connectionId: "c-1",
};

describe("AgendaDoAgente", () => {
  it("espelho desligado explica o que falta — sem select mudo", () => {
    render(
      <AgendaDoAgente
        calendarios={[CAL]}
        sincronizacaoExterna={false}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("agenda-do-agente-espelho-off")).toBeTruthy();
    expect(screen.queryByTestId("select-agenda-google-do-agente")).toBeNull();
  });

  it("Google ausente explica o que falta — sem select mudo", () => {
    render(
      <AgendaDoAgente calendarios={[]} sincronizacaoExterna value="" onChange={() => {}} />,
    );
    expect(screen.getByTestId("agenda-do-agente-sem-google")).toBeTruthy();
    expect(screen.queryByTestId("select-agenda-google-do-agente")).toBeNull();
  });

  it("com espelho e calendário, oferece o select", () => {
    render(
      <AgendaDoAgente
        calendarios={[CAL]}
        sincronizacaoExterna
        value={CAL.id}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("select-agenda-google-do-agente")).toBeTruthy();
    expect(screen.queryByTestId("agenda-do-agente-espelho-off")).toBeNull();
    expect(screen.queryByTestId("agenda-do-agente-sem-google")).toBeNull();
  });
});
