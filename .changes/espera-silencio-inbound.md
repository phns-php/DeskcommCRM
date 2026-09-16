---
impacto: capacidade_nova
secao: corrigido
titulo: A IA espera o cliente terminar de escrever antes de responder
---

Várias bolhas seguidas no WhatsApp (frase + complemento + emoji) deixam de gerar
uma resposta cada. O assistente espera o silêncio — 20 segundos por padrão, até
45–60 se você definir `INBOUND_DEBOUNCE_MS` no `.env` do worker — e responde
uma vez, lendo o conjunto. O ritmo anti-ban em Conexões › Proteção de envio
não muda.
