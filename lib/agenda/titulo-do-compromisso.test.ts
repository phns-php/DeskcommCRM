import { describe, expect, it } from "vitest";

import { SEM_NOME } from "@/lib/contacts/rotulo-do-contato";

import {
  TETO_DO_TITULO,
  cortarTitulo,
  descricaoDoAtendimento,
  tituloDoCompromisso,
} from "./titulo-do-compromisso";

describe("tituloDoCompromisso", () => {
  it("sem contato e sem título pedido, o título É o nome do tipo — nunca 'Agendamento - Sem nome'", () => {
    expect(
      tituloDoCompromisso({ nomeDoTipo: "Consulta" }),
      "compromisso interno (reunião, bloqueio) não pode nascer com o literal de ausência no título: a grade passaria a mentir que alguém vem",
    ).toBe("Consulta");
    expect(tituloDoCompromisso({ nomeDoTipo: "Consulta", rotuloDoContato: SEM_NOME })).toBe(
      "Consulta",
    );
    expect(tituloDoCompromisso({ nomeDoTipo: "Consulta", rotuloDoContato: "   " })).toBe("Consulta");
  });

  it("com contato nomeado e sem título pedido, o card diz Agendamento - Nome", () => {
    expect(
      tituloDoCompromisso({ nomeDoTipo: "Consulta", rotuloDoContato: "Maria Ferraz" }),
    ).toBe("Agendamento - Maria Ferraz");
  });

  it("quem mandou um título, o título vale — o nome do contato não sobrescreve", () => {
    expect(
      tituloDoCompromisso({
        tituloPedido: "Retorno pós-exame",
        nomeDoTipo: "Consulta",
        rotuloDoContato: "Maria Ferraz",
      }),
    ).toBe("Retorno pós-exame");
  });

  it("título pedido em branco conta como ausência, não como título", () => {
    expect(
      tituloDoCompromisso({
        tituloPedido: "   ",
        nomeDoTipo: "Consulta",
        rotuloDoContato: "Maria Ferraz",
      }),
    ).toBe("Agendamento - Maria Ferraz");
  });

  it("corta no teto da coluna — um título de 500 caracteres estoura o CHECK do Zod", () => {
    const longo = "A".repeat(TETO_DO_TITULO + 40);
    const cortado = cortarTitulo(longo);
    expect(cortado.length).toBe(TETO_DO_TITULO);
    expect(cortado.endsWith("…")).toBe(true);
    expect(
      tituloDoCompromisso({
        nomeDoTipo: "Consulta",
        rotuloDoContato: "N".repeat(TETO_DO_TITULO),
      }).length,
    ).toBeLessThanOrEqual(TETO_DO_TITULO);
  });
});

describe("descricaoDoAtendimento", () => {
  it("description vence notes — a UI e o MCP não brigam pela mesma coluna", () => {
    expect(
      descricaoDoAtendimento({ description: "Dor no joelho", notes: "nota interna" }),
    ).toBe("Dor no joelho");
  });

  it("notes do MCP preenche description quando a UI não mandou nada", () => {
    expect(descricaoDoAtendimento({ notes: "retorno da avaliação" })).toBe(
      "retorno da avaliação",
    );
  });

  it("os dois vazios devolvem null, nunca a string 'undefined' na grade", () => {
    expect(descricaoDoAtendimento({})).toBeNull();
    expect(descricaoDoAtendimento({ description: "  ", notes: "" })).toBeNull();
  });
});
