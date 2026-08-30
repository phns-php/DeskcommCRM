---
impacto: capacidade_nova
secao: corrigido
titulo: Destino do Google no modal e sync na hora — sem o 400 eterno
---

A Agenda do CRM continua sendo a principal: toda marcação (tela ou agente)
nasce em `calendar_appointments`. O Google é espelho.

O HTTP 400 `Invalid resource id value` vinha de mandar o UUID interno da
nossa tabela como se fosse o id do calendário no Google. Agora o destino
visível no modal ("Chave da conexão" + "ID do calendário no Google") é o
que a API aceita, e o botão **Atualizar e sincronizar** empurra o que
falta e puxa a ocupação sem esperar o cron. Falhas ficam listadas no
mesmo modal — repetir o cron sozinho não muda o resultado se o id estiver
errado.

Nada a editar no `.env`.
