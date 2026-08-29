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

   ⚠️  A VERSAO aqui e a de src/js/versao.js precisam ser IGUAIS.
       O menu avisa no console se estiverem diferentes.

   ESTRATÉGIAS
     Páginas HTML ....... rede primeiro, cache como reserva
                          (online ela sempre vê a versão mais nova)
     CSS / JS / imagens . cache primeiro
     Áudios ............. baixados JUNTO com o resto, na instalação
                          (com os arquivos em AAC o pacote ficou pequeno;
                           antes, em WAV/MP3, eram ~11 MB e valia adiar)
     Firebase / Google .. nunca passa pelo cache
   ============================================================================= */

const VERSAO = '5.3.0';

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

/* Todos os áudios. Agora entram na instalação, junto com o resto. */
const ARQUIVOS_MIDIA = [
  './assets/sounds/track.aac',       // menu
  './assets/sounds/cool.aac',        // Busca Estelar + Minado
  './assets/sounds/excited.aac',     // Guardião (os dois modos)
  './assets/sounds/happy.aac',       // Love Bird
  './assets/sounds/click.aac',
  './assets/sounds/win.aac',
  './assets/sounds/lose.aac',
  './assets/sounds/laser.aac',
  './assets/sounds/explosion.aac',
  './assets/sounds/flap.wav',        // Love Bird: pulo
  './assets/sounds/score.wav',       // Love Bird: ponto
  './assets/sounds/hit.wav',         // Love Bird: batida no cano
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
   INSTALAÇÃO — baixa o app inteiro, áudios inclusive
   -----------------------------------------------------------------------------
   cache.addAll() é tudo-ou-nada: se um único arquivo der 404, a instalação
   inteira falha e o app fica sem offline. Por isso cacheamos um a um com
   allSettled: um arquivo faltando não derruba o resto.
----------------------------------------------------------------------------- */

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

  if (dados.tipo === 'VERSAO') {
    evento.ports?.[0]?.postMessage({ tipo: 'VERSAO', versao: VERSAO });
    return;
  }

  // Rede de segurança: se a instalação pegou o app mas perdeu algum áudio
  // (rede oscilando), a página pode pedir para completar.
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
    } catch {
      /* arquivo ausente: segue em frente */
    }
  }

  porta?.postMessage({ tipo: 'CONCLUIDO', guardados, total });
}

/* -----------------------------------------------------------------------------
   NOTIFICAÇÕES PUSH
   -----------------------------------------------------------------------------
   A Cloud Function envia mensagens SÓ com o bloco `data`, sem `notification`.
   Isso faz o FCM entregar o pacote cru aqui em vez de desenhar a notificação
   sozinho — então somos nós que definimos texto, ícone e o que acontece ao
   tocar. De quebra, não precisamos carregar o SDK de messaging dentro do
   Service Worker: um arquivo a menos para baixar e nada que quebre offline.
----------------------------------------------------------------------------- */

self.addEventListener('push', (evento) => {
  let bruto = {};
  try {
    bruto = evento.data?.json() ?? {};
  } catch {
    bruto = { corpo: evento.data?.text() || '' };
  }

  // O FCM embrulha nossos campos dentro de "data"; outras origens mandam direto
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

/**
 * Monta o endereço final a partir do ESCOPO do Service Worker.
 *
 * Por que isso importa: no GitHub Pages de projeto o app não fica na raiz do
 * domínio, e sim em profpedroip.github.io/josy/. Um caminho com barra no
 * começo ('/index.html') significa "raiz do domínio" e levaria a
 * profpedroip.github.io/index.html — 404.
 *
 * Resolvendo contra o escopo, o mesmo código funciona na raiz, numa subpasta
 * ou num domínio próprio, sem nada escrito na mão.
 */
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

      // Traz o arcade para a frente em vez de abrir uma segunda cópia.
      // A comparação é pelo ESCOPO, não pelo domínio: profpedroip.github.io
      // hospeda todos os seus repositórios, e comparar só o domínio focaria a
      // aba de outro projeto seu.
      for (const aba of abas) {
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
