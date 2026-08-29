/* Único ponto de acesso ao Firebase: sessão, placar e chat. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  onValue,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

import {
  guardarRecordeLocal,
  recordesLocais,
  migrarRecordesLocais,
  enfileirar,
  lerOutbox,
  remover,
  marcarFalha,
  adotarItensOrfaos,
  estaOnline,
  onConexao,
  comTempoLimite,
} from './offline.js';

export {
  recordesLocais,
  pendentes,
  estaOnline,
  onConexao,
  registrarServiceWorker,
  versaoDoServiceWorker,
  completarMidiaOffline,
} from './offline.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC1drW6iVlzZUKaP_BcEVdACEr_cHn23vI',
  authDomain: 'josyarcade.firebaseapp.com',
  databaseURL: 'https://josyarcade-default-rtdb.firebaseio.com',
  projectId: 'josyarcade',
  storageBucket: 'josyarcade.firebasestorage.app',
  messagingSenderId: '960445216740',
  appId: '1:960445216740:web:d913dc274acdb1ffad39f1',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

const provider = new GoogleAuthProvider();

export const USUARIOS_AUTORIZADOS = ['phsc1994@gmail.com', 'johcat.barth@gmail.com'];

export const CHAVES = {
  BUSCA_ESTELAR: 'busca_estelar_max',
  MINADO: 'minado_amorous_max',
  GUARDIAO_VITORIAS: 'guardiao_amor',
  GUARDIAO_RECORDE: 'guerra_estelar_max',
  LOVE_BIRD: 'love_bird_max',
};

export const JOGOS = [
  { rotulo: '01. BUSCA ESTELAR',   chave: CHAVES.BUSCA_ESTELAR,     tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '02. MINADO AMOROUS',  chave: CHAVES.MINADO,            tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '03. GUARDIÃO (VIT.)', chave: CHAVES.GUARDIAO_VITORIAS, tipo: 'vitorias', sufixo: 'V'   },
  { rotulo: '03. GUARDIÃO (REC.)', chave: CHAVES.GUARDIAO_RECORDE,  tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '04. LOVE BIRD',       chave: CHAVES.LOVE_BIRD,         tipo: 'recorde',  sufixo: 'Pts' },
];

// Vitória virou uma chave por partida, para reenviar sem contar duas vezes.
// O total soma o contador antigo com a quantidade de chaves novas.
function lerEstatistica(dadosUsuario, jogo) {
  if (jogo.tipo === 'vitorias') {
    const legado = dadosUsuario?.estatisticas?.[jogo.chave];
    const anteriores = typeof legado === 'number' ? legado : 0;
    const ids = dadosUsuario?.vitorias?.[jogo.chave];
    return anteriores + (ids ? Object.keys(ids).length : 0);
  }
  const valor = dadosUsuario?.estatisticas?.[jogo.chave];
  return typeof valor === 'number' ? valor : 0;
}

let usuario = null;
let resolvePrimeiroEstado;
const primeiroEstado = new Promise((resolve) => {
  resolvePrimeiroEstado = resolve;
});
const ouvintesDeUsuario = new Set();
let jaResolveu = false;

onAuthStateChanged(auth, (user) => {
  usuario = user;
  if (!jaResolveu) {
    jaResolveu = true;
    resolvePrimeiroEstado(user);
  }
  ouvintesDeUsuario.forEach((cb) => cb(user));
});

export function usuarioAtual() {
  return usuario;
}

export function aguardarUsuario() {
  return primeiroEstado;
}

export function onUsuario(callback) {
  ouvintesDeUsuario.add(callback);
  if (jaResolveu) callback(usuario);
  return () => ouvintesDeUsuario.delete(callback);
}

export function entrarComGoogle() {
  return signInWithPopup(auth, provider);
}

export function sair() {
  return signOut(auth);
}

export function nomeCurto(user) {
  const nome = user?.displayName || user?.email || 'JOGADOR';
  return String(nome).trim().split(/\s+/)[0].toUpperCase();
}

export function salvarNome(uid, nome) {
  return set(ref(db, `usuarios/${uid}/nome`), nome).catch(() => {});
}

const TEMPO_LIMITE = 8000;

// Transação: quem compara é o servidor, não o aparelho.
async function enviarRecorde(uid, chave, pontos) {
  const alvo = ref(db, `usuarios/${uid}/estatisticas/${chave}`);
  await comTempoLimite(
    runTransaction(alvo, (atual) =>
      Math.max(typeof atual === 'number' ? atual : 0, pontos)
    ),
    TEMPO_LIMITE
  );
  return true;
}

async function enviarVitoria(uid, chave, id) {
  await comTempoLimite(
    set(ref(db, `usuarios/${uid}/vitorias/${chave}/${id}`), Date.now()),
    TEMPO_LIMITE
  );
  return true;
}

function enviar(item) {
  if (item.tipo === 'recorde') return enviarRecorde(item.uid, item.chave, item.pontos);
  if (item.tipo === 'vitoria') return enviarVitoria(item.uid, item.chave, item.id);
  return Promise.resolve(false);
}

// Guarda no aparelho, enfileira e tenta enviar. Reenviar é sempre seguro.
export async function registrarRecorde(pontos, chave) {
  const user = await aguardarUsuario();
  const uid = user?.uid || null;

  const ehRecordeLocal = guardarRecordeLocal(uid, chave, pontos);
  if (!uid) return { local: ehRecordeLocal, enviado: false };

  const id = enfileirar({ uid, tipo: 'recorde', chave, pontos });

  if (!estaOnline()) {
    avisarPendencias();
    return { local: ehRecordeLocal, enviado: false };
  }

  try {
    await enviarRecorde(uid, chave, pontos);
    remover(id);
    avisarPendencias();
    return { local: ehRecordeLocal, enviado: true };
  } catch {
    marcarFalha(id);
    avisarPendencias();
    return { local: ehRecordeLocal, enviado: false };
  }
}

export async function registrarVitoria(chave) {
  const user = await aguardarUsuario();
  const uid = user?.uid || null;
  if (!uid) return { enviado: false };

  const id = enfileirar({ uid, tipo: 'vitoria', chave });

  if (!estaOnline()) {
    avisarPendencias();
    return { enviado: false };
  }

  try {
    await enviarVitoria(uid, chave, id);
    remover(id);
    avisarPendencias();
    return { enviado: true };
  } catch {
    marcarFalha(id);
    avisarPendencias();
    return { enviado: false };
  }
}

const ouvintesPendencias = new Set();

export function onPendencias(callback) {
  ouvintesPendencias.add(callback);
  callback(lerOutbox().length);
  return () => ouvintesPendencias.delete(callback);
}

function avisarPendencias() {
  const n = lerOutbox().length;
  ouvintesPendencias.forEach((cb) => cb(n));
}

let sincronizando = false;

// Esvazia a fila. Roda sozinho ao logar e ao reconectar.
export async function sincronizar() {
  if (sincronizando) return { enviados: 0, restantes: lerOutbox().length };

  const user = await aguardarUsuario();
  if (!user || !estaOnline()) return { enviados: 0, restantes: lerOutbox().length };

  sincronizando = true;
  let enviados = 0;

  try {
    adotarItensOrfaos(user.uid);
    for (const item of lerOutbox()) {
      if (item.uid !== user.uid) continue;
      try {
        await enviar(item);
        remover(item.id);
        enviados++;
      } catch {
        marcarFalha(item.id);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }

  avisarPendencias();
  return { enviados, restantes: lerOutbox().length };
}

onUsuario((user) => {
  if (!user) return;
  migrarRecordesLocais(user.uid);
  adotarItensOrfaos(user.uid);
  sincronizar();
});

onConexao((online) => {
  if (online) sincronizar();
});

export function observarEstatisticas(uid, callback) {
  const entregar = (dados) => {
    const locais = recordesLocais(uid);
    callback(
      JOGOS.map((jogo) => {
        const doServidor = lerEstatistica(dados, jogo);
        const doAparelho = jogo.tipo === 'vitorias' ? 0 : locais[jogo.chave] || 0;
        return {
          jogo,
          valor: Math.max(doServidor, doAparelho),
          apenasLocal: doAparelho > doServidor,
        };
      })
    );
  };

  entregar(null);
  return onValue(
    ref(db, `usuarios/${uid}`),
    (snap) => entregar(snap.val()),
    () => entregar(null)
  );
}

export async function carregarPlacarGlobal() {
  let todos = {};
  let online = true;

  try {
    const snap = await comTempoLimite(get(ref(db, 'usuarios')), TEMPO_LIMITE);
    todos = snap.val() || {};
  } catch {
    online = false;
  }

  const jogadores = Object.values(todos);

  const linhas = JOGOS.map((jogo) => {
    const notas = jogadores
      .map((u) => ({ nome: u.nome || '---', valor: lerEstatistica(u, jogo) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    if (notas.length === 0) return { jogo, lider: '---', valor: 0, empate: false };

    const topo = notas[0].valor;
    const empate = notas.length > 1 && notas[1].valor === topo;
    return { jogo, lider: empate ? 'EMPATE' : notas[0].nome, valor: topo, empate };
  });

  return { linhas, online };
}

export function observarChat(meuUid, callback) {
  return onValue(ref(db, 'chat_global'), (snap) => {
    const bruto = snap.val() || {};
    const msgs = Object.entries(bruto)
      .map(([id, m]) => ({ id, ...m, souEu: m.uid === meuUid }))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const temNaoLida = msgs.some((m) => !m.souEu && m.lida === false);
    callback(msgs, temNaoLida);
  });
}

export function enviarMensagem(uid, nome, texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) return Promise.resolve(false);
  return push(ref(db, 'chat_global'), {
    uid,
    nome,
    tipo: 'texto',
    texto: limpo,
    timestamp: serverTimestamp(),
    lida: false,
  })
    .then(() => true)
    .catch(() => false);
}

export function enviarAudio(uid, nome, url, duracao) {
  if (!url) return Promise.resolve(false);
  return push(ref(db, 'chat_global'), {
    uid,
    nome,
    tipo: 'audio',
    audioUrl: url,
    duracao: Math.round(duracao) || 0,
    timestamp: serverTimestamp(),
    lida: false,
  })
    .then(() => true)
    .catch(() => false);
}

export async function marcarMensagensComoLidas(meuUid) {
  try {
    const msgs = (await comTempoLimite(get(ref(db, 'chat_global')), TEMPO_LIMITE)).val();
    if (!msgs) return;
    const patch = {};
    Object.entries(msgs).forEach(([id, m]) => {
      if (m.uid !== meuUid && m.lida === false) patch[`chat_global/${id}/lida`] = true;
    });
    if (Object.keys(patch).length) await update(ref(db), patch);
  } catch {}
}
