import { describe, expect, it } from "vitest";

import { UUID_NULO, uuidInformado } from "./uuid-informado";

describe("uuidInformado", () => {
  it("omite o UUID nulo que o modelo usa como 'não tenho'", () => {
    expect(uuidInformado(UUID_NULO)).toBeUndefined();
    expect(uuidInformado("  " + UUID_NULO + "  ")).toBeUndefined();
  });

  it("omite vazio, null e undefined — campo opcional não enviado", () => {
    expect(uuidInformado(undefined)).toBeUndefined();
    expect(uuidInformado(null)).toBeUndefined();
    expect(uuidInformado("")).toBeUndefined();
    expect(uuidInformado("   ")).toBeUndefined();
  });

  it("preserva um UUID real", () => {
    const id = "b1da7081-04aa-4f49-a5a5-7952af149094";
    expect(uuidInformado(id)).toBe(id);
  });
});
