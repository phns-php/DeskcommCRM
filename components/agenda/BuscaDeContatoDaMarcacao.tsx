"use client";

import { useT } from "@/hooks/i18n/useT";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useCreateContact } from "@/hooks/contacts/useCreateContact";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { contactCreateSchema } from "@/lib/schemas/contacts";
import type { Contact } from "@/lib/types/contacts";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { MagnifyingGlass, Plus, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Quem será atendido — busca compacta, no passo de confirmar.
 *
 * Se a ficha ainda não existe, o botão Cadastrar abre o formulário (Nome,
 * Telefone, Email) e, ao gravar, já escolhe o contato para o compromisso.
 * Sem isto o atendente saía da agenda para criar o contato e perdia o horário.
 */
export function BuscaDeContatoDaMarcacao({
  contatoId,
  nome,
  onEscolher,
  onLimpar,
}: {
  contatoId: string | null;
  nome: string | null;
  onEscolher: (c: { id: string; nome: string }) => void;
  onLimpar: () => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [telefoneNovo, setTelefoneNovo] = useState("");
  const [emailNovo, setEmailNovo] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const create = useCreateContact();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const list = useContactList({
    search: debounced || undefined,
    limit: 8,
  });
  const contatos =
    list.data?.pages.flatMap((p) => p.data).filter((c) => !c.is_anonymized) ?? [];

  function resetCadastro() {
    setCadastrando(false);
    setNomeNovo("");
    setTelefoneNovo("");
    setEmailNovo("");
    setErroForm(null);
  }

  function telefoneParaApi(raw: string): string | undefined {
    const texto = raw.trim();
    if (!texto) return undefined;
    const soDigitos = texto.replace(/\D/g, "");
    if (!soDigitos) return undefined;
    // Aceita "11999998888" e "+5511999998888": o schema exige E.164 com +.
    const comMais = texto.startsWith("+")
      ? `+${soDigitos}`
      : soDigitos.startsWith("55")
        ? `+${soDigitos}`
        : `+55${soDigitos}`;
    return canonicalPhoneBR(comMais);
  }

  async function cadastrar() {
    setErroForm(null);
    const nomeTrim = nomeNovo.trim();
    if (!nomeTrim) {
      setErroForm(t("Informe o nome do contato"));
      return;
    }
    const phone = telefoneParaApi(telefoneNovo);
    const email = emailNovo.trim() || undefined;
    if (!phone && !email) {
      setErroForm(t("Informe telefone ou e-mail"));
      return;
    }

    const parsed = contactCreateSchema.safeParse({
      name: nomeTrim,
      phone_number: phone,
      email,
      source: "manual",
    });
    if (!parsed.success) {
      setErroForm(parsed.error.issues[0]?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      const r = await create.mutateAsync(parsed.data);
      // POST /contacts devolve `{ data: { contact, action } }` — o hook tipa
      // só `Contact`, então lemos o id onde a rota realmente o põe.
      const body = r as unknown as {
        data?: { contact?: Contact; action?: string } | Contact;
      };
      const payload = body.data;
      const contato =
        payload &&
        typeof payload === "object" &&
        "contact" in payload &&
        payload.contact
          ? payload.contact
          : (payload as Contact | undefined);
      if (!contato?.id) {
        setErroForm(t("Não consegui cadastrar o contato"));
        return;
      }
      onEscolher({ id: contato.id, nome: rotuloDoContato(contato, t) });
      resetCadastro();
      setSearch("");
    } catch {
      // toast do hook
    }
  }

  if (contatoId && nome) {
    return (
      <div
        data-testid="contato-escolhido"
        className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-sunken px-2.5 py-1.5"
      >
        <span className="truncate text-sm font-medium text-text">{nome}</span>
        <button
          type="button"
          data-testid="trocar-contato"
          aria-label={t("Trocar contato")}
          onClick={onLimpar}
          className="shrink-0 rounded-sm p-0.5 text-text-muted hover:bg-surface hover:text-text"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>
    );
  }

  if (cadastrando) {
    return (
      <div
        data-testid="cadastro-contato-marcacao"
        className="space-y-2.5 rounded-sm border border-border bg-surface-sunken p-3"
      >
        <p className="text-xs font-medium text-text">{t("Novo contato")}</p>
        <div className="space-y-1.5">
          <Label htmlFor="marcacao-contato-nome" className="text-xs text-text-muted">
            {t("Nome")}
          </Label>
          <Input
            id="marcacao-contato-nome"
            data-testid="marcacao-contato-nome"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            autoComplete="name"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="marcacao-contato-telefone" className="text-xs text-text-muted">
            {t("Telefone")}
          </Label>
          <Input
            id="marcacao-contato-telefone"
            data-testid="marcacao-contato-telefone"
            value={telefoneNovo}
            onChange={(e) => setTelefoneNovo(e.target.value)}
            placeholder="+5511999998888"
            autoComplete="tel"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="marcacao-contato-email" className="text-xs text-text-muted">
            Email
          </Label>
          <Input
            id="marcacao-contato-email"
            data-testid="marcacao-contato-email"
            type="email"
            value={emailNovo}
            onChange={(e) => setEmailNovo(e.target.value)}
            autoComplete="email"
            className="h-9"
          />
        </div>
        {erroForm ? <p className="text-xs text-error-fg">{erroForm}</p> : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="cancelar-cadastro-contato"
            onClick={resetCadastro}
            disabled={create.isPending}
          >
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="salvar-contato-marcacao"
            onClick={() => void cadastrar()}
            disabled={create.isPending}
          >
            {create.isPending ? t("Criando…") : t("Cadastrar e usar")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <MagnifyingGlass
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
          aria-hidden
        />
        <Input
          data-testid="busca-contato-marcacao"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Buscar contato")}
          className="h-9 pl-8"
          autoComplete="off"
        />
      </div>
      <ul
        data-testid="resultados-contato-marcacao"
        className="max-h-36 overflow-y-auto rounded-sm border border-border bg-surface"
      >
        {contatos.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-text-muted">
            {list.isFetching ? t("Carregando…") : t("Nenhum contato encontrado")}
          </li>
        ) : (
          contatos.map((c) => {
            const rotulo = rotuloDoContato(c, t);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid="resultado-contato"
                  data-contato-id={c.id}
                  onClick={() => onEscolher({ id: c.id, nome: rotulo })}
                  className={cn(
                    "flex w-full items-center px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-500",
                  )}
                >
                  <span className="truncate">{rotulo}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="abrir-cadastro-contato-marcacao"
        className="w-full justify-center gap-1.5"
        onClick={() => {
          setCadastrando(true);
          setNomeNovo(debounced);
          setErroForm(null);
        }}
      >
        <Plus size={14} weight="bold" aria-hidden />
        {t("Cadastrar contato")}
      </Button>
    </div>
  );
}
