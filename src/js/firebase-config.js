/* =============================================================================
   src/js/firebase-config.js
   -----------------------------------------------------------------------------
   CAMADA ÚNICA DE ACESSO AO FIREBASE DO JOSY ARCADE.

   Antes: config e initializeApp clonados nos 5 arquivos .html.
   Agora: uma fonte da verdade. Nenhuma página importa de gstatic.com.

   Uso:
     import { registrarRecorde, CHAVES } from './src/js/firebase-config.js';
     await registrarRecorde(score, CHAVES.LOVE_BIRD);
   ============================================================================= */

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
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/* -----------------------------------------------------------------------------
   1. CREDENCIAIS E INICIALIZAÇÃO
----------------------------------------------------------------------------- */

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

/** Quem enxerga o chat global. */
export const USUARIOS_AUTORIZADOS = ['phsc1994@gmail.com', 'johcat.barth@gmail.com'];

/* -----------------------------------------------------------------------------
   2. CATÁLOGO DE JOGOS
   -----------------------------------------------------------------------------
   Esta lista dirige a GRAVAÇÃO e a LEITURA do placar. Antes da refatoração os
   jogos gravavam em 'busca_estelar_max' e 'minado_amorous_max' enquanto o menu
   lia 'busca_estelar' e 'minado_amorous' — por isso essas duas linhas do placar
   ficavam eternamente zeradas.

   Para adicionar um jogo novo: acrescente uma entrada aqui e use CHAVES.X no
   módulo do jogo. O menu se atualiza sozinho.
----------------------------------------------------------------------------- */

export const CHAVES = {
  BUSCA_ESTELAR: 'busca_estelar_max',
  MINADO: 'minado_amorous_max',
  GUARDIAO_VITORIAS: 'guardiao_amor',
  GUARDIAO_RECORDE: 'guerra_estelar_max',
  LOVE_BIRD: 'love_bird_max',
};

export const JOGOS = [
  { rotulo: '01. BUSCA ESTELAR',    chave: CHAVES.BUSCA_ESTELAR,     tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '02. MINADO AMOROUS',   chave: CHAVES.MINADO,            tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '03. GUARDIÃO (VIT.)',  chave: CHAVES.GUARDIAO_VITORIAS, tipo: 'vitorias', sufixo: 'V'   },
  { rotulo: '03. GUARDIÃO (REC.)',  chave: CHAVES.GUARDIAO_RECORDE,  tipo: 'recorde',  sufixo: 'Pts' },
  { rotulo: '04. LOVE BIRD',        chave: CHAVES.LOVE_BIRD,         tipo: 'recorde',  sufixo: 'Pts' },
];

function lerEstatistica(estatisticas, jogo) {
  const valor = estatisticas?.[jogo.chave];
  return typeof valor === 'number' ? valor : 0;
}

/* -----------------------------------------------------------------------------
   3. SESSÃO / AUTENTICAÇÃO
   -----------------------------------------------------------------------------
   Antes cada jogo fazia `let userUID = null` e o registrarRecorde abortava com
   `if (!userUID) return`. Partida que terminasse antes do Firebase resolver o
   login descartava o recorde em silêncio. Agora as gravações esperam
   aguardarUsuario().
----------------------------------------------------------------------------- */

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

/** Usuário logado agora (ou null). Síncrono — pode ser null durante o boot. */
export function usuarioAtual() {
  return usuario;
}

/** Promise que resolve no primeiro estado de auth conhecido (user ou null). */
export function aguardarUsuario() {
  return primeiroEstado;
}

/**
 * Observa login/logout. Dispara na hora se o estado já for conhecido.
 * @returns {() => void} cancela a inscrição
 */
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

/**
 * "Pedro Henrique Silva" -> "PEDRO".
 * O original quebrava com TypeError quando displayName vinha null.
 */
export function nomeCurto(user) {
  const nome = user?.displayName || user?.email || 'JOGADOR';
  return String(nome).trim().split(/\s+/)[0].toUpperCase();
}

export function salvarNome(uid, nome) {
  return set(ref(db, `usuarios/${uid}/nome`), nome);
}

/* -----------------------------------------------------------------------------
   4. PLACAR E ESTATÍSTICAS
----------------------------------------------------------------------------- */

/**
 * Grava um recorde apenas se for maior que o anterior.
 * @returns {Promise<boolean>} true se bateu o recorde
 */
export async function registrarRecorde(pontos, chave) {
  const user = await aguardarUsuario();
  if (!user) return false;
  const alvo = ref(db, `usuarios/${user.uid}/estatisticas/${chave}`);
  const anterior = (await get(alvo)).val() || 0;
  if (pontos <= anterior) return false;
  await set(alvo, pontos);
  return true;
}

/**
 * Incrementa um contador de vitórias.
 * @returns {Promise<number>} total após o incremento
 */
export async function registrarVitoria(chave) {
  const user = await aguardarUsuario();
  if (!user) return 0;
  const alvo = ref(db, `usuarios/${user.uid}/estatisticas/${chave}`);
  const total = ((await get(alvo)).val() || 0) + 1;
  await set(alvo, total);
  return total;
}

/**
 * Estatísticas do usuário em tempo real.
 * @param {(linhas: Array<{jogo: object, valor: number}>) => void} callback
 */
export function observarEstatisticas(uid, callback) {
  return onValue(ref(db, `usuarios/${uid}/estatisticas`), (snap) => {
    const dados = snap.val() || {};
    callback(JOGOS.map((jogo) => ({ jogo, valor: lerEstatistica(dados, jogo) })));
  });
}

/**
 * Placar global consolidado.
 * @returns {Promise<Array<{jogo, lider: string, valor: number, empate: boolean}>>}
 */
export async function carregarPlacarGlobal() {
  const todos = (await get(ref(db, 'usuarios'))).val() || {};
  const jogadores = Object.values(todos);

  return JOGOS.map((jogo) => {
    const notas = jogadores
      .map((u) => ({ nome: u.nome || '---', valor: lerEstatistica(u.estatisticas, jogo) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    if (notas.length === 0) return { jogo, lider: '---', valor: 0, empate: false };

    const topo = notas[0].valor;
    const empate = notas.length > 1 && notas[1].valor === topo;
    return { jogo, lider: empate ? 'EMPATE' : notas[0].nome, valor: topo, empate };
  });
}

/* -----------------------------------------------------------------------------
   5. CHAT GLOBAL
----------------------------------------------------------------------------- */

/**
 * Escuta o chat com as mensagens já normalizadas e ordenadas por tempo.
 * @param {(msgs: Array, temNaoLida: boolean) => void} callback
 */
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
    texto: limpo,
    timestamp: serverTimestamp(),
    lida: false,
  }).then(() => true);
}

/** Marca como lidas todas as mensagens que não são minhas. */
export async function marcarMensagensComoLidas(meuUid) {
  const msgs = (await get(ref(db, 'chat_global'))).val();
  if (!msgs) return;
  const patch = {};
  Object.entries(msgs).forEach(([id, m]) => {
    if (m.uid !== meuUid && m.lida === false) patch[`chat_global/${id}/lida`] = true;
  });
  if (Object.keys(patch).length) await update(ref(db), patch);
}
