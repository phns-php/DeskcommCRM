# Skills do catálogo (envio manual)

Cópias versionadas das skills ativas. O `install.sh` / `update.sh` **já aplica** a
de plataforma `agendamento` pelo `baseline.sql` (migration 0206) — não precisa
enviar zip numa instalação nova.

Use os zips só quando quiser **repor ou personalizar** numa org que já existe,
pela tela **IA › Skills › Enviar skill**.

| Pacote | O que faz | Quando enviar |
|---|---|---|
| `pacotes/agendamento.zip` | Catálogo de plataforma: marca/remarca/desmarca sozinha | Org sem a skill, ou ponteiro apontando para o corpo antigo |
| `pacotes/agendamento-alluna.zip` | Mesmo nome `agendamento` (a org vence a plataforma) + slug `atendimento`, massagem/drenagem | Alluna, se o override da org sumir |
| `pacotes/objecao-preco.zip` | Objeção de preço | Se desinstalou e quiser de volta |

O `name` no frontmatter do zip da Alluna é `agendamento` de propósito: o runtime
escolhe a versão da org quando o nome coincide.

O prompt do agente de Agendamento (colar na tela do agente, não é zip) está em
`agentes/agendamento-alluna.prompt.md`.

Para remontar os zips depois de editar um `SKILL.md`:

```bash
node scripts/empacotar-skills.mjs
```

A imagem Docker da próxima release sai do CI com o número calculado pelos
fragmentos em `.changes/` (`pnpm release:conferir`). Depois do merge na `main`
e do workflow de release, `bash hostgator-setup-kit/update.sh` puxa essa tag.
Não edite o `.env` à mão para mudar versão.
