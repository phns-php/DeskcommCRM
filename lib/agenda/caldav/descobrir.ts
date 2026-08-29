/**
 * Handshake CalDAV: a URL que a pessoa colou fala o protocolo, com ESSA senha?
 *
 * Sem isto, gravaríamos qualquer endereço. O guard de URL impede metadata; este
 * arquivo impede gravar "healthy" num Nginx que devolveu 200 na home. A senha
 * só viaja no header Authorization e nunca entra em log nem em Error.message.
 *
 * Redirect é seguido no máximo 3 vezes, e CADA hop revalida a URL — senão um
 * Nextcloud na LAN que redireciona para 169.254.169.254 passaria no primeiro
 * hop e o fetch iria ao metadata.
 */
import {
  assertDestinoCalDav,
  parseUrlCalDav,
  UrlCalDavRecusada,
} from "./url";

export type MotivoDaDescoberta =
  | "url_recusada"
  | "credencial"
  | "nao_e_caldav"
  | "rede"
  | "timeout";

export type ResultadoDaDescoberta =
  | { ok: true; homeUrl: string }
  | { ok: false; motivo: MotivoDaDescoberta };

const TIMEOUT_MS = 8_000;
const MAX_HOPS = 3;

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:current-user-principal/>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`;

export type FetchCalDav = (input: string, init: RequestInit) => Promise<Response>;

function cabecalhos(usuario: string, senha: string): Headers {
  const token = Buffer.from(`${usuario}:${senha}`, "utf8").toString("base64");
  return new Headers({
    Authorization: `Basic ${token}`,
    Depth: "0",
    "Content-Type": "application/xml; charset=utf-8",
    Accept: "application/xml, text/xml, */*",
    "User-Agent": "CalDAV/1.0",
  });
}

function hrefDoHome(xml: string): string | null {
  const bloco = xml.match(/calendar-home-set[\s\S]{0,800}/i);
  if (!bloco) return null;
  const href = bloco[0].match(/<[^>]*href[^>]*>([^<]+)</i);
  const valor = href?.[1]?.trim();
  return valor || null;
}

function pareceCalDav(res: Response, corpo: string): boolean {
  const dav = (res.headers.get("dav") ?? "").toLowerCase();
  if (dav.includes("calendar")) return true;
  if (res.status === 207 && /calendar-home-set|calendar-access|urn:ietf:params:xml:ns:caldav/i.test(corpo)) {
    return true;
  }
  return false;
}

async function validar(url: string): Promise<URL> {
  const parsed = parseUrlCalDav(url);
  await assertDestinoCalDav(parsed.hostname);
  return parsed;
}

async function pedir(
  url: URL,
  init: RequestInit,
  fetchImpl: FetchCalDav,
  hops: number,
): Promise<{ res: Response; url: URL }> {
  if (hops > MAX_HOPS) throw new UrlCalDavRecusada("redirect");
  await validar(url.href);

  let res: Response;
  try {
    res = await fetchImpl(url.href, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof UrlCalDavRecusada) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      const timeout = new Error("timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw new Error("rede");
  }

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error("rede");
    const proximo = new URL(loc, url.href);
    return pedir(proximo, init, fetchImpl, hops + 1);
  }
  return { res, url };
}

export async function descobrirCalDav(opts: {
  url: string;
  usuario: string;
  senha: string;
  fetchImpl?: FetchCalDav;
}): Promise<ResultadoDaDescoberta> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = cabecalhos(opts.usuario, opts.senha);

  try {
    let alvo = await validar(opts.url);

    if (alvo.pathname === "/" || alvo.pathname === "") {
      try {
        const well = new URL("/.well-known/caldav", alvo);
        const wellRes = await pedir(well, { method: "GET", headers }, fetchImpl, 0);
        if (wellRes.res.status !== 404 && wellRes.res.status !== 405) {
          alvo = wellRes.url;
        }
      } catch (err) {
        if (err instanceof UrlCalDavRecusada) throw err;
        // well-known ausente é o caso comum; tenta o endereço que a pessoa colou.
      }
    }

    const { res, url: final } = await pedir(
      alvo,
      { method: "PROPFIND", headers, body: PROPFIND_BODY },
      fetchImpl,
      0,
    );

    if (res.status === 401 || res.status === 403) {
      return { ok: false, motivo: "credencial" };
    }

    const corpo = await res.text().catch(() => "");
    if (!pareceCalDav(res, corpo)) {
      return { ok: false, motivo: "nao_e_caldav" };
    }

    const href = hrefDoHome(corpo);
    const home = href ? new URL(href, final.href) : final;
    await validar(home.href);
    return { ok: true, homeUrl: home.href };
  } catch (err) {
    if (err instanceof UrlCalDavRecusada) return { ok: false, motivo: "url_recusada" };
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { ok: false, motivo: "timeout" };
    }
    return { ok: false, motivo: "rede" };
  }
}
