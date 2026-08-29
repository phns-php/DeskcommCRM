import { describe, expect, it } from "vitest";

import { descobrirCalDav } from "@/lib/agenda/caldav/descobrir";

const HOME =
  '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>/calendars/ana/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>';

function resposta(opts: {
  status: number;
  body?: string;
  headers?: Record<string, string>;
  url?: string;
}): Response {
  return new Response(opts.body ?? "", {
    status: opts.status,
    headers: opts.headers,
  });
}

describe("descoberta CalDAV", () => {
  it("grava o calendar-home-set quando o servidor fala CalDAV", async () => {
    const r = await descobrirCalDav({
      url: "https://192.168.1.10:8443/dav",
      usuario: "ana",
      senha: "app-password",
      fetchImpl: async () =>
        resposta({
          status: 207,
          body: HOME,
          headers: { dav: "1, 3, calendar-access", "content-type": "application/xml" },
        }),
    });
    expect(r).toEqual({ ok: true, homeUrl: "https://192.168.1.10:8443/calendars/ana/" });
  });

  it("401 é credencial, não 'não é CalDAV'", async () => {
    const r = await descobrirCalDav({
      url: "https://192.168.1.10/dav",
      usuario: "ana",
      senha: "errada",
      fetchImpl: async () => resposta({ status: 401 }),
    });
    expect(r).toEqual({ ok: false, motivo: "credencial" });
  });

  it("200 sem DAV não vira conexão", async () => {
    const r = await descobrirCalDav({
      url: "https://192.168.1.10/",
      usuario: "ana",
      senha: "x",
      fetchImpl: async (input) => {
        if (String(input).includes(".well-known")) return resposta({ status: 404 });
        return resposta({ status: 200, body: "<html>nginx</html>" });
      },
    });
    expect(r).toEqual({ ok: false, motivo: "nao_e_caldav" });
  });

  it("redirect para metadata é recusado — o hop revalida", async () => {
    const r = await descobrirCalDav({
      url: "https://192.168.1.10/dav",
      usuario: "ana",
      senha: "x",
      fetchImpl: async () =>
        resposta({
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    });
    expect(r).toEqual({ ok: false, motivo: "url_recusada" });
  });

  it("calendar-home-set apontando para metadata não é gravado", async () => {
    const venenoso =
      '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>http://169.254.169.254/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>';
    const r = await descobrirCalDav({
      url: "https://192.168.1.10/dav",
      usuario: "ana",
      senha: "x",
      fetchImpl: async () =>
        resposta({
          status: 207,
          body: venenoso,
          headers: { dav: "calendar-access" },
        }),
    });
    expect(r).toEqual({ ok: false, motivo: "url_recusada" });
  });
});
