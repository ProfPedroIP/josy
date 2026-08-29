/* Service Worker: cache offline e notificações.
   Ao publicar qualquer mudança, incremente a VERSAO abaixo — é ela que
   invalida o cache. Precisa ser igual à de src/js/versao.js.
   */

const VERSAO = '5.3.0';

const CACHE_APP = `josy-app-${VERSAO}`;
const CACHE_MIDIA = `josy-midia-${VERSAO}`;
const CACHE_EXTERNO = `josy-externo-${VERSAO}`;
const CACHES_ATUAIS = [CACHE_APP, CACHE_MIDIA, CACHE_EXTERNO];

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
  './src/js/versao.js',
  './src/js/notificacoes.js',
  './src/js/audio-chat.js',
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

const ARQUIVOS_MIDIA = [
  './assets/sounds/track.aac',
  './assets/sounds/cool.aac',
  './assets/sounds/excited.aac',
  './assets/sounds/happy.aac',
  './assets/sounds/click.aac',
  './assets/sounds/win.aac',
  './assets/sounds/lose.aac',
  './assets/sounds/laser.aac',
  './assets/sounds/explosion.aac',
  './assets/sounds/flap.wav',
  './assets/sounds/score.wav',
  './assets/sounds/hit.wav',
];

const DOMINIOS_AO_VIVO = [
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com',
  'identitytoolkit',
  'firebaseapp.com',
  'accounts.google.com',
];

const DOMINIOS_EXTERNOS = ['gstatic.com', 'fonts.googleapis.com'];

// Um arquivo por vez: com addAll, um único 404 derruba a instalação inteira.
async function encher(nomeCache, lista, rotulo) {
  const cache = await caches.open(nomeCache);
  const resultados = await Promise.allSettled(
    lista.map((url) => cache.add(new Request(url, { cache: 'reload' })))
  );
  const falharam = lista.filter((_, i) => resultados[i].status === 'rejected');
  if (falharam.length) console.warn(`[SW] ${rotulo}: não baixou`, falharam);
  return lista.length - falharam.length;
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const app = await encher(CACHE_APP, ARQUIVOS_APP, 'app');
      const midia = await encher(CACHE_MIDIA, ARQUIVOS_MIDIA, 'áudio');
      console.log(`[SW ${VERSAO}] instalado: ${app}/${ARQUIVOS_APP.length} do app, ${midia}/${ARQUIVOS_MIDIA.length} áudios.`);
    })()
  );
});

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
  // Firebase e login nunca passam pelo cache.
  if (ehAoVivo(url)) return;

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

// Páginas: rede primeiro, cache como reserva.
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

self.addEventListener('message', (evento) => {
  const dados = evento.data || {};

  if (dados.tipo === 'PULAR_ESPERA') {
    self.skipWaiting();
    return;
  }

  if (dados.tipo === 'VERSAO') {
    evento.ports?.[0]?.postMessage({ tipo: 'VERSAO', versao: VERSAO });
    return;
  }

  if (dados.tipo === 'COMPLETAR_MIDIA') {
    const porta = evento.ports?.[0];
    evento.waitUntil(completarMidia(porta));
  }
});

async function completarMidia(porta) {
  const cache = await caches.open(CACHE_MIDIA);
  const total = ARQUIVOS_MIDIA.length;
  let guardados = 0;

  for (const url of ARQUIVOS_MIDIA) {
    try {
      if (await cache.match(url)) guardados++;
      else {
        await cache.add(new Request(url, { cache: 'reload' }));
        guardados++;
      }
    } catch {}
  }

  porta?.postMessage({ tipo: 'CONCLUIDO', guardados, total });
}

// A function manda só "data": quem monta a notificação somos nós.
self.addEventListener('push', (evento) => {
  let bruto = {};
  try {
    bruto = evento.data?.json() ?? {};
  } catch {
    bruto = { corpo: evento.data?.text() || '' };
  }

  const dados = bruto.data || bruto;

  const titulo = dados.titulo || 'JOSY ARCADE';
  const opcoes = {
    body: dados.corpo || '',
    icon: './assets/images/icon-192.png',
    badge: './assets/images/icon-192.png',
    tag: dados.tag || 'josy-arcade',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: dados.url || './index.html' },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Resolve pelo escopo do Service Worker: o app não fica na raiz do domínio
// (profpedroip.github.io/josy/), então caminho com barra inicial daria 404.
function enderecoNoApp(caminho) {
  const limpo = String(caminho || 'index.html').replace(/^\/+/, '');
  return new URL(limpo, self.registration.scope).href;
}

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = enderecoNoApp(evento.notification.data?.url);

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const aba of abas) {
        // Compara pelo escopo: o domínio hospeda outros repositórios.
        if (aba.url.startsWith(self.registration.scope)) {
          await aba.focus();
          aba.postMessage({ tipo: 'NOTIFICACAO_ABERTA', url: destino });
          if ('navigate' in aba) await aba.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })()
  );
});
