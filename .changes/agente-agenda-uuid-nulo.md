---
impacto: nada_mudou
secao: corrigido
titulo: Agente de agenda volta a enxergar o compromisso do cliente
---

Pedir para remarcar deixava de achar o horário já marcado quando o modelo
mandava UUID zero nos campos opcionais, ou usava o identificador do
contato como se fosse o do negócio. A listagem agora ignora o zero e
trata aquele identificador como contato — remarcar usa o compromisso
que já existia.
