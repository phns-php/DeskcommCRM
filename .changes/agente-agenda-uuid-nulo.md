---
impacto: nada_mudou
secao: corrigido
titulo: Agente de agenda volta a enxergar o compromisso do cliente
---

Pedir horário ou remarcar falhava quando o modelo mandava UUID zero, o
id do contato como se fosse o do negócio, ou o contato como responsável
da agenda — a coleta lia a jornada de quem não atende e o cliente ouvia
que a consulta automática não existia. A listagem ignora o zero, trata
aquele id como contato, e o dono da agenda só vem do binding ou do tipo.
