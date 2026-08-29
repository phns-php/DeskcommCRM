import { describe, expect, it } from "vitest";

import { CAPS_DA_AGENDA, capsDoProvedor, provedoresSemCapacidade } from "@/lib/agenda/capacidades";
import { PROVEDORES_DE_AGENDA } from "@/lib/agenda/tipos";

/**
 * A matriz de capacidades é EXAUSTIVA no vocabulário.
 *
 * Sem este caso, um provedor novo entra no CHECK do banco, a tela ganha botão, e
 * o motor pergunta `caps.oauth` num `Record` incompleto — runtime, não compile,
 * se alguém tipar a chave como string. O `Record<ProvedorDeAgenda, …>` já pega
 * no tsc; este teste pega a matriz DESATUALIZADA quando alguém edita só o array.
 */
describe("caps da agenda", () => {
  it("todo provedor do vocabulário tem capacidade declarada", () => {
    expect(provedoresSemCapacidade()).toEqual([]);
    expect(Object.keys(CAPS_DA_AGENDA).sort()).toEqual([...PROVEDORES_DE_AGENDA].sort());
  });

  it("Google e Outlook falam OAuth; CalDAV não", () => {
    expect(capsDoProvedor("google_calendar").oauth).toBe(true);
    expect(capsDoProvedor("microsoft_graph").oauth).toBe(true);
    expect(capsDoProvedor("caldav").oauth).toBe(false);
    expect(capsDoProvedor("caldav").caldav).toBe(true);
  });

  it("CalDAV não promete push — não existe no protocolo", () => {
    expect(capsDoProvedor("caldav").push).toBe(false);
    expect(capsDoProvedor("google_calendar").push).toBe(true);
  });
});
