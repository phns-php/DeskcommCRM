/**
 * Um botão → modal com espelho + abas Google / Outlook / CalDAV.
 */
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/calendarios")) {
        return {
          ok: true,
          json: async () => ({ data: { calendarios: [] } }),
        } as Response;
      }
      if (typeof url === "string" && url.includes("/config-externa") && init?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({ data: { external_sync_enabled: true } }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const propsBase = {
  googleConfigurado: true,
  microsoftConfigurado: false,
  contaConectada: null as string | null,
  contaOutlook: null as string | null,
  contaCalDav: null as string | null,
  faltaNoGoogle: [] as string[],
  faltaNoMicrosoft: ["MICROSOFT_CLIENT_ID"] as string[],
  sincronizacaoExternaInicial: true,
};

describe("painel das conexões da Agenda", () => {
  it("na carga só mostra o botão — nenhum cartão na página", () => {
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    expect(screen.getByTestId("painel-conexoes-agenda")).toBeTruthy();
    expect(screen.getByTestId("botao-configurar-agenda-externa")).toBeTruthy();
    expect(screen.queryByTestId("cartao-caldav")).toBeNull();
    expect(screen.queryByTestId("cartao-outlook")).toBeNull();
    expect(screen.queryByTestId("conectar-google")).toBeNull();
    expect(screen.queryByTestId("modal-agenda-externa")).toBeNull();
  });

  it("abrir o modal mostra abas e o formulário CalDAV na aba certa", async () => {
    const user = userEvent.setup();
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    await user.click(screen.getByTestId("botao-configurar-agenda-externa"));
    expect(screen.getByTestId("modal-agenda-externa")).toBeTruthy();
    expect(screen.getByTestId("switch-espelho-externo")).toBeTruthy();
    expect(screen.getByTestId("abas-provedores-externos")).toBeTruthy();

    // Radix Tabs só monta a aba ativa — fireEvent no trigger às vezes não
    // troca o valor no jsdom; userEvent espelha o clique real.
    await user.click(screen.getByTestId("aba-caldav"));
    expect(await screen.findByTestId("cartao-caldav")).toBeTruthy();
    expect(screen.getByTestId("caldav-home-url")).toBeTruthy();
  });

  it("desligar o espelho esconde as abas e mostra aviso só CRM", async () => {
    const user = userEvent.setup();
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    await user.click(screen.getByTestId("botao-configurar-agenda-externa"));

    const switchEl = screen.getByTestId("switch-espelho-externo").querySelector("button");
    expect(switchEl).toBeTruthy();
    await user.click(switchEl!);

    await waitFor(() => {
      expect(screen.getByTestId("aviso-so-crm")).toBeTruthy();
      expect(screen.queryByTestId("abas-provedores-externos")).toBeNull();
    });
  });

  it("portas de tipos e horários ficam dentro do modal", async () => {
    const user = userEvent.setup();
    render(<PainelDasConexoesDaAgenda {...propsBase} />);
    await user.click(screen.getByTestId("botao-configurar-agenda-externa"));
    expect(screen.getByTestId("porta-tipos").getAttribute("href")).toBe(
      "/app/settings/tenant/agenda",
    );
    expect(screen.getByTestId("porta-horarios").getAttribute("href")).toBe(
      "/app/team?aba=atendimento",
    );
  });
});
