import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  lerConfigDaAgendaExterna,
  mesclarConfigDaAgendaExterna,
} from "@/lib/agenda/config-externa";

describe("config da agenda externa", () => {
  it("ausente → espelho ligado (não quebra quem já sincroniza)", () => {
    expect(lerConfigDaAgendaExterna(null).external_sync_enabled).toBe(true);
    expect(lerConfigDaAgendaExterna({}).external_sync_enabled).toBe(true);
  });

  it("lê o boolean gravado", () => {
    expect(
      lerConfigDaAgendaExterna({ agenda: { external_sync_enabled: false } })
        .external_sync_enabled,
    ).toBe(false);
  });

  it("merge não apaga outras chaves de settings nem de agenda", () => {
    const next = mesclarConfigDaAgendaExterna(
      { branding: { name: "X" }, agenda: { outro: 1, external_sync_enabled: true } },
      { external_sync_enabled: false },
    );
    expect(next.branding).toEqual({ name: "X" });
    expect(next.agenda).toEqual({ outro: 1, external_sync_enabled: false });
  });

  it("ocupação, ida e volta consultam o knob — senão o switch só mexe na tela", () => {
    const raiz = process.cwd();
    const consulta = readFileSync(join(raiz, "lib", "agenda", "consulta.ts"), "utf8");
    const push = readFileSync(
      join(raiz, "app", "api", "v1", "cron", "agenda-google-push", "route.ts"),
      "utf8",
    );
    const sync = readFileSync(
      join(raiz, "app", "api", "v1", "cron", "agenda-google-sync", "route.ts"),
      "utf8",
    );
    expect(consulta).toContain("lerConfigDaAgendaExterna");
    expect(push).toContain("lerConfigDaAgendaExterna");
    expect(sync).toContain("lerConfigDaAgendaExterna");
  });
});
