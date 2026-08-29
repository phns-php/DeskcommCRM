import { notFound } from "next/navigation";

import { configuracaoDoAmbiente, enderecoDeRetorno } from "@/lib/agenda/microsoft/config";
import { loadAuthUser } from "@/lib/auth/server";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDoMicrosoft } from "./_form";

export const metadata = { title: "Agenda do Outlook da instalação" };
export const dynamic = "force-dynamic";

/**
 * A tela onde o dono da instalação cadastra o app OAuth do Microsoft Graph.
 *
 * Clone de `/admin/google`. O objeto é a INSTALAÇÃO, não a organização.
 * `notFound()` para quem não administra a instalação.
 *
 * ⚠️ O SEGREDO NÃO VOLTA. A leitura pede `client_id` e um booleano.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();

  const { data } = await createAdminClient()
    .from("platform_microsoft_oauth")
    .select("client_id, client_secret_encrypted, updated_at")
    .eq("id", 1)
    .maybeSingle();

  const linha = data as
    | { client_id: string | null; client_secret_encrypted: string | null; updated_at: string | null }
    | null;

  const doAmbiente = configuracaoDoAmbiente();

  return (
    <FormularioDoMicrosoft
      clientIdSalvo={linha?.client_id ?? null}
      temSegredoSalvo={Boolean(linha?.client_secret_encrypted)}
      atualizadoEm={
        linha?.updated_at
          ? new Date(linha.updated_at).toLocaleString(tagDeIdioma(usuario.idioma), {
              timeZone: "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            })
          : null
      }
      temNoAmbiente={doAmbiente !== null}
      enderecoDeRetorno={enderecoDeRetorno()}
    />
  );
}
