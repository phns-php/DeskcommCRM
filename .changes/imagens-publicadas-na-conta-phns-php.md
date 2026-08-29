---
impacto: capacidade_nova
secao: alterado
titulo: Imagens do app, worker e scheduler saem da conta phns-php
---

Quem instala a partir deste repositório clona `github.com/phns-php/DeskcommCRM`
e o instalador puxa `deskcommcrm`, `deskcomm-worker` e `deskcomm-scheduler` do
GHCR dessa conta. WAHA, Redis, Caddy e o adaptador HTTP do Redis continuam
nas imagens oficiais de cada publicador — republicá-las seria passivo jurídico
(WAHA é licenciado) e faria o `update.sh` perder o canal oficial deles.

Quem já rodava a imagem do repositório original precisa reinstalar a partir
deste clone, ou trocar as três linhas `*_IMAGE` do `.env` para
`ghcr.io/phns-php/...` na mesma versão.
