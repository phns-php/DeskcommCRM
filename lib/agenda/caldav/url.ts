/**
 * URL de CalDAV — o guard de webhook NÃO serve aqui.
 *
 * `assertSafeOutboundUrl` recusa 192.168, 10/8 e localhost. Para um webhook
 * isso é certo: o atacante aponta o hook para o Redis do compose. Para CalDAV
 * isso é o produto: a clínica tem Nextcloud/NAS na LAN, e o app roda na mesma
 * rede. Recusar a LAN é dizer que a feature não existe.
 *
 * O que continua PROIBIDO é o que não é agenda — metadata de nuvem
 * (169.254.169.254), multicast, "este host" 0.0.0.0. Senha na própria URL
 * também: ela vaza em log de proxy e em `error.details`.
 */
import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export class UrlCalDavRecusada extends Error {
  constructor(public readonly codigo: string) {
    super(`caldav_url:${codigo}`);
    this.name = "UrlCalDavRecusada";
  }
}

function ipv4ParaInt(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let total = 0;
  for (const parte of partes) {
    const n = Number(parte);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    total = total * 256 + n;
  }
  return total;
}

/** Faixas que uma agenda CalDAV nunca é. LAN e loopback ficam de FORA de propósito. */
const FAIXAS_PROIBIDAS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["169.254.0.0", 16], // link-local + metadata de nuvem
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const HOST_METADATA =
  /^(metadata\.google\.internal|metadata\.google|instance-data|metadata)$/i;

export function ipEhProibidoNoCalDav(ip: string): boolean {
  if (isIPv4(ip)) {
    const alvo = ipv4ParaInt(ip);
    if (alvo === null) return true;
    for (const [base, prefixo] of FAIXAS_PROIBIDAS) {
      const baseInt = ipv4ParaInt(base);
      if (baseInt === null) continue;
      const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
      if ((alvo & mascara) >>> 0 === (baseInt & mascara) >>> 0) return true;
    }
    return false;
  }

  if (isIPv6(ip)) {
    const normal = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normal);
    if (mapped?.[1]) return ipEhProibidoNoCalDav(mapped[1]);
    if (normal === "::") return true;
    if (normal.startsWith("fe80")) return true;
    if (normal.startsWith("ff")) return true;
    if (normal.startsWith("2001:db8")) return true;
    if (normal.startsWith("64:ff9b")) return true;
    return false;
  }

  return true;
}

export function parseUrlCalDav(bruta: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(bruta.trim());
  } catch {
    throw new UrlCalDavRecusada("invalida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlCalDavRecusada("esquema");
  }
  if (parsed.username || parsed.password) {
    throw new UrlCalDavRecusada("credencial_na_url");
  }
  if (parsed.hostname.startsWith("[")) {
    throw new UrlCalDavRecusada("ipv6_literal");
  }
  if (HOST_METADATA.test(parsed.hostname)) {
    throw new UrlCalDavRecusada("metadata");
  }
  if (isIPv4(parsed.hostname) && ipEhProibidoNoCalDav(parsed.hostname)) {
    throw new UrlCalDavRecusada("ip_proibido");
  }
  return parsed;
}

/**
 * Resolve o hostname e recusa se QUALQUER endereço cair na faixa proibida.
 *
 * Literal de IP não passa por DNS. Recusar no primeiro endereço especial — e
 * não "quando todos são" — é o mesmo critério do webhook: um domínio que
 * devolve público + 169.254.169.254 é a assinatura do rebinding.
 */
export async function assertDestinoCalDav(hostname: string): Promise<void> {
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (ipEhProibidoNoCalDav(hostname)) throw new UrlCalDavRecusada("ip_proibido");
    return;
  }

  let enderecos: Array<{ address: string }>;
  try {
    enderecos = await lookup(hostname, { all: true });
  } catch {
    throw new UrlCalDavRecusada("dns");
  }
  if (enderecos.length === 0) throw new UrlCalDavRecusada("dns");
  for (const { address } of enderecos) {
    if (ipEhProibidoNoCalDav(address)) throw new UrlCalDavRecusada("ip_proibido");
  }
}
