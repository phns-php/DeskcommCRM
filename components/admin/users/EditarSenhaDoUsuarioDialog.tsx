"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminUserPassword } from "@/hooks/useAdminUserPassword";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";

interface Props {
  userId: string;
}

export function EditarSenhaDoUsuarioDialog({ userId }: Props) {
  const t = useT();
  const alterar = useAdminUserPassword(userId);
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    setSenha("");
    setConfirmacao("");
    setErro(null);
  }

  function aoMudarAberto(proximo: boolean) {
    setAberto(proximo);
    if (!proximo) limpar();
  }

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro(t("Senha deve ter pelo menos 8 caracteres"));
      return;
    }
    if (senha !== confirmacao) {
      setErro(t("As senhas não coincidem"));
      return;
    }

    try {
      await alterar.mutateAsync(senha);
      toast.success(t("Senha atualizada"));
      aoMudarAberto(false);
    } catch (falha) {
      const mensagem =
        falha instanceof ApiError && falha.message
          ? t(falha.message)
          : t("Não foi possível alterar a senha.");
      setErro(mensagem);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="editar-senha-do-usuario">
          {t("Editar senha")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Definir nova senha")}</DialogTitle>
          <DialogDescription>
            {t("Escolha uma nova senha para esta conta.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={aoSalvar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-senha-do-usuario">{t("Nova senha")}</Label>
            <Input
              id="nova-senha-do-usuario"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
              disabled={alterar.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmar-senha-do-usuario">{t("Confirmar nova senha")}</Label>
            <Input
              id="confirmar-senha-do-usuario"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(ev) => setConfirmacao(ev.target.value)}
              disabled={alterar.isPending}
            />
          </div>
          {erro && (
            <p role="alert" className="text-sm text-error-fg">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => aoMudarAberto(false)}
              disabled={alterar.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={alterar.isPending}>
              {alterar.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
