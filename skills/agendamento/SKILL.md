---
name: agendamento
description: Playbook pra marcar, remarcar e desmarcar horário pelas ferramentas — executa sozinha, não inventa disponibilidade, e só abre caso humano quando a ferramenta impede.
matcher:
  any_keywords: [agendar, "marcar horário", "marcar consulta", "marcar uma visita", agenda, "que horas vocês", "horário disponível", remarcar, reagendar, "cancelar o horário", desmarcar]
  probe_keywords: ["que horas", "qual dia", "tem vaga", disponibilidade]
---
# Playbook: marcar horário/agendamento

## Quando usar
O lead pede para marcar, remarcar ou desmarcar um horário — consulta, visita,
sessão, procedimento. Qualquer compromisso com data e hora.

## Você executa. Não encaminha.
Você tem as ferramentas. Marque, remarque e desmarque sozinha, do mesmo jeito
que a tela marca: consulta vaga → o cliente escolhe → grave o compromisso.
Só abra caso humano (`open_human_case`) quando a ferramenta recusar com `motivo`
E a `mensagem` não der um próximo passo que você possa cumprir (consultar de
novo, pedir outro horário). Sem caso aberto, NÃO diga que a equipe confirma,
verifica ou retorna.

## Campos que você NUNCA envia
- `owner_user_id` — o responsável já está no tipo. Mandar o id do cliente (ou
  `00000000-…`) consulta a jornada de quem não atende e a agenda devolve
  `jornada_mal_configurada`.
- `lead_id`, `situacao`, `de`, `ate` — omita. Use `contact_id` do contexto e
  `dias_a_frente`.
- UUID zero. Campo que você não tem = campo ausente, não zero.

## Fluxo

**1. Liste o que já está marcado**
`crm_list_appointments` só com `{ contact_id }`. Sem `situacao`, sem
`owner_user_id`. Cliente com horário marcado não recebe oferta como se não
tivesse.

**2. Consulte vagas**
`crm_find_free_slots` com o slug do tipo desta organização (não invente outro) e
`dias_a_frente` (7 se o cliente não deu data). Sem `owner_user_id`, sem `de`/`ate`.
- Horários voltaram → ofereça 2 a 4, concretos, hora local.
- `publicou_horarios: false` ou `motivo` → leia `mensagem`. Se ela mandar
  consultar de novo, consulte. Se não houver próximo passo: `open_human_case` e
  só então avise a pessoa.
- `fuso_suposto: true` → ofereça pedindo confirmação do horário, não afirme o fuso.
- Você NÃO tem `crm_find_free_slots` → aí sim: não ofereça horário e abra caso.

**3. Confirme em uma frase e grave**
Cliente escolheu → "posso confirmar [serviço] [dia] às [hora]?" → sim →
`crm_book_appointment` com `event_type_slug`, `starts_at` de um item da lista,
`contact_id`, `notes` = o que a pessoa precisa.
Só diga que marcou se `marcado: true`. Se `marcado: false`, leia `mensagem` e
siga o que ela pede — nunca invente confirmação.

**4. Remarcar**
SE o lead pedir para remarcar E você tem `crm_reschedule_appointment` → use ela
no MESMO `appointment_id`, com `new_starts_at` vindo de `crm_find_free_slots`.
NÃO cancele para remarcar: é o mesmo compromisso mudando de hora.
SE você NÃO tem essa ferramenta → então cancelar e marcar de novo é o único
caminho; avise em uma frase que podem chegar dois avisos, e nunca deixe os dois
compromissos de pé.

**5. Desmarcar**
SE o lead pedir para cancelar → use `crm_cancel_appointment` se você a tiver,
informe `reason`, e pergunte se quer outro dia sem pressionar. Cancelar libera
o horário e não dá para desfazer: confirme antes.

## Regras duras
- Nunca invente horário.
- Nunca busque o slug na base de conhecimento — use o tipo que o agente já conhece.
- Não peça nome nem documento: o contato já está no turno.
- `crm_book_appointment` é hora combinada COM o cliente. `crm_schedule_followup`
  é retorno interno. Não troque.
- Não use `crm_send_whatsapp_message` neste fluxo.

## O que NÃO fazer
- Não diga "vou ver com a equipe" sem ter aberto caso.
- Não preencha campo opcional com zero.
- Não pergunte "qual horário você prefere?" sem oferecer opções da agenda.
- Não confirme agendamento sem resposta explícita do lead.
