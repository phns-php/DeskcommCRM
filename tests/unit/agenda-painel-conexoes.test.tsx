/**
 * Barra compacta → Sheet com o cartão só ao clicar.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelDasConexoesDaAgenda } from "@/app/app/agenda/_components/PainelDasConexoesDaAgenda";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
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

afterEach(cleanup);

const propsBase = {
  googleConfigurado: true,
  microsoftConfigurado: false,
  contaConectada: null as string | null,
  contaOutlook: null as string | null,
  contaCalDav: null as string | null,
  faltaNoGoogle: [] as string[],
  faltaNoMicrosoft: ["MICROSOFT_CLIENT_ID"] as string[],
};

describe("painel das conexões da Agenda", () => {
  it("na carga só mostra os botões — nenhum cartão aberto", () => {
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    expect(screen.getByTestId("painel-conexoes-agenda")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-google")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-outlook")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-caldav")).toBeTruthy();
    expect(screen.getByTestId("porta-tipos")).toBeTruthy();
    expect(screen.getByTestId("porta-horarios")).toBeTruthy();
    expect(screen.queryByTestId("cartao-caldav")).toBeNull();
    expect(screen.queryByTestId("cartao-outlook")).toBeNull();
    expect(screen.queryByTestId("conectar-google")).toBeNull();
  });

  it("clicar em CalDAV abre o formulário no Sheet", () => {
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    fireEvent.click(screen.getByTestId("botao-provedor-caldav"));
    expect(screen.getByTestId("cartao-caldav")).toBeTruthy();
    expect(screen.getByTestId("caldav-home-url")).toBeTruthy();
  });

  it("com Google conectado, o botão mostra o selo Conectado", () => {
    render(
      <PainelDasConexoesDaAgenda {...propsBase} contaConectada="ana@clinica.com.br" />,
    );
    const botao = screen.getByTestId("botao-provedor-google");
    expect(botao.textContent).toMatch(/Conectado/i);
    expect(botao.getAttribute("title")).toContain("ana@clinica.com.br");
  });
});
