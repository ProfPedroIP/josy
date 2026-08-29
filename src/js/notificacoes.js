/* Notificações push (lado do navegador). */

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

// Firebase Console > Cloud Messaging > Certificados push da Web.
// É pública por natureza: pode ficar no repositório.
export const CHAVE_VAPID = 'BA4EINSXfz4oUnGWtE8BBXFzjCI6uK5COuSKdt_ZCSASJZcm4yjauTHq7rPPVWHiuxc39JtCgRj-TyJoFrOfsOk';

const CHAVE_TOKEN_LOCAL = 'josy-arcade:token-push';

let messaging = null;
let suportado = null;

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

export function permissaoAtual() {
  if (typeof Notification === 'undefined') return 'indisponivel';
  return Notification.permission;
}

export function faltaConfigurar() {
  return !CHAVE_VAPID || CHAVE_VAPID.startsWith('COLE_AQUI');
}

// Precisa ser chamada de dentro de um clique: pedido automático é ignorado.
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

  if (anterior && anterior !== token) {
    await remove(ref(db, `usuarios/${uid}/push/${anterior}`)).catch(() => {});
  }

  await set(ref(db, `usuarios/${uid}/push/${token}`), {
    criadoEm: serverTimestamp(),
    agente: (navigator.userAgent || '').slice(0, 120),
  });

  gravarTokenLocal(token);
}

export async function desativarNotificacoes(uid) {
  const token = lerTokenLocal();
  if (uid && token) {
    await remove(ref(db, `usuarios/${uid}/push/${token}`)).catch(() => {});
  }
  gravarTokenLocal('');
}

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
  } catch {}
}

const ouvintes = new Set();
let escutando = false;

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
