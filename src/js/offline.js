/* Recordes locais e fila de envio, para jogar sem internet. */

// A fila mora no localStorage porque a fila do SDK do Firebase morre
// quando o app fecha.
const CHAVE_RECORDES = 'josy-arcade:recordes';
const CHAVE_OUTBOX = 'josy-arcade:outbox';
const BUCKET_SEM_LOGIN = 'local';

function ler(chave, padrao) {
  try {
    const cru = localStorage.getItem(chave);
    return cru ? JSON.parse(cru) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function guardarRecordeLocal(uid, chave, pontos) {
  const bucket = uid || BUCKET_SEM_LOGIN;
  const tudo = ler(CHAVE_RECORDES, {});
  const meus = tudo[bucket] || {};
  if (pontos <= (meus[chave] || 0)) return false;
  meus[chave] = pontos;
  tudo[bucket] = meus;
  gravar(CHAVE_RECORDES, tudo);
  return true;
}

export function recordesLocais(uid) {
  const tudo = ler(CHAVE_RECORDES, {});
  return { ...(tudo[BUCKET_SEM_LOGIN] || {}), ...(tudo[uid] || {}) };
}

export function migrarRecordesLocais(uid) {
  if (!uid) return;
  const tudo = ler(CHAVE_RECORDES, {});
  const soltos = tudo[BUCKET_SEM_LOGIN];
  if (!soltos) return;
  const meus = tudo[uid] || {};
  for (const [chave, valor] of Object.entries(soltos)) {
    if (valor > (meus[chave] || 0)) meus[chave] = valor;
  }
  tudo[uid] = meus;
  delete tudo[BUCKET_SEM_LOGIN];
  gravar(CHAVE_RECORDES, tudo);
}

const LIMITE_ITENS = 200;

function novoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function lerOutbox() {
  const itens = ler(CHAVE_OUTBOX, []);
  return Array.isArray(itens) ? itens : [];
}

export function pendentes(uid) {
  const itens = lerOutbox();
  return uid ? itens.filter((i) => i.uid === uid).length : itens.length;
}

// Recordes se fundem (fica o maior). Vitórias nunca: cada uma tem id próprio.
export function enfileirar({ uid, tipo, chave, pontos = null }) {
  const itens = lerOutbox();

  if (tipo === 'recorde') {
    const existente = itens.find(
      (i) => i.tipo === 'recorde' && i.chave === chave && i.uid === uid
    );
    if (existente) {
      if (pontos > existente.pontos) {
        existente.pontos = pontos;
        existente.quando = Date.now();
        existente.tentativas = 0;
      }
      gravar(CHAVE_OUTBOX, itens);
      return existente.id;
    }
  }

  const item = {
    id: novoId(),
    uid,
    tipo,
    chave,
    pontos,
    quando: Date.now(),
    tentativas: 0,
  };
  itens.push(item);

  while (itens.length > LIMITE_ITENS) itens.shift();

  gravar(CHAVE_OUTBOX, itens);
  return item.id;
}

export function remover(id) {
  gravar(
    CHAVE_OUTBOX,
    lerOutbox().filter((i) => i.id !== id)
  );
}

export function marcarFalha(id) {
  const itens = lerOutbox();
  const item = itens.find((i) => i.id === id);
  if (!item) return;
  item.tentativas = (item.tentativas || 0) + 1;
  item.ultimaFalha = Date.now();
  gravar(CHAVE_OUTBOX, itens);
}

export function adotarItensOrfaos(uid) {
  if (!uid) return;
  const itens = lerOutbox();
  let mudou = false;
  itens.forEach((i) => {
    if (!i.uid) {
      i.uid = uid;
      mudou = true;
    }
  });
  if (mudou) gravar(CHAVE_OUTBOX, itens);
}

const ouvintesConexao = new Set();

export function estaOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function onConexao(callback) {
  ouvintesConexao.add(callback);
  callback(estaOnline());
  return () => ouvintesConexao.delete(callback);
}

function avisarConexao() {
  const online = estaOnline();
  ouvintesConexao.forEach((cb) => cb(online));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', avisarConexao);
  window.addEventListener('offline', avisarConexao);
}

// Offline uma escrita no Firebase fica pendente para sempre; sem teto o await trava.
export function comTempoLimite(promessa, ms = 8000) {
  let timer;
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error('tempo limite')), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

let registroSW = null;

// Avisa quando há versão nova esperando e recarrega uma única vez ao trocar.
export function registrarServiceWorker(aoAtualizar) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      registroSW = await navigator.serviceWorker.register('sw.js');
    } catch {
      return;
    }

    const oferecer = (worker) => {
      if (!worker || !aoAtualizar) return;
      aoAtualizar(() => {
        worker.postMessage({ tipo: 'PULAR_ESPERA' });
      });
    };

    if (registroSW.waiting && navigator.serviceWorker.controller) {
      oferecer(registroSW.waiting);
    }

    registroSW.addEventListener('updatefound', () => {
      const novo = registroSW.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          oferecer(novo);
        }
      });
    });

    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  });
}

export function versaoDoServiceWorker() {
  return perguntarAoSW({ tipo: 'VERSAO' }, 3000).then((r) => r?.versao ?? null);
}

export function completarMidiaOffline() {
  return perguntarAoSW({ tipo: 'COMPLETAR_MIDIA' }, 120000);
}

function perguntarAoSW(mensagem, msLimite) {
  return new Promise((resolver) => {
    const controlador = navigator?.serviceWorker?.controller;
    if (!controlador) {
      resolver(null);
      return;
    }
    const canal = new MessageChannel();
    const timer = setTimeout(() => resolver(null), msLimite);
    canal.port1.onmessage = (evento) => {
      clearTimeout(timer);
      resolver(evento.data || null);
    };
    controlador.postMessage(mensagem, [canal.port2]);
  });
}
