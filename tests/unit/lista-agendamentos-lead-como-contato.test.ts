import { describe, expect, it } from "vitest";

import { listaAgendamentos } from "@/lib/agenda/consulta";
import { UUID_NULO } from "@/lib/agenda/uuid-informado";

const ORG = "3070e7fd-1a49-405b-93bc-07e356e21fb4";
const CONTATO = "b1da7081-04aa-4f49-a5a5-7952af149094";
const COMPROMISSO = "b0eee588-c976-4379-8612-12e5bd1f233c";

type Filtros = Record<string, unknown>;

function clienteFalso(opts: {
  links: Array<{ target_id: string }>;
  contato: { id: string } | null;
  compromissos: Array<Record<string, unknown>>;
}) {
  const consultas: Array<{ tabela: string; filtros: Filtros }> = [];

  const from = (tabela: string) => {
    const filtros: Filtros = {};
    const cadeia: Record<string, unknown> = {
      select: () => cadeia,
      eq: (col: string, val: unknown) => {
        filtros[col] = val;
        return cadeia;
      },
      in: (col: string, val: unknown) => {
        filtros[col] = val;
        return cadeia;
      },
      gte: () => cadeia,
      lt: () => cadeia,
      order: () => cadeia,
      limit: () => cadeia,
      maybeSingle: async () => {
        consultas.push({ tabela, filtros: { ...filtros } });
        if (tabela === "contacts") return { data: opts.contato, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        consultas.push({ tabela, filtros: { ...filtros } });
        if (tabela === "crm_lead_links") {
          return Promise.resolve({ data: opts.links, error: null }).then(resolve);
        }
        if (tabela === "calendar_appointments") {
          return Promise.resolve({ data: opts.compromissos, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return cadeia;
  };

  return { from, consultas };
}

describe("listaAgendamentos — lead_id que na verdade é o contato", () => {
  it("o turno chama o contato de lead_id: remapeia e lista o compromisso do contato", async () => {
    const supabase = clienteFalso({
      links: [],
      contato: { id: CONTATO },
      compromissos: [
        {
          id: COMPROMISSO,
          title: "Agendamento - Paulo Henrique",
          starts_at: "2026-09-08T14:00:00Z",
          ends_at: "2026-09-08T14:40:00Z",
          time_zone: "America/Manaus",
          status: "confirmed",
          owner_user_id: "98d14881-1e2a-476f-8f81-7a44248f2631",
          contact_id: CONTATO,
          source: "internal",
          contacts: { name: "Paulo Henrique", display_name: null, phone_number: null, email: null },
        },
      ],
    });

    const r = await listaAgendamentos(supabase as never, ORG, {
      contactId: null,
      leadId: CONTATO,
      dia: "2026-09-08",
      ownerUserId: null,
      situacao: "confirmed",
      limite: 20,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agendamentos).toHaveLength(1);
    expect(r.agendamentos[0]!.id).toBe(COMPROMISSO);

    const agenda = supabase.consultas.find((c) => c.tabela === "calendar_appointments");
    expect(agenda?.filtros.contact_id).toBe(CONTATO);
    expect(agenda?.filtros.id).toBeUndefined();
  });

  it("lead real sem compromisso e sem contato com aquele id: vazio é a resposta certa", async () => {
    const supabase = clienteFalso({ links: [], contato: null, compromissos: [] });
    const r = await listaAgendamentos(supabase as never, ORG, {
      contactId: null,
      leadId: "11111111-1111-4111-8111-111111111111",
      dia: null,
      ownerUserId: null,
      situacao: null,
      limite: 20,
    });
    expect(r).toEqual({ ok: true, agendamentos: [] });
    expect(supabase.consultas.some((c) => c.tabela === "calendar_appointments")).toBe(false);
  });

  it("UUID zero não conta como recorte — sem alvo devolve pergunta, não lista vazia", async () => {
    const supabase = clienteFalso({ links: [], contato: null, compromissos: [] });
    const r = await listaAgendamentos(supabase as never, ORG, {
      contactId: null,
      leadId: UUID_NULO,
      dia: null,
      ownerUserId: UUID_NULO,
      situacao: null,
      limite: 20,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("sem_alvo");
    expect(supabase.consultas).toEqual([]);
  });
});
