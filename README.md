# Josy Arcade

Fliperama em pixel art com 5 jogos, chat com recado de voz, placar compartilhado
e notificações. Roda como PWA instalável e funciona sem internet.

## Estrutura

```
*.html              uma página por jogo, só markup
sw.js               cache offline e notificações
src/css/            tema visual compartilhado
src/js/             utils, firebase, offline, notificações, áudio, versão
src/js/games/       a lógica de cada jogo
functions/          Cloud Function que envia as notificações
assets/             sons e imagens
```

## Ao publicar uma versão nova

1. Incremente `VERSAO` em **`src/js/versao.js` e em `sw.js`** — os dois precisam
   bater, senão o cache não é invalidado e a atualização não chega nos aparelhos.
2. Acrescente o bloco da versão no topo de `HISTORICO`, em `versao.js`.
3. Se mexeu em `functions/`, publique pelo Google Cloud Shell:
   `cd ~/josy && git pull && cd functions && npm install && cd .. && firebase deploy --only functions`

## Testar local

Módulos ES6 não abrem por `file://`. Rode um servidor:

```
python3 -m http.server 8000
```
