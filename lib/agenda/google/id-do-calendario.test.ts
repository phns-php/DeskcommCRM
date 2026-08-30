import { describe, expect, it, vi } from "vitest";

import {
  destinoGoogleAoMarcar,
  eIdDoCalendarioNoGoogle,
  eIdInternoDeCalendario,
  resolverIdDoCalendarioGoogle,
} from "./id-do-calendario";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const ROW = "bbbbbbbb-0000-4000-8000-00000000000b";
const CONN = "cccccccc-0000-4000-8000-00000000000c";

describe("id do calendário Google", () => {
  it("UUID interno NÃO é id do Google — é isto que o 400 Invalid resource id mede", () => {
    expect(eIdInternoDeCalendario(ROW)).toBe(true);
    expect(eIdDoCalendarioNoGoogle(ROW)).toBe(false);
    expect(eIdDoCalendarioNoGoogle("ana@clinica.com.br")).toBe(true);
    expect(eIdDoCalendarioNoGoogle("abc@group.calendar.google.com")).toBe(true);
    expect(eIdDoCalendarioNoGoogle("primary")).toBe(false);
    expect(eIdDoCalendarioNoGoogle("")).toBe(false);
  });

  it("resolver troca UUID da nossa tabela pelo external_calendar_id", async () => {
    const admin = {
      from: (tabela: string) => ({
        select: () => {
          const cadeia: Record<string, unknown> = {};
          for (const m of ["eq", "limit"]) cadeia[m] = () => cadeia;
          cadeia.maybeSingle = async () =>
            tabela === "calendar_connection_calendars"
              ? { data: { external_calendar_id: "trabalho@grupo.calendar.google.com" } }
              : { data: null };
          return cadeia;
        },
      }),
    };
    const id = await resolverIdDoCalendarioGoogle(admin as never, {
      organizationId: ORG,
      connectionId: CONN,
      candidato: ROW,
      fallbackAccountEmail: "ana@clinica.com.br",
    });
    expect(id).toBe("trabalho@grupo.calendar.google.com");
  });

  it("candidato já válido passa direto — sem olhar a tabela", async () => {
    const from = vi.fn();
    const id = await resolverIdDoCalendarioGoogle({ from } as never, {
      organizationId: ORG,
      connectionId: CONN,
      candidato: "ana@clinica.com.br",
      fallbackAccountEmail: "outro@x.com",
    });
    expect(id).toBe("ana@clinica.com.br");
    expect(from).not.toHaveBeenCalled();
  });

  it("destino ao marcar recusa gravar o UUID interno na linha do compromisso", async () => {
    const supabase = {
      from: (tabela: string) => ({
        select: () => {
          const cadeia: Record<string, unknown> = {};
          for (const m of ["eq", "limit"]) cadeia[m] = () => cadeia;
          cadeia.maybeSingle = async () => {
            if (tabela === "calendar_connection_calendars") {
              return {
                data: { external_calendar_id: "ana@clinica.com.br", connection_id: CONN },
              };
            }
            return { data: null };
          };
          return cadeia;
        },
      }),
    };
    const d = await destinoGoogleAoMarcar(supabase as never, {
      organizationId: ORG,
      ownerUserId: "dddddddd-0000-4000-8000-00000000000d",
      googleCalendarId: ROW,
      googleConnectionId: CONN,
    });
    expect(d).toEqual({ connectionId: CONN, externalCalendarId: "ana@clinica.com.br" });
  });
});
