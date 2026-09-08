import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseSkillPackage } from "@/lib/ai/skills/package";

const RAIZ = process.cwd();

function corpoDoSkillMd(arquivo: string): string {
  const raw = readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n[\s\S]*?\n---\n?([\s\S]*)$/.exec(raw);
  if (!m?.[1]) throw new Error(`SKILL.md sem corpo: ${arquivo}`);
  return m[1].trimEnd() + "\n";
}

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex");
}

describe("skills locais batem com o que o self-host aplica", () => {
  it("o SKILL.md de agendamento é o mesmo corpo da migration 0206", () => {
    const local = corpoDoSkillMd(path.join(RAIZ, "skills/agendamento/SKILL.md"));
    expect(md5(local)).toBe("154bb0958dcd22aacdf18380a40510ef");

    const sql = readFileSync(path.join(RAIZ, "supabase/migrations/20260908120000_0206_playbook_agendamento_executa_sozinho.sql"), "utf8");
    const m = /\$body\$([\s\S]*?)\$body\$/.exec(sql);
    expect(m?.[1]).toBe(local);
  });

  it("cada pacote zip abre no parser da tela de Skills", () => {
    for (const nome of ["agendamento", "agendamento-alluna", "objecao-preco"]) {
      const md = readFileSync(path.join(RAIZ, "skills", nome, "SKILL.md"));
      const zip = zipSync({ "SKILL.md": new Uint8Array(md) });
      const out = parseSkillPackage(zip);
      expect(out.ok, `${nome}: ${!out.ok ? out.error.message : ""}`).toBe(true);
      if (out.ok) {
        expect(out.pkg.name).toBe(nome === "agendamento-alluna" ? "agendamento" : nome);
        expect(out.pkg.body.length).toBeGreaterThan(200);
      }
    }
  });
});
