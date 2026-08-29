import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PORTA_HORARIOS,
  PORTA_TIPOS,
  PortasDaAgenda,
} from "@/app/app/agenda/_components/PortasDaAgenda";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

/**
 * As portas da Agenda apontam para telas que JÁ EXISTEM.
 *
 * Sem estes casos, um href="#" ou um botão sem destino passaria — e a pessoa
 * que abre a Agenda numa instalação nova continuaria sem caminho até tipos e
 * jornada, que é exatamente o defeito que este recorte fecha.
 */
afterEach(cleanup);

describe("portas da Agenda", () => {
  it("oferece as duas portas, com o endereço certo", () => {
    render(<PortasDaAgenda />);
    const tipos = screen.getByTestId("porta-tipos");
    const horarios = screen.getByTestId("porta-horarios");
    expect(tipos.getAttribute("href")).toBe(PORTA_TIPOS);
    expect(horarios.getAttribute("href")).toBe(PORTA_HORARIOS);
  });

  it("a porta de tipos é a tela de Configurações, não um atalho mudo", () => {
    expect(PORTA_TIPOS).toBe("/app/settings/tenant/agenda");
  });

  it("a porta de horários cai na aba Atendimento, não na de Membros", () => {
    // `/app/team` sozinho abre Membros. Quem vem da Agenda procura jornada.
    expect(PORTA_HORARIOS).toBe("/app/team?aba=atendimento");
  });
});

describe("a tela da Agenda MONTA as portas — componente solto não conta", () => {
  it("app/app/agenda/_client.tsx importa PortasDaAgenda", () => {
    const fonte = readFileSync(join(process.cwd(), "app", "app", "agenda", "_client.tsx"), "utf8");
    expect(
      fonte.includes("PortasDaAgenda"),
      "as portas existem e ninguém as monta: é o mesmo defeito do FiltroDePessoas, que ficou provado na vitrine e invisível no produto",
    ).toBe(true);
    expect(fonte.includes("<PortasDaAgenda"), "importou e não renderizou").toBe(true);
  });

  it("o vazio da Agenda aponta para as mesmas portas, não para onClick vazio", () => {
    const fonte = readFileSync(join(process.cwd(), "app", "app", "agenda", "_client.tsx"), "utf8");
    expect(fonte).toMatch(/EmptyAgenda[\s\S]*href:\s*PORTA_TIPOS|EmptyAgenda[\s\S]*PORTA_TIPOS/);
    expect(fonte).toMatch(/PORTA_HORARIOS/);
  });
});
