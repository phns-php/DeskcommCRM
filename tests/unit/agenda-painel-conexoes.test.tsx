/**
 * Botões grandes → formulário só ao clicar.
 *
 * Antes os três cartões nasciam abertos e o CalDAV já trazia o formulário
 * empilhado. Este teste trava o contrato: na carga só há botões; o cartão
 * aparece depois do clique (e some ao clicar de novo).
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelDasConexoesDaAgenda } from "@/app/app/agenda/_components/PainelDasConexoesDaAgenda";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
  it("na carga só mostra os três botões — nenhum cartão aberto", () => {
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    expect(screen.getByTestId("painel-conexoes-agenda")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-google")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-outlook")).toBeTruthy();
    expect(screen.getByTestId("botao-provedor-caldav")).toBeTruthy();
    expect(screen.queryByTestId("cartao-caldav")).toBeNull();
    expect(screen.queryByTestId("cartao-outlook")).toBeNull();
    expect(screen.queryByTestId("conectar-google")).toBeNull();
  });

  it("clicar em CalDAV abre o formulário; clicar de novo fecha", () => {
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    fireEvent.click(screen.getByTestId("botao-provedor-caldav"));
    expect(screen.getByTestId("cartao-caldav")).toBeTruthy();
    expect(screen.getByTestId("caldav-home-url")).toBeTruthy();

    fireEvent.click(screen.getByTestId("botao-provedor-caldav"));
    expect(screen.queryByTestId("cartao-caldav")).toBeNull();
  });

  it("com Google conectado, o botão mostra a conta e o selo Conectado", () => {
    render(
      <PainelDasConexoesDaAgenda {...propsBase} contaConectada="ana@clinica.com.br" />,
    );
    const botao = screen.getByTestId("botao-provedor-google");
    expect(botao.textContent).toContain("ana@clinica.com.br");
    expect(botao.textContent).toMatch(/Conectado/i);
  });
});
