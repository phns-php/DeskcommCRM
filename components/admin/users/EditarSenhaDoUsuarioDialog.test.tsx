/**
 * O modal de senha do admin de plataforma.
 *
 * O que estes casos prendem: senha curta ou confirmação diferente não saem
 * da tela; o POST só dispara com as duas iguais e ≥8; o toast de sucesso
 * não ecoa o valor digitado.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditarSenhaDoUsuarioDialog } from "./EditarSenhaDoUsuarioDialog";

const post = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
}));

const USER_ID = "ce2fa2b3-1bba-4f6b-b6f4-02001b851433";
const SENHA = "senha-boa-123";

function montar() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditarSenhaDoUsuarioDialog userId={USER_ID} />
    </QueryClientProvider>,
  );
}

async function abrir() {
  const user = userEvent.setup({ delay: null });
  montar();
  await user.click(screen.getByTestId("editar-senha-do-usuario"));
  return user;
}

describe("EditarSenhaDoUsuarioDialog", () => {
  beforeEach(() => {
    post.mockReset();
    toastSuccess.mockReset();
  });

  it("abre o modal com os dois campos de senha", async () => {
    await abrir();
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar nova senha")).toBeInTheDocument();
  });

  it("senha curta não chama a API", async () => {
    const user = await abrir();
    await user.type(screen.getByLabelText("Nova senha"), "curta");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "curta");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Senha deve ter pelo menos 8 caracteres",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("confirmação diferente não chama a API", async () => {
    const user = await abrir();
    await user.type(screen.getByLabelText("Nova senha"), SENHA);
    await user.type(screen.getByLabelText("Confirmar nova senha"), "outra-senha-1");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("As senhas não coincidem");
    expect(post).not.toHaveBeenCalled();
  });

  it("salva e não ecoa a senha no toast", async () => {
    post.mockResolvedValue({ data: { updated: true } });
    const user = await abrir();
    await user.type(screen.getByLabelText("Nova senha"), SENHA);
    await user.type(screen.getByLabelText("Confirmar nova senha"), SENHA);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(post).toHaveBeenCalledWith(`/api/v1/admin/users/${USER_ID}/password`, {
      password: SENHA,
    });
    expect(toastSuccess).toHaveBeenCalledWith("Senha atualizada");
    expect(JSON.stringify(toastSuccess.mock.calls)).not.toContain(SENHA);
  });
});
