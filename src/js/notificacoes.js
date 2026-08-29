/* =============================================================================
   src/js/notificacoes.js
   -----------------------------------------------------------------------------
   NOTIFICAÇÕES PUSH DO JOSY ARCADE (lado do navegador).

   O que acontece aqui:
     1. pede permissão (só a partir de um toque da pessoa — é exigência do
        navegador, permissão pedida sozinha ao abrir é ignorada)
     2. pega o token do aparelho no Firebase Cloud Messaging
     3. guarda esse token no banco, para a Cloud Function saber para onde enviar
     4. mostra um aviso dentro do app quando a mensagem chega com o app aberto

   O QUE VOCÊ PRECISA CONFIGURAR
   A constante CHAVE_VAPID abaixo. Ela é gerada em:
     Firebase Console -> ⚙ Configurações do projeto -> Cloud Messaging
     -> Certificados push da Web -> Gerar par de chaves
   Copie a chave (um texto longo começando com "B...") e cole aqui.
   Ela é pública por natureza — pode ficar no repositório sem problema.
   ============================================================================= */

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js';

import { app, db } from './firebase-config.js';
import {
  ref,
  set,
  remove,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/* ⬇⬇⬇  COLE AQUI A SUA CHAVE VAPID  ⬇⬇⬇ */
export const CHAVE_VAPID = 'BA4EINSXfz4oUnGWtE8BBXFzjCI6uK5COuSKdt_ZCSASJZcm4yjauTHq7rPPVWHiuxc39JtCgRj-TyJoFrOfsOk';
/* ⬆⬆⬆                                  ⬆⬆⬆ */

const CHAVE_TOKEN_LOCAL = 'josy-arcade:token-push';

let messaging = null;
let suportado = null;

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

/**
 * @returns {Promise<boolean>} se este navegador consegue receber push
 */
export async function notificacoesSuportadas() {
  if (suportado !== null) return suportado;
  try {
    suportado =
      typeof Notification !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      (await isSupported());
  } catch {
    suportado = false;
  }
  return suportado;
}

/**
 * @returns {'default'|'granted'|'denied'|'indisponivel'}
 */
export function permissaoAtual() {
  if (typeof Notification === 'undefined') return 'indisponivel';
  return Notification.permission;
}

/** True quando a chave VAPID ainda não foi preenchida. */
export function faltaConfigurar() {
  return !CHAVE_VAPID || CHAVE_VAPID.startsWith('COLE_AQUI');
}

/* -----------------------------------------------------------------------------
   ATIVAÇÃO
----------------------------------------------------------------------------- */

/**
 * Pede permissão e registra o aparelho.
 * PRECISA ser chamado de dentro de um clique — navegador nenhum aceita
 * pedido de permissão automático.
 *
 * @param {string} uid
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 */
export async function ativarNotificacoes(uid) {
  if (faltaConfigurar()) {
    return { ok: false, motivo: 'A chave VAPID ainda não foi configurada.' };
  }
  if (!(await notificacoesSuportadas())) {
    return { ok: false, motivo: 'Este navegador não aceita notificações.' };
  }
  if (!uid) {
    return { ok: false, motivo: 'Faça login primeiro.' };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    return {
      ok: false,
      motivo:
        permissao === 'denied'
          ? 'Você bloqueou as notificações. Libere nas configurações do site.'
          : 'Permissão não concedida.',
    };
  }

  try {
    // Reaproveitamos o Service Worker do arcade em vez de registrar um
    // segundo só para o FCM — um SW a menos para manter em dia.
    const registro = await navigator.serviceWorker.ready;
    messaging = messaging || getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: CHAVE_VAPID,
      serviceWorkerRegistration: registro,
    });

    if (!token) return { ok: false, motivo: 'O navegador não devolveu um token.' };

    await salvarToken(uid, token);
    escutarPrimeiroPlano();
    return { ok: true };
  } catch (erro) {
    console.error('[notificacoes] falha ao ativar:', erro);
    return { ok: false, motivo: 'Não foi possível registrar este aparelho.' };
  }
}

/**
 * Se a permissão já foi dada antes, revalida o token silenciosamente.
 * Tokens do FCM podem ser trocados pelo navegador sem aviso; rodar isso a cada
 * abertura mantém o banco em dia.
 */
export async function revalidarToken(uid) {
  if (!uid || faltaConfigurar()) return;
  if (permissaoAtual() !== 'granted') return;
  if (!(await notificacoesSuportadas())) return;

  try {
    const registro = await navigator.serviceWorker.ready;
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: CHAVE_VAPID,
      serviceWorkerRegistration: registro,
    });
    if (token) await salvarToken(uid, token);
    escutarPrimeiroPlano();
  } catch (erro) {
    console.warn('[notificacoes] não deu para revalidar o token:', erro);
  }
}

async function salvarToken(uid, token) {
  const anterior = lerTokenLocal();

  // Trocou de token? apaga o antigo para não sobrar lixo no banco
  if (anterior && anterior !== token) {
    await remove(ref(db, `usuarios/${uid}/push/${anterior}`)).catch(() => {});
  }

  await set(ref(db, `usuarios/${uid}/push/${token}`), {
    criadoEm: serverTimestamp(),
    agente: (navigator.userAgent || '').slice(0, 120),
  });

  gravarTokenLocal(token);
}

/** Desliga as notificações neste aparelho (a permissão do navegador continua). */
export async function desativarNotificacoes(uid) {
  const token = lerTokenLocal();
  if (uid && token) {
    await remove(ref(db, `usuarios/${uid}/push/${token}`)).catch(() => {});
  }
  gravarTokenLocal('');
}

/** True se ESTE aparelho já está registrado. */
export function aparelhoRegistrado() {
  return permissaoAtual() === 'granted' && !!lerTokenLocal();
}

function lerTokenLocal() {
  try {
    return localStorage.getItem(CHAVE_TOKEN_LOCAL) || '';
  } catch {
    return '';
  }
}

function gravarTokenLocal(token) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN_LOCAL, token);
    else localStorage.removeItem(CHAVE_TOKEN_LOCAL);
  } catch {
    /* silencioso */
  }
}

/* -----------------------------------------------------------------------------
   MENSAGEM CHEGANDO COM O APP ABERTO
   -----------------------------------------------------------------------------
   Com o app em primeiro plano o sistema NÃO desenha a notificação — quem
   decide o que fazer é a página. Aqui avisamos quem estiver ouvindo, e o menu
   mostra uma tarja discreta no topo em vez de um pop-up do sistema.
----------------------------------------------------------------------------- */

const ouvintes = new Set();
let escutando = false;

/**
 * @param {(aviso: {titulo: string, corpo: string, tag: string}) => void} callback
 * @returns {() => void} cancela a inscrição
 */
export function onAvisoEmPrimeiroPlano(callback) {
  ouvintes.add(callback);
  return () => ouvintes.delete(callback);
}

function escutarPrimeiroPlano() {
  if (escutando || !messaging) return;
  escutando = true;

  onMessage(messaging, (payload) => {
    const dados = payload?.data || {};
    ouvintes.forEach((cb) =>
      cb({
        titulo: dados.titulo || 'JOSY ARCADE',
        corpo: dados.corpo || '',
        tag: dados.tag || 'geral',
      })
    );
  });
}
