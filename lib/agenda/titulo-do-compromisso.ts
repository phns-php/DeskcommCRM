/**
 * O TÍTULO QUE A GRADE MOSTRA — uma decisão, um lugar.
 *
 * `calendar_appointments.title` é o que o card desenha e o que vai ao Google.
 * Sem esta função, a UI mandava o nome do TIPO e o MCP mandava o que o modelo
 * inventasse: a grade dizia "Consulta" e quem ia ser atendido só aparecia num
 * subtítulo que some em bloco de 30 minutos.
 *
 * A regra: quem pediu um título, o título vale. Quem não pediu, o título é
 * `Agendamento - Nome do Cliente` — e só entra o nome se ele for de gente, não
 * o literal `Sem nome`. Sem contato (reunião interna, bloqueio), fica o tipo.
 */
import { SEM_NOME } from "@/lib/contacts/rotulo-do-contato";

/** Espelha o `max(200)` do Zod da rota. Cortar aqui evita 422 depois de gravar. */
export const TETO_DO_TITULO = 200;

export function cortarTitulo(texto: string): string {
  const t = texto.trim();
  if (t.length <= TETO_DO_TITULO) return t;
  return `${t.slice(0, TETO_DO_TITULO - 1).trimEnd()}…`;
}

export function tituloDoCompromisso(args: {
  tituloPedido?: string | null;
  nomeDoTipo: string;
  rotuloDoContato?: string | null;
}): string {
  const pedido = args.tituloPedido?.trim();
  if (pedido) return cortarTitulo(pedido);

  const rotulo = args.rotuloDoContato?.trim();
  if (rotulo && rotulo !== SEM_NOME) {
    return cortarTitulo(`Agendamento - ${rotulo}`);
  }
  return cortarTitulo(args.nomeDoTipo || "Agendamento");
}

/**
 * O que a equipe lê ao abrir o compromisso: `description` vence; `notes` da
 * ferramenta MCP (o modelo já conhece esse campo) preenche quando a descrição
 * não veio. Os dois vazios → a coluna fica nula, não a string `"undefined"`.
 */
export function descricaoDoAtendimento(args: {
  description?: string | null;
  notes?: string | null;
}): string | null {
  const texto = args.description?.trim() || args.notes?.trim() || "";
  return texto.length > 0 ? texto : null;
}
