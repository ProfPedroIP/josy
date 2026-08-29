# 🕹️ Josy Arcade

Um fliperama em pixel art criado com todo amor e dedicação, pensado em cada detalhe exclusivamente para a Josy! 👾💖

Mais do que um projeto, este é o nosso espaço de diversão com 5 jogos, um chat com recados de voz, um placar compartilhado para a nossa competição e notificações. Fiz questão de deixar tudo rodando como um aplicativo instalável (PWA) e que funciona até sem internet, para você poder abrir e jogar onde quer que esteja.

## Estrutura do nosso Arcade

```text
*.html              uma página por jogo, só markup
sw.js               cache offline e notificações
src/css/            tema visual compartilhado
src/js/             utils, firebase, offline, notificações, áudio, versão
src/js/games/       a lógica de cada jogo
functions/          Cloud Function que envia as notificações
assets/             sons e imagens
```

## Lembrete de Deploy (Notas de Atualização)

1. Incrementar `VERSAO` em **`src/js/versao.js` e em `sw.js`** — os dois precisam
   bater, senão o cache não é invalidado e a atualização não chega nos nossos aparelhos.
2. Acrescentar o bloco da versão no topo de `HISTORICO`, em `versao.js`.
3. Se mexeu em `functions/`, publicar pelo Google Cloud Shell:
   `cd ~/josy && git pull && cd functions && npm install && cd .. && firebase deploy --only functions`

---
*Criado com ☕, código e muito amor por Pedro.*
