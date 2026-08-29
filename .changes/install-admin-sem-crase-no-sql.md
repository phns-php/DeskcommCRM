---
impacto: nada_mudou
secao: corrigido
titulo: Instalador deixa de quebrar na promoção do primeiro admin
---

Quem já tem o CRM no ar não precisa fazer nada. Em instalação nova, o passo
que cria o dono no banco não morre mais com "language is not a known variable"
quando a VPS tem o comando locale — era uma crase num comentário do SQL que o
bash executava no meio do heredoc.
