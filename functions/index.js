/* Cloud Functions: envia as notificações. Único código que roda em servidor.
   A credencial de envio precisa ficar fora do navegador, por isso ele existe.
   */

const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Precisa ser a mesma região do Realtime Database.
const REGIAO = 'us-central1';

const NOMES_BONITOS = {
  busca_estelar_max: 'Busca Estelar',
  minado_amorous_max: 'Minado Amorous',
  guerra_estelar_max: 'Guardião (Recorde)',
  love_bird_max: 'Love Bird',
  guardiao_amor: 'Guardião do Amor',
};

async function tokensDe(uid) {
  const snap = await getDatabase().ref(`usuarios/${uid}/push`).get();
  return Object.keys(snap.val() || {});
}

async function nomeDe(uid) {
  const snap = await getDatabase().ref(`usuarios/${uid}/nome`).get();
  return snap.val() || 'ALGUÉM';
}

async function outrosUsuarios(uidAutor) {
  const snap = await getDatabase().ref('usuarios').get();
  return Object.keys(snap.val() || {}).filter((uid) => uid !== uidAutor);
}

async function avisar(uid, { titulo, corpo, tag, url = 'index.html' }) {
  const tokens = await tokensDe(uid);
  if (tokens.length === 0) return { enviados: 0, removidos: 0 };

  const resposta = await getMessaging().sendEachForMulticast({
    tokens,
    data: { titulo, corpo, tag, url },
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
    },
  });

  // Faxina de token morto: some quando ela desinstala o app ou troca de aparelho.
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

async function avisarOsOutros(uidAutor, conteudo) {
  const destinos = await outrosUsuarios(uidAutor);
  await Promise.all(destinos.map((uid) => avisar(uid, conteudo)));
}

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
      tag: 'chat',
      // Caminho relativo, sem barra inicial — ver enderecoNoApp no sw.js.
      url: 'index.html?abrir=chat',
    });
  }
);

exports.notificarRecorde = onValueWritten(
  { ref: '/usuarios/{uid}/estatisticas/{chave}', region: REGIAO },
  async (evento) => {
    // Compara antes/depois: reenvio da fila offline não vira notificação repetida.
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
      url: 'index.html',
    });
  }
);

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
      url: 'index.html',
    });
  }
);
