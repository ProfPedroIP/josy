/* =============================================================================
   sw.js — Service Worker do Josy Arcade
   -----------------------------------------------------------------------------
   Faz o arcade funcionar sem internet e ser instalável como aplicativo.

   ANTES: este arquivo tinha só um listener de fetch vazio (o mínimo para o
   Chrome considerar o site instalável) e nem era registrado por página nenhuma.
   Nada ficava guardado: sem rede, tela branca.

   ⚠️  IMPORTANTE — LEIA ANTES DE PUBLICAR QUALQUER MUDANÇA ⚠️
   Sempre que você alterar um HTML, CSS ou JS do projeto, MUDE A LINHA `VERSAO`
   abaixo (v1 -> v2 -> v3...). É isso que faz o celular da Josy baixar a versão
   nova. Sem trocar a versão, ela continua vendo o site antigo mesmo depois do
   deploy, porque tudo vem do cache.

   ESTRATÉGIAS
     Páginas HTML ....... rede primeiro, cache como reserva
                          (online ela sempre vê a versão mais nova)
     CSS / JS / imagens . cache primeiro
     Áudios ............. cache primeiro, baixados sob demanda
                          (são ~11 MB; baixar tudo na instalação gastaria o
                           plano de dados dela sem necessidade)
     Firebase / Google .. nunca passa pelo cache
   ============================================================================= */

const VERSAO = 'v1';

const CACHE_APP = `josy-app-${VERSAO}`;
const CACHE_MIDIA = `josy-midia-${VERSAO}`;
const CACHE_EXTERNO = `josy-externo-${VERSAO}`;
const CACHES_ATUAIS = [CACHE_APP, CACHE_MIDIA, CACHE_EXTERNO];

/* O esqueleto do app: leve, baixado na instalação. */
const ARQUIVOS_APP = [
  './',
  './index.html',
  './love_bird.html',
  './guerra_estelar.html',
  './campo_minado.html',
  './batalha_estelar.html',
  './manifest.json',
  './src/css/arcade-theme.css',
  './src/js/utils.js',
  './src/js/offline.js',
  './src/js/firebase-config.js',
  './src/js/games/menu.js',
  './src/js/games/love-bird.js',
  './src/js/games/guerra-estelar.js',
  './src/js/games/minado.js',
  './src/js/games/busca-estelar.js',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/guerra_estelar_photo.png',
];

/* Os áudios: pesados, baixados só quando ela tocar em "BAIXAR OFFLINE". */
const ARQUIVOS_MIDIA = [
  './assets/sounds/track.wav',
  './assets/sounds/click.wav',
  './assets/sounds/win.wav',
  './assets/sounds/lose.wav',
  './assets/sounds/laser.wav',
  './assets/sounds/explosao.wav',
  './assets/sounds/guerra_estelar.mp3',
  './assets/sounds/campo_minado.mp3',
  './assets/sounds/batalha_estelar.mp3',
  './assets/sounds/love_bird.mp3',
  './assets/sounds/pulo.wav',
  './assets/sounds/ponto.wav',
];

/* Domínios que nunca podem ser servidos do cache: precisam falar com o
   servidor de verdade para autenticar e sincronizar. */
const DOMINIOS_AO_VIVO = [
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com',
  'identitytoolkit',
  'firebaseapp.com',
  'accounts.google.com',
];

/* Recursos externos que valem cachear para o app abrir offline. */
const DOMINIOS_EXTERNOS = ['gstatic.com', 'fonts.googleapis.com'];

/* -----------------------------------------------------------------------------
   INSTALAÇÃO
   -----------------------------------------------------------------------------
   cache.addAll() é tudo-ou-nada: se um único arquivo der 404, a instalação
   inteira falha e o app fica sem offline. Como love_bird.mp3, pulo.wav e
   ponto.wav podem ainda não existir no repositório, cacheamos um por um e
   toleramos as faltas.
----------------------------------------------------------------------------- */

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      const resultados = await Promise.allSettled(
        ARQUIVOS_APP.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      );
      const falhas = resultados.filter((r) => r.status === 'rejected').length;
      if (falhas) console.warn(`[SW] ${falhas} arquivo(s) do app não puderam ser cacheados.`);
    })()
  );
});

/* -----------------------------------------------------------------------------
   ATIVAÇÃO — limpa versões antigas
----------------------------------------------------------------------------- */

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((n) => n.startsWith('josy-') && !CACHES_ATUAIS.includes(n))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/* -----------------------------------------------------------------------------
   INTERCEPTAÇÃO DE REQUISIÇÕES
----------------------------------------------------------------------------- */

function ehAoVivo(url) {
  return DOMINIOS_AO_VIVO.some((d) => url.hostname.includes(d));
}

function ehExterno(url) {
  return DOMINIOS_EXTERNOS.some((d) => url.hostname.includes(d));
}

function ehMidia(url) {
  return /\.(mp3|wav|ogg|m4a)$/i.test(url.pathname);
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (ehAoVivo(url)) return; // Firebase e login vão direto para a rede

  if (request.mode === 'navigate') {
    evento.respondWith(redePrimeiro(request));
    return;
  }

  if (ehExterno(url)) {
    evento.respondWith(cachePrimeiro(request, CACHE_EXTERNO));
    return;
  }

  if (url.origin !== self.location.origin) return;

  evento.respondWith(cachePrimeiro(request, ehMidia(url) ? CACHE_MIDIA : CACHE_APP));
});

/** Busca na rede; se falhar, entrega o que estiver no cache. */
async function redePrimeiro(request) {
  const cache = await caches.open(CACHE_APP);
  try {
    const resposta = await fetch(request);
    if (resposta && resposta.ok) cache.put(request, resposta.clone());
    return resposta;
  } catch {
    const guardado = await cache.match(request);
    if (guardado) return guardado;

    const inicial = await cache.match('./index.html');
    if (inicial) return inicial;

    return new Response('Sem conexão e sem cópia offline desta página.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Entrega do cache na hora; busca na rede se não tiver. */
async function cachePrimeiro(request, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(request);
  if (guardado) return guardado;

  try {
    const resposta = await fetch(request);
    if (resposta && resposta.ok) cache.put(request, resposta.clone());
    return resposta;
  } catch (erro) {
    const aproximado = await cache.match(request, { ignoreSearch: true });
    if (aproximado) return aproximado;
    throw erro;
  }
}

/* -----------------------------------------------------------------------------
   MENSAGENS VINDAS DA PÁGINA
----------------------------------------------------------------------------- */

self.addEventListener('message', (evento) => {
  const dados = evento.data || {};

  if (dados.tipo === 'PULAR_ESPERA') {
    self.skipWaiting();
    return;
  }

  if (dados.tipo === 'BAIXAR_MIDIA') {
    const porta = evento.ports?.[0];
    evento.waitUntil(baixarMidia(porta));
  }
});

async function baixarMidia(porta) {
  const cache = await caches.open(CACHE_MIDIA);
  const total = ARQUIVOS_MIDIA.length;
  let feitos = 0;
  let guardados = 0;

  for (const url of ARQUIVOS_MIDIA) {
    try {
      const jaTem = await cache.match(url);
      if (jaTem) guardados++;
      else {
        await cache.add(new Request(url, { cache: 'reload' }));
        guardados++;
      }
    } catch {
      // arquivo ausente no repositório: segue em frente
    }
    feitos++;
    porta?.postMessage({ tipo: 'PROGRESSO', feitos, total });
  }

  porta?.postMessage({ tipo: 'CONCLUIDO', feitos: guardados, total });
}
