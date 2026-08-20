/* =============================================================================
   src/js/offline.js
   -----------------------------------------------------------------------------
   FUNCIONAMENTO OFFLINE DO JOSY ARCADE.

   Três responsabilidades:
     1. Guardar os recordes localmente, sempre — mesmo sem login e sem internet.
     2. Manter uma "caixa de saída" (outbox) das gravações que ainda não
        chegaram no Firebase, e reenviar quando a conexão voltar.
     3. Falar com o Service Worker (atualização de versão, download de mídia).

   Este arquivo NÃO importa Firebase. Ele só guarda intenções; quem sabe enviar
   é o firebase-config.js.

   POR QUE UMA CAIXA DE SAÍDA PRÓPRIA?
   O SDK do Realtime Database já tem fila offline, mas ela vive só na memória
   da aba. Se a Josy jogar no metrô e fechar o app antes de reconectar, a fila
   do SDK evapora. O localStorage sobrevive a fechar o app e reiniciar o
   celular.

   IDEMPOTÊNCIA (o ponto delicado)
   Reenviar é seguro só se aplicar a mesma operação duas vezes der o mesmo
   resultado que aplicar uma vez:
     - RECORDE  -> max(atual, novo). Idempotente por natureza. ✔
     - VITÓRIA  -> "total + 1" NÃO é idempotente. Por isso cada vitória vira um
                   ID único gravado como uma chave própria; regravar o mesmo ID
                   não muda nada. A contagem passa a ser o número de chaves. ✔
   ============================================================================= */

const CHAVE_RECORDES = 'josy-arcade:recordes';
const CHAVE_OUTBOX = 'josy-arcade:outbox';
const BUCKET_SEM_LOGIN = 'local';

/* -----------------------------------------------------------------------------
   1. ARMAZENAMENTO SEGURO
   -----------------------------------------------------------------------------
   localStorage lança exceção em modo privativo do Safari e quando a cota
   estoura. Nenhuma falha de armazenamento pode derrubar o jogo.
----------------------------------------------------------------------------- */

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

/* -----------------------------------------------------------------------------
   2. RECORDES LOCAIS
   -----------------------------------------------------------------------------
   Formato: { "<uid|local>": { "love_bird_max": 100, ... } }

   Serve para dois fins: mostrar a pontuação na tela de estatísticas mesmo sem
   internet, e não perder nada se o envio falhar.
----------------------------------------------------------------------------- */

/**
 * Guarda o recorde local se for maior que o já guardado.
 * @returns {boolean} true se era um recorde novo
 */
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

/** @returns {Object<string, number>} recordes locais do usuário */
export function recordesLocais(uid) {
  const tudo = ler(CHAVE_RECORDES, {});
  return { ...(tudo[BUCKET_SEM_LOGIN] || {}), ...(tudo[uid] || {}) };
}

/**
 * Move o que foi jogado antes do login para o balde do usuário.
 * Acontece quando a Josy abre um jogo direto pelo link, sem passar pelo menu.
 */
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

/* -----------------------------------------------------------------------------
   3. CAIXA DE SAÍDA
   -----------------------------------------------------------------------------
   Formato de cada item:
     { id, uid, tipo: 'recorde'|'vitoria', chave, pontos?, quando, tentativas }
----------------------------------------------------------------------------- */

const LIMITE_ITENS = 200;

function novoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function lerOutbox() {
  const itens = ler(CHAVE_OUTBOX, []);
  return Array.isArray(itens) ? itens : [];
}

/** @returns {number} quantidade de gravações esperando envio */
export function pendentes(uid) {
  const itens = lerOutbox();
  return uid ? itens.filter((i) => i.uid === uid).length : itens.length;
}

/**
 * Enfileira uma gravação.
 *
 * Recordes se sobrepõem: se já existe um recorde pendente do mesmo jogo,
 * fica só o maior — não faz sentido enviar 40, 80 e 120 do Love Bird.
 * Vitórias nunca se sobrepõem: cada uma tem seu ID e todas contam.
 */
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

  // Guarda de segurança: descarta os mais antigos se algo der muito errado
  while (itens.length > LIMITE_ITENS) itens.shift();

  gravar(CHAVE_OUTBOX, itens);
  return item.id;
}

/** Remove um item confirmado pelo servidor. */
export function remover(id) {
  gravar(
    CHAVE_OUTBOX,
    lerOutbox().filter((i) => i.id !== id)
  );
}

/** Marca uma tentativa que falhou, para diagnóstico. */
export function marcarFalha(id) {
  const itens = lerOutbox();
  const item = itens.find((i) => i.id === id);
  if (!item) return;
  item.tentativas = (item.tentativas || 0) + 1;
  item.ultimaFalha = Date.now();
  gravar(CHAVE_OUTBOX, itens);
}

/**
 * Reatribui itens sem dono ao usuário que acabou de logar.
 * Cobre o caso de jogar offline antes de o Firebase resolver a sessão.
 */
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

/* -----------------------------------------------------------------------------
   4. ESTADO DA CONEXÃO
----------------------------------------------------------------------------- */

const ouvintesConexao = new Set();

export function estaOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * Avisa quando a conexão muda. Dispara na hora com o estado atual.
 * @returns {() => void} cancela a inscrição
 */
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

/* -----------------------------------------------------------------------------
   5. UTILIDADE DE TEMPO LIMITE
   -----------------------------------------------------------------------------
   Offline, uma escrita no Realtime Database não rejeita: ela fica pendente
   para sempre. Sem tempo limite, o await trava e a caixa de saída nunca é
   processada.
----------------------------------------------------------------------------- */

export function comTempoLimite(promessa, ms = 8000) {
  let timer;
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error('tempo limite')), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

/* -----------------------------------------------------------------------------
   6. SERVICE WORKER
----------------------------------------------------------------------------- */

let registroSW = null;

/**
 * Registra o Service Worker e avisa quando houver versão nova esperando.
 * @param {(aplicar: () => void) => void} [aoAtualizar]
 */
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

    // Já havia uma versão nova esperando quando a página abriu
    if (registroSW.waiting && navigator.serviceWorker.controller) {
      oferecer(registroSW.waiting);
    }

    registroSW.addEventListener('updatefound', () => {
      const novo = registroSW.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        // 'installed' + já existe controller = é atualização, não primeira visita
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          oferecer(novo);
        }
      });
    });

    // Quando o novo assume o controle, recarrega uma única vez
    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  });
}

/**
 * Manda o Service Worker baixar os áudios para uso offline.
 * @param {(feitos: number, total: number) => void} [aoProgredir]
 * @returns {Promise<{ok: boolean, feitos: number, total: number}>}
 */
export function baixarMidiaOffline(aoProgredir) {
  return new Promise((resolver) => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) {
      resolver({ ok: false, feitos: 0, total: 0 });
      return;
    }

    const canal = new MessageChannel();
    canal.port1.onmessage = (evento) => {
      const dados = evento.data || {};
      if (dados.tipo === 'PROGRESSO') {
        aoProgredir?.(dados.feitos, dados.total);
        return;
      }
      if (dados.tipo === 'CONCLUIDO') {
        resolver({ ok: true, feitos: dados.feitos, total: dados.total });
      }
    };

    navigator.serviceWorker.controller.postMessage({ tipo: 'BAIXAR_MIDIA' }, [canal.port2]);
    setTimeout(() => resolver({ ok: false, feitos: 0, total: 0 }), 180000);
  });
}
