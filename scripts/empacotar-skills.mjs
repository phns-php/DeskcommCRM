/**
 * Empacota cada pasta `skills/<nome>/SKILL.md` num zip aceito pela tela
 * IA › Skills › Enviar skill (.zip). Fonte = o markdown; o zip é derivado.
 */
import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SKILLS = path.join(RAIZ, "skills");
const PACOTES = path.join(SKILLS, "pacotes");

function pastasComSkill() {
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "pacotes" && d.name !== "_export" && d.name !== "agentes")
    .map((d) => d.name)
    .filter((nome) => fs.existsSync(path.join(SKILLS, nome, "SKILL.md")));
}

function empacotar() {
  fs.mkdirSync(PACOTES, { recursive: true });
  const feitos = [];
  for (const nome of pastasComSkill()) {
    const md = fs.readFileSync(path.join(SKILLS, nome, "SKILL.md"));
    const zip = zipSync({ "SKILL.md": new Uint8Array(md) });
    const dest = path.join(PACOTES, `${nome}.zip`);
    fs.writeFileSync(dest, zip);
    feitos.push({ nome, bytes: zip.byteLength });
  }
  return feitos;
}

const feitos = empacotar();
for (const f of feitos) process.stdout.write(`${f.nome}.zip  ${f.bytes} bytes\n`);
