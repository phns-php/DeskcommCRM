/**
 * O que uma agenda conectada SABE FAZER — sem nomear o provedor na feature.
 *
 * A mesma regra da restrição de canal: `if (provider === 'google')` fora de
 * `lib/agenda/<provedor>/` é a porta de toda regressão. A tela e o motor de
 * horário livre perguntam capacidades (`caps.oauth`, `caps.caldav`).
 *
 * O rótulo na UI ("Conectar Google") é outra pergunta: a pessoa precisa saber
 * QUAL sistema está autorizando. Isso vive em `ROTULO_DO_PROVEDOR`.
 */
import {
  PROVEDORES_DE_AGENDA,
  type ProvedorDeAgenda,
} from "@/lib/agenda/tipos";

export type CapsDaAgenda = {
  /** Consentimento OAuth (Google, Microsoft). */
  oauth: boolean;
  /** URL + usuário + senha de aplicativo (iCloud, Nextcloud, NAS). */
  caldav: boolean;
  listFreeBusy: boolean;
  createEvent: boolean;
  syncDelta: boolean;
  /** Notificação do provedor para nós (Google push). CalDAV não tem. */
  push: boolean;
};

export const CAPS_DA_AGENDA: Record<ProvedorDeAgenda, CapsDaAgenda> = {
  google_calendar: {
    oauth: true,
    caldav: false,
    listFreeBusy: true,
    createEvent: true,
    syncDelta: true,
    push: true,
  },
  microsoft_graph: {
    oauth: true,
    caldav: false,
    listFreeBusy: true,
    createEvent: true,
    syncDelta: true,
    push: true,
  },
  caldav: {
    oauth: false,
    caldav: true,
    listFreeBusy: true,
    createEvent: true,
    syncDelta: true,
    push: false,
  },
};

export function capsDoProvedor(provedor: ProvedorDeAgenda): CapsDaAgenda {
  return CAPS_DA_AGENDA[provedor];
}

/** Todo provedor do vocabulário tem linha na matriz — senão a constante mentiu. */
export function provedoresSemCapacidade(): ProvedorDeAgenda[] {
  return PROVEDORES_DE_AGENDA.filter((p) => CAPS_DA_AGENDA[p] === undefined);
}
