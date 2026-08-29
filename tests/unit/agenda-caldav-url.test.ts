import { describe, expect, it } from "vitest";

import {
  assertDestinoCalDav,
  ipEhProibidoNoCalDav,
  parseUrlCalDav,
  UrlCalDavRecusada,
} from "@/lib/agenda/caldav/url";

function recusa(fn: () => unknown): string {
  try {
    fn();
    throw new Error("devia ter recusado");
  } catch (err) {
    if (err instanceof UrlCalDavRecusada) return err.codigo;
    throw err;
  }
}

describe("URL CalDAV — LAN passa; metadata não", () => {
  it("iCloud, Nextcloud na LAN e loopback são endereços de agenda", () => {
    expect(parseUrlCalDav("https://caldav.icloud.com/").hostname).toBe("caldav.icloud.com");
    expect(parseUrlCalDav("https://192.168.1.10:8443/dav").href).toContain("192.168.1.10");
    expect(parseUrlCalDav("http://10.0.0.5/nextcloud/remote.php/dav").hostname).toBe("10.0.0.5");
    expect(parseUrlCalDav("http://127.0.0.1:8080/").hostname).toBe("127.0.0.1");
    expect(parseUrlCalDav("https://localhost/dav").hostname).toBe("localhost");
  });

  it("o metadata de nuvem é recusado antes de qualquer fetch", () => {
    expect(recusa(() => parseUrlCalDav("http://169.254.169.254/latest/meta-data/"))).toBe(
      "ip_proibido",
    );
    expect(recusa(() => parseUrlCalDav("http://169.254.1.1/"))).toBe("ip_proibido");
    expect(recusa(() => parseUrlCalDav("http://metadata.google.internal/"))).toBe("metadata");
  });

  it("esquema que não é HTTP, senha na URL e IPv6 literal recusam", () => {
    expect(recusa(() => parseUrlCalDav("file:///etc/passwd"))).toBe("esquema");
    expect(recusa(() => parseUrlCalDav("https://ana:senha@nextcloud.local/dav"))).toBe(
      "credencial_na_url",
    );
    expect(recusa(() => parseUrlCalDav("https://[::1]/dav"))).toBe("ipv6_literal");
    expect(recusa(() => parseUrlCalDav("isto nao e url"))).toBe("invalida");
  });

  it("literal de IP: LAN e loopback passam; metadata não", async () => {
    await expect(assertDestinoCalDav("192.168.0.10")).resolves.toBeUndefined();
    await expect(assertDestinoCalDav("10.1.2.3")).resolves.toBeUndefined();
    await expect(assertDestinoCalDav("127.0.0.1")).resolves.toBeUndefined();
    await expect(assertDestinoCalDav("169.254.169.254")).rejects.toBeInstanceOf(UrlCalDavRecusada);
  });

  it("a faixa de metadata está na lista proibida; 192.168 não está", () => {
    expect(ipEhProibidoNoCalDav("169.254.169.254")).toBe(true);
    expect(ipEhProibidoNoCalDav("192.168.1.1")).toBe(false);
    expect(ipEhProibidoNoCalDav("10.0.0.1")).toBe(false);
    expect(ipEhProibidoNoCalDav("172.16.0.2")).toBe(false);
    expect(ipEhProibidoNoCalDav("127.0.0.1")).toBe(false);
    expect(ipEhProibidoNoCalDav("8.8.8.8")).toBe(false);
    expect(ipEhProibidoNoCalDav("::ffff:169.254.169.254")).toBe(true);
  });
});
