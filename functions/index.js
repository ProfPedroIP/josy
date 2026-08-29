/* =============================================================================
   functions/index.js
   -----------------------------------------------------------------------------
   O ÚNICO CÓDIGO DO JOSY ARCADE QUE RODA NUM SERVIDOR.

   Por que ele precisa existir: para enviar um push é obrigatório assinar a
   mensagem com uma credencial privada. Se essa credencial estivesse no
   JavaScript do site, qualquer pessoa leria e passaria a mandar notificação em
   nome de vocês. Aqui dentro ela nunca sai do Google.

   Três gatilhos, todos disparados por escritas no Realtime Database:

     1. mensagem nova no chat        -> avisa a outra pessoa
     2. recorde batido               -> avisa a outra pessoa
     3. vitória no Guardião          -> avisa a outra pessoa

   As mensagens são enviadas SEM o bloco `notification`, só com `data`. Isso faz
   o FCM entregar direto ao nosso Service Worker em vez de desenhar a
   notificação sozinho — assim o sw.js controla o texto, o ícone e o que
   acontece ao tocar.
   ============================================================================= */

const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

/* A região precisa ser a mesma do seu Realtime Database.
   O seu banco é josyarcade-default-rtdb.firebaseio.com, que fica em us-central1.
   Se um dia você criar o banco em outra região, troque aqui também. */
const REGIAO = 'us-central1';

const NOMES_BONITOS = {
  busca_estelar_max: 'Busca Estelar',
  minado_amorous_max: 'Minado Amorous',
  guerra_estelar_max: 'Guardião (Recorde)',
  love_bird_max: 'Love Bird',
  guardiao_amor: 'Guardião do Amor',
};

/* -----------------------------------------------------------------------------
   ENVIO
----------------------------------------------------------------------------- */

/** Lê os tokens de push de um usuário. */
async function tokensDe(uid) {
  const snap = await getDatabase().ref(`usuarios/${uid}/push`).get();
  return Object.keys(snap.val() || {});
}

/** Nome curto de um usuário, para montar o texto da notificação. */
async function nomeDe(uid) {
  const snap = await getDatabase().ref(`usuarios/${uid}/nome`).get();
  return snap.val() || 'ALGUÉM';
}

/** Todos os usuários cadastrados, menos o que causou o evento. */
async function outrosUsuarios(uidAutor) {
  const snap = await getDatabase().ref('usuarios').get();
  return Object.keys(snap.val() || {}).filter((uid) => uid !== uidAutor);
}

/**
 * Envia para todos os aparelhos de um usuário e faxina os tokens mortos.
 *
 * Token morto acontece o tempo todo: ela desinstala o app, limpa os dados do
 * navegador, troca de celular. Sem a faxina a lista cresce para sempre e cada
 * envio fica mais lento e mais caro.
 */
async function avisar(uid, { titulo, corpo, tag, url = '/index.html' }) {
  const tokens = await tokensDe(uid);
  if (tokens.length === 0) return { enviados: 0, removidos: 0 };

  const resposta = await getMessaging().sendEachForMulticast({
    tokens,
    data: { titulo, corpo, tag, url },
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
    },
  });

  const mortos = [];
  resposta.responses.forEach((r, i) => {
    const codigo = r.error?.code || '';
    if (
      codigo.includes('registration-token-not-registered') ||
      codigo.includes('invalid-argument') ||
      codigo.includes('invalid-registration-token')
    ) {
      mortos.push(tokens[i]);
    }
  });

  await Promise.all(
    mortos.map((t) => getDatabase().ref(`usuarios/${uid}/push/${t}`).remove())
  );

  console.log(
    `[avisar] ${uid}: ${resposta.successCount} entregue(s), ` +
      `${resposta.failureCount} falha(s), ${mortos.length} token(s) removido(s)`
  );
  return { enviados: resposta.successCount, removidos: mortos.length };
}

/** Manda o mesmo aviso para todo mundo, menos o autor. */
async function avisarOsOutros(uidAutor, conteudo) {
  const destinos = await outrosUsuarios(uidAutor);
  await Promise.all(destinos.map((uid) => avisar(uid, conteudo)));
}

/* -----------------------------------------------------------------------------
   1. MENSAGEM NOVA NO CHAT
----------------------------------------------------------------------------- */

exports.notificarChat = onValueCreated(
  { ref: '/chat_global/{msgId}', region: REGIAO },
  async (evento) => {
    const msg = evento.data.val();
    if (!msg?.uid) return;

    const corpo =
      msg.tipo === 'audio'
        ? `🎤 Recado de voz (${msg.duracao || '?'}s)`
        : (msg.texto || '').slice(0, 120);

    await avisarOsOutros(msg.uid, {
      titulo: msg.nome || 'JOSY ARCADE',
      corpo,
      tag: 'chat', // mesma tag = as mensagens se agrupam em vez de empilhar
      url: '/index.html?abrir=chat',
    });
  }
);

/* -----------------------------------------------------------------------------
   2. RECORDE BATIDO
   -----------------------------------------------------------------------------
   Dispara em `estatisticas/<chave>`, que só é escrita pela transação de
   recorde. Comparamos antes/depois para não notificar gravação repetida —
   a sincronização offline pode reenviar o mesmo valor, e nesse caso
   depois === antes e nada é enviado.
----------------------------------------------------------------------------- */

exports.notificarRecorde = onValueWritten(
  { ref: '/usuarios/{uid}/estatisticas/{chave}', region: REGIAO },
  async (evento) => {
    const antes = evento.data.before.val() || 0;
    const depois = evento.data.after.val() || 0;
    if (typeof depois !== 'number' || depois <= antes) return;

    const { uid, chave } = evento.params;
    const jogo = NOMES_BONITOS[chave] || chave;
    const nome = await nomeDe(uid);

    await avisarOsOutros(uid, {
      titulo: '🔥 RECORDE NOVO',
      corpo: `${nome} fez ${depois} pontos em ${jogo}!`,
      tag: `recorde-${chave}`,
      url: '/index.html',
    });
  }
);

/* -----------------------------------------------------------------------------
   3. VITÓRIA NO GUARDIÃO
   -----------------------------------------------------------------------------
   Cada vitória é uma chave própria (o formato idempotente que adotamos para
   sobreviver à sincronização offline). Regravar o mesmo id não cria evento
   novo, então não há risco de notificar duas vezes a mesma partida.
----------------------------------------------------------------------------- */

exports.notificarVitoria = onValueCreated(
  { ref: '/usuarios/{uid}/vitorias/{chave}/{vitoriaId}', region: REGIAO },
  async (evento) => {
    const { uid, chave } = evento.params;
    const jogo = NOMES_BONITOS[chave] || chave;
    const nome = await nomeDe(uid);

    const total = await getDatabase().ref(`usuarios/${uid}/vitorias/${chave}`).get();
    const quantas = Object.keys(total.val() || {}).length;

    await avisarOsOutros(uid, {
      titulo: '🏆 VITÓRIA',
      corpo: `${nome} venceu o ${jogo}! (${quantas} no total)`,
      tag: `vitoria-${chave}`,
      url: '/index.html',
    });
  }
);
