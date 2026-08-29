/**
 * `platform_microsoft_oauth` É SERVER-SIDE ONLY — E ISSO SE MEDE, NÃO SE DECLARA.
 *
 * Clone declarado de `credencial-do-google-e-server-side.test.ts`. O
 * `client_secret` do app Azure é o que permite trocar códigos e refresh tokens
 * EM NOME DESTA INSTALAÇÃO — ler a agenda de todos os atendentes que conectaram
 * o Outlook. A anon key vai para o browser.
 *
 * ⚠️ Não edite o arquivo freeze do Google para "cobrir os dois". Cada tabela
 * é um invariante; um arquivo que mede duas esconde a que falta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const TABELA = "platform_microsoft_oauth";

function erroSob(papel: string, comando: string): string | null {
  try {
    sql(`set role ${papel};\n${comando};\nreset role;`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function esperaBarrado(papel: string, comando: string): void {
  const erro = erroSob(papel, comando);
  expect(erro, `\`${papel}\` executou "${comando}" SEM erro — a tabela está exposta`).not.toBeNull();
  expect(erro).toContain("permission denied");
}

function privilegiosDe(papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = '${TABELA}'
       and grantee = '${papel}';
  `).trim();
}

beforeAll(() => {
  sql(`delete from public.${TABELA};`);
  sql(`
    insert into private.app_secrets (name, value)
    values ('nuvemshop_oauth_key', 'chave-de-teste-do-harness-0201-nao-e-segredo')
    on conflict (name) do nothing;
  `);
});

afterAll(() => {
  sql(`delete from public.${TABELA};`);
});

describe("o PostgREST não serve a credencial do Microsoft Graph da instalação", () => {
  it("`anon` não tem privilégio NENHUM", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
  });

  it("`authenticated` também não tem — nenhuma tela lê isto pelo client de sessão", () => {
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
  });

  it("`service_role` CONTINUA com privilégio — controle positivo da sonda", () => {
    const privilegios = privilegiosDe("service_role");
    expect(privilegios).toContain("SELECT");
    expect(privilegios).toContain("INSERT");
    expect(privilegios).toContain("UPDATE");
  });

  it("`anon` é BARRADO ao ler — permission denied, não zero linhas", () => {
    esperaBarrado("anon", `select id from public.${TABELA}`);
  });

  it("`authenticated` é BARRADO ao ler", () => {
    esperaBarrado("authenticated", `select id from public.${TABELA}`);
  });

  it("`authenticated` é BARRADO ao escrever", () => {
    esperaBarrado(
      "authenticated",
      `insert into public.${TABELA} (id, client_id) values (1, 'invasor-uuid-azure')`,
    );
  });

  it("a RLS está LIGADA — o segundo degrau, para o dia em que o grant voltar", () => {
    const ligada = sql(`
      select relrowsecurity from pg_class
       where oid = 'public.${TABELA}'::regclass;
    `).trim();
    expect(ligada, "RLS desligada: o revoke vira a única defesa").toBe("t");
  });

  it("não há policy nenhuma — servir esta tabela nunca foi a intenção", () => {
    const quantas = sql(`
      select count(*) from pg_policies
       where schemaname = 'public' and tablename = '${TABELA}';
    `).trim();
    expect(quantas, "alguém criou policy: a tabela passa a ser SERVIDA").toBe("0");
  });
});

describe("o segredo é gravado cifrado, e volta pela decifra", () => {
  it("a coluna é bytea e o que se grava NÃO se lê em claro", () => {
    const segredo = "azure-segredo-de-teste-0204";
    sql(`
      insert into public.${TABELA} (id, client_id, client_secret_encrypted)
      values (1, '11111111-1111-1111-1111-111111111111', public.fn_encrypt_oauth('${segredo}'))
      on conflict (id) do update set client_secret_encrypted = excluded.client_secret_encrypted;
    `);

    const cru = sql(
      `select encode(client_secret_encrypted, 'escape') from public.${TABELA} where id = 1;`,
    );
    expect(cru.includes(segredo), "o segredo está legível na coluna — fn_encrypt_oauth não foi aplicada").toBe(
      false,
    );

    const decifrado = sql(
      `select public.fn_decrypt_oauth(client_secret_encrypted) from public.${TABELA} where id = 1;`,
    ).trim();
    expect(decifrado, "a decifra não devolveu o que foi gravado — o par não fecha").toBe(segredo);
  });

  it("o singleton é singleton — não dá para ter duas credenciais de instalação", () => {
    const erro = (() => {
      try {
        sql(`insert into public.${TABELA} (id, client_id) values (2, 'segunda');`);
        return null;
      } catch (err) {
        return motivoDoErro(err);
      }
    })();
    expect(erro, "aceitou uma segunda linha: o CHECK do singleton não está no baseline").not.toBeNull();
  });
});
