/* =============================================================================
   src/js/games/menu.js
   -----------------------------------------------------------------------------
   Hub do Josy Arcade: login, menu, chat global, placar, brincadeira da
   "CONEXÃO ESTELAR" e a camada de estado offline.
   ============================================================================= */

import { initViewportFix, AudioManager, som, limitar, $, $$ } from '../utils.js';
import { VERSAO, novidadesAtuais, deveMostrarNovidades, marcarNovidadesVistas } from '../versao.js';
import {
  notificacoesSuportadas,
  permissaoAtual,
  faltaConfigurar,
  ativarNotificacoes,
  desativarNotificacoes,
  revalidarToken,
  aparelhoRegistrado,
  onAvisoEmPrimeiroPlano,
} from '../notificacoes.js';
import * as Voz from '../audio-chat.js';
import {
  onUsuario,
  entrarComGoogle,
  sair,
  nomeCurto,
  salvarNome,
  observarEstatisticas,
  carregarPlacarGlobal,
  observarChat,
  enviarMensagem,
  enviarAudio,
  marcarMensagensComoLidas,
  USUARIOS_AUTORIZADOS,
  registrarServiceWorker,
  versaoDoServiceWorker,
  onConexao,
  onPendencias,
  sincronizar,
  estaOnline,
} from '../firebase-config.js';

initViewportFix();

/* -----------------------------------------------------------------------------
   SERVICE WORKER + AVISO DE VERSÃO NOVA
----------------------------------------------------------------------------- */

registrarServiceWorker((aplicarAtualizacao) => {
  const barra = $('#update-bar');
  if (!barra) return;
  barra.style.display = 'flex';
  $('#btn-atualizar').addEventListener('click', aplicarAtualizacao, { once: true });
});

// Protege contra o erro clássico: publicar sem trocar a VERSAO do sw.js
versaoDoServiceWorker().then((doSW) => {
  if (doSW && doSW !== VERSAO) {
    console.warn(
      `[Josy Arcade] A versão do código é ${VERSAO} mas o Service Worker está em ${doSW}. ` +
        'Atualize a constante VERSAO no sw.js e publique de novo.'
    );
  }
});

/* -----------------------------------------------------------------------------
   TELA DE NOVIDADES
   -----------------------------------------------------------------------------
   Abre sozinha quando a versão guardada no aparelho é diferente da atual —
   ou seja, logo depois de atualizar. Nunca na primeira instalação.
----------------------------------------------------------------------------- */

function montarNovidades() {
  const dados = novidadesAtuais();
  if (!dados) return false;

  $('#novidades-versao').textContent = `VERSÃO ${dados.versao}`;
  $('#novidades-titulo').textContent = dados.titulo;

  const lista = $('#novidades-lista');
  lista.innerHTML = '';
  dados.itens.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item.texto;
    if (item.destaque) li.className = 'novidade-destaque';
    lista.appendChild(li);
  });
  return true;
}

function abrirNovidades() {
  if (!montarNovidades()) return;
  $('#novidades-modal').style.display = 'flex';
}

function fecharNovidades() {
  $('#novidades-modal').style.display = 'none';
  marcarNovidadesVistas();
}

if (deveMostrarNovidades()) abrirNovidades();

/* -----------------------------------------------------------------------------
   ÁUDIO
----------------------------------------------------------------------------- */

const audio = new AudioManager({ musica: som('track.aac'), volumeMusica: 1 });
audio.ligarBotao('#btn-sound', { ligado: '🔊 SOM ON', desligado: '🔇 SOM OFF' });
audio.tocarMusica();

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

let meuUid = '';
let meuNome = '';
let chatAberto = false;
let cancelarChat = null;

/* -----------------------------------------------------------------------------
   INDICADOR DE CONEXÃO E FILA
----------------------------------------------------------------------------- */

let online = estaOnline();
let naFila = 0;

function pintarStatus() {
  const selo = $('#status-conexao');
  if (!selo) return;

  if (!online) {
    selo.style.display = 'block';
    selo.className = 'status-selo status-offline';
    selo.innerText = naFila > 0 ? `OFFLINE · ${naFila} P/ ENVIAR` : 'OFFLINE';
    return;
  }

  if (naFila > 0) {
    selo.style.display = 'block';
    selo.className = 'status-selo status-sync';
    selo.innerText = `SINCRONIZANDO · ${naFila}`;
    return;
  }

  selo.style.display = 'none';
}

onConexao((estaOn) => {
  online = estaOn;
  $('#btn-notificacoes').addEventListener('click', alternarNotificacoes);
$('#btn-gravar').addEventListener('click', alternarGravacao);
$('#btn-descartar-voz').addEventListener('click', () => Voz.descartar());

if (!Voz.gravacaoSuportada()) $('#btn-gravar').style.display = 'none';
Voz.onMudanca(pintarGravacao);

// Tocar na notificação com o app aberto: abre o chat direto
navigator.serviceWorker?.addEventListener?.('message', (evento) => {
  if (evento.data?.tipo === 'NOTIFICACAO_ABERTA' && evento.data.url?.includes('chat')) {
    alternarChat(true);
  }
});
if (new URLSearchParams(window.location.search).get('abrir') === 'chat') {
  onUsuario((u) => {
    if (u) setTimeout(() => alternarChat(true), 400);
  });
}

$('#btn-fechar-novidades').addEventListener('click', fecharNovidades);
$('#link-novidades').addEventListener('click', abrirNovidades);

$('#rodape-versao').textContent = `v${VERSAO}`;

pintarStatus();
  if (estaOn) sincronizar();
});

onPendencias((n) => {
  naFila = n;
  $('#btn-notificacoes').addEventListener('click', alternarNotificacoes);
$('#btn-gravar').addEventListener('click', alternarGravacao);
$('#btn-descartar-voz').addEventListener('click', () => Voz.descartar());

if (!Voz.gravacaoSuportada()) $('#btn-gravar').style.display = 'none';
Voz.onMudanca(pintarGravacao);

// Tocar na notificação com o app aberto: abre o chat direto
navigator.serviceWorker?.addEventListener?.('message', (evento) => {
  if (evento.data?.tipo === 'NOTIFICACAO_ABERTA' && evento.data.url?.includes('chat')) {
    alternarChat(true);
  }
});
if (new URLSearchParams(window.location.search).get('abrir') === 'chat') {
  onUsuario((u) => {
    if (u) setTimeout(() => alternarChat(true), 400);
  });
}

$('#btn-fechar-novidades').addEventListener('click', fecharNovidades);
$('#link-novidades').addEventListener('click', abrirNovidades);

$('#rodape-versao').textContent = `v${VERSAO}`;

pintarStatus();
});

/* -----------------------------------------------------------------------------
   NAVEGAÇÃO ENTRE TELAS
----------------------------------------------------------------------------- */

function mudarInterface(tela) {
  const fliperama = $('#game-content');
  const pergunta = $('#pergunta-content');
  const gatilhoChat = $('#chat-trigger');
  const btnNao = $('#btn-nao');

  if (tela === 'pergunta') {
    fliperama.style.display = 'none';
    pergunta.style.display = 'flex';
    gatilhoChat.style.display = 'none';
    btnNao.style.position = 'absolute';
    btnNao.style.right = '10px';
    btnNao.style.top = '';
    btnNao.style.left = '';
    return;
  }

  fliperama.style.display = 'flex';
  pergunta.style.display = 'none';
  if ($('#profile-pic').style.display === 'block' && podeVerChat()) {
    gatilhoChat.style.display = 'block';
  }
}

function mostrarPopup(abrir) {
  $('#glitch-popup').style.display = abrir ? 'flex' : 'none';
}

/* -----------------------------------------------------------------------------
   BRINCADEIRA DO BOTÃO "NÃO"
----------------------------------------------------------------------------- */

const btnNao = $('#btn-nao');
const appWrapper = $('#app-wrapper');

/**
 * Sorteia uma posição nova para o botão NÃO, SEMPRE dentro da área visível.
 *
 * O bug antigo: a conta não tinha piso em zero. Quando a largura disponível
 * ficava menor que a do botão (celular estreito), o resultado dava negativo e
 * ele ia parar atrás da borda do gabinete, que tem overflow:hidden — some da
 * tela e a brincadeira perde a graça.
 *
 * A MARGEM também mantém o botão longe das quinas, e o topo é protegido para
 * ele não cobrir a foto de perfil e o botão de som.
 */
const MARGEM = 12;
const ZONA_MORTA_TOPO = 85; // altura ocupada pelos controles do topo

function desviar() {
  const larguraBotao = btnNao.offsetWidth || 120;
  const alturaBotao = btnNao.offsetHeight || 48;

  const maxX = Math.max(MARGEM, appWrapper.clientWidth - larguraBotao - MARGEM);
  const maxY = Math.max(ZONA_MORTA_TOPO, appWrapper.clientHeight - alturaBotao - MARGEM);

  const x = limitar(MARGEM + Math.random() * (maxX - MARGEM), MARGEM, maxX);
  const y = limitar(
    ZONA_MORTA_TOPO + Math.random() * (maxY - ZONA_MORTA_TOPO),
    ZONA_MORTA_TOPO,
    maxY
  );

  btnNao.style.position = 'absolute';
  btnNao.style.right = 'auto';
  btnNao.style.left = `${Math.round(x)}px`;
  btnNao.style.top = `${Math.round(y)}px`;
}

// Se a tela girar ou mudar de tamanho, traz o botão de volta para dentro
window.addEventListener('resize', () => {
  if ($('#pergunta-content').style.display === 'flex' && btnNao.style.left) desviar();
});

btnNao.addEventListener('mouseenter', desviar);
btnNao.addEventListener('touchstart', (e) => {
  e.preventDefault();
  desviar();
});

/* -----------------------------------------------------------------------------
   AUTENTICAÇÃO
----------------------------------------------------------------------------- */

function podeVerChat() {
  return USUARIOS_AUTORIZADOS.includes($('#profile-pic').dataset.email || '');
}

onUsuario((user) => {
  const naPergunta = $('#pergunta-content').style.display === 'flex';

  if (!user) {
    $('#login-screen').style.display = 'flex';
    $('#game-content').style.display = 'none';
    $('#pergunta-content').style.display = 'none';
    $('#profile-pic').style.display = 'none';
    $('#chat-trigger').style.display = 'none';
    cancelarChat?.();
    cancelarChat = null;
    return;
  }

  meuUid = user.uid;
  meuNome = nomeCurto(user);

  $('#login-screen').style.display = 'none';
  if (!naPergunta) $('#game-content').style.display = 'flex';

  const foto = $('#profile-pic');
  foto.style.display = 'block';
  foto.src = user.photoURL || '';
  foto.dataset.email = user.email || '';

  $('#player-name-title').innerText = meuNome;
  $('#modal-profile-pic').src = user.photoURL || '';

  salvarNome(user.uid, meuNome);
  iniciarEstatisticas(user.uid);
  carregarPlacar();

  // Tokens do FCM mudam sozinhos de vez em quando; revalidar a cada abertura
  // mantém o banco em dia sem incomodar ninguém.
  revalidarToken(user.uid);
  pintarBotaoNotificacao();

  if (podeVerChat() && !naPergunta) {
    $('#chat-trigger').style.display = 'block';
    if (!cancelarChat) cancelarChat = iniciarChat();
  }
});

/* -----------------------------------------------------------------------------
   ESTATÍSTICAS E PLACAR
----------------------------------------------------------------------------- */

function iniciarEstatisticas(uid) {
  const corpo = $('#stats-body');
  observarEstatisticas(uid, (linhas) => {
    corpo.innerHTML = '';
    linhas.forEach(({ jogo, valor, apenasLocal }) => {
      const tr = document.createElement('tr');
      // O • marca pontuação feita offline que ainda não subiu
      const marca = apenasLocal ? ' <span class="marca-local" title="ainda não sincronizado">•</span>' : '';
      tr.innerHTML =
        `<td>${jogo.rotulo}</td>` +
        `<td style="text-align:right" class="score-indiv">${valor}${jogo.sufixo}${marca}</td>`;
      corpo.appendChild(tr);
    });
  });
}

async function carregarPlacar() {
  const corpo = $('#leaderboard-body');
  const { linhas, online: temRede } = await carregarPlacarGlobal();
  corpo.innerHTML = '';

  if (!temRede) {
    corpo.innerHTML =
      '<tr><td colspan="3" style="text-align:center; color:#ffd700; padding:15px;">' +
      'SEM CONEXÃO<br><span style="font-size:6px;">O placar geral precisa de internet</span>' +
      '</td></tr>';
    return;
  }

  linhas.forEach(({ jogo, lider, valor, empate }) => {
    let classe = '';
    if (valor > 0) classe = empate ? 'score-draw' : lider === meuNome ? 'score-win' : 'score-lose';
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${jogo.rotulo}</td>` +
      `<td style="color:#ff00ff">${lider}</td>` +
      `<td style="text-align:right" class="${classe}">${valor}${jogo.sufixo}</td>`;
    corpo.appendChild(tr);
  });
}

/* -----------------------------------------------------------------------------
   CHAT GLOBAL
----------------------------------------------------------------------------- */

function iniciarChat() {
  const container = $('#chat-messages');

  return observarChat(meuUid, (msgs, temNaoLida) => {
    container.innerHTML = '';

    msgs.forEach((m) => {
      const div = document.createElement('div');
      div.className = `msg ${m.souEu ? 'msg-me' : 'msg-other'}`;

      const autor = document.createElement('span');
      autor.className = 'msg-info';
      autor.textContent = m.nome || '';

      // Corpo: texto puro ou player de áudio
      const corpo =
        m.tipo === 'audio' && m.audioUrl
          ? montarPlayer(m.audioUrl, m.duracao)
          : document.createTextNode(m.texto || '');

      const rodape = document.createElement('div');
      rodape.className = 'msg-footer';

      const hora = document.createElement('span');
      hora.className = 'msg-time';
      hora.textContent = m.timestamp
        ? new Date(m.timestamp).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      rodape.appendChild(hora);

      if (m.souEu && m.lida === true) {
        const visto = document.createElement('span');
        visto.className = 'msg-status-neon';
        visto.textContent = '✓';
        rodape.appendChild(visto);
      }

      div.append(autor, corpo, rodape);
      container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;

    const naPergunta = $('#pergunta-content').style.display === 'flex';
    $('#chat-notif').style.display =
      !chatAberto && temNaoLida && !naPergunta ? 'block' : 'none';
  });
}

/**
 * Balão de áudio: botão de play e o tempo.
 * O <audio> fica com preload="none" de propósito — senão a lista inteira de
 * recados começaria a baixar sozinha toda vez que o chat abre.
 */
function montarPlayer(url, duracao) {
  const caixa = document.createElement('span');
  caixa.className = 'audio-msg';

  const som = new Audio(url);
  som.preload = 'none';

  const botao = document.createElement('button');
  botao.className = 'audio-play';
  botao.textContent = '▶';

  const tempo = document.createElement('span');
  tempo.className = 'audio-tempo';
  tempo.textContent = Voz.formatarTempo(duracao || 0);

  botao.addEventListener('click', () => {
    if (som.paused) {
      // Pausa qualquer outro recado que esteja tocando
      document.querySelectorAll('.audio-play.tocando').forEach((b) => b.click());
      som.play().catch(() => {
        tempo.textContent = 'ERRO';
      });
    } else {
      som.pause();
      som.currentTime = 0;
    }
  });

  som.addEventListener('play', () => {
    botao.textContent = '❚❚';
    botao.classList.add('tocando');
  });
  const encerrar = () => {
    botao.textContent = '▶';
    botao.classList.remove('tocando');
    tempo.textContent = Voz.formatarTempo(duracao || 0);
  };
  som.addEventListener('pause', encerrar);
  som.addEventListener('ended', encerrar);
  som.addEventListener('timeupdate', () => {
    if (!som.paused) tempo.textContent = Voz.formatarTempo(som.currentTime);
  });

  caixa.append(botao, tempo);
  return caixa;
}

/* -----------------------------------------------------------------------------
   NOTIFICAÇÕES
----------------------------------------------------------------------------- */

async function pintarBotaoNotificacao() {
  const btn = $('#btn-notificacoes');
  if (!btn) return;

  if (faltaConfigurar() || !(await notificacoesSuportadas())) {
    btn.style.display = 'none';
    return;
  }

  btn.style.display = 'block';
  const permissao = permissaoAtual();

  if (permissao === 'denied') {
    btn.textContent = 'NOTIFICAÇÕES BLOQUEADAS';
    btn.disabled = true;
    btn.classList.remove('ligado');
    return;
  }

  btn.disabled = false;
  const ligado = aparelhoRegistrado();
  btn.textContent = ligado ? '🔔 NOTIFICAÇÕES LIGADAS' : '🔕 ATIVAR NOTIFICAÇÕES';
  btn.classList.toggle('ligado', ligado);
}

async function alternarNotificacoes() {
  const btn = $('#btn-notificacoes');
  if (aparelhoRegistrado()) {
    await desativarNotificacoes(meuUid);
    await pintarBotaoNotificacao();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'PEDINDO PERMISSÃO...';
  const r = await ativarNotificacoes(meuUid);
  btn.disabled = false;

  if (!r.ok) {
    btn.textContent = r.motivo.toUpperCase().slice(0, 34);
    setTimeout(pintarBotaoNotificacao, 3500);
    return;
  }
  await pintarBotaoNotificacao();
}

/** Tarja discreta quando chega mensagem com o app já aberto. */
onAvisoEmPrimeiroPlano(({ titulo, corpo }) => {
  const tarja = $('#aviso-topo');
  if (!tarja) return;
  tarja.textContent = `${titulo}: ${corpo}`;
  tarja.style.display = 'block';
  clearTimeout(tarja._timer);
  tarja._timer = setTimeout(() => {
    tarja.style.display = 'none';
  }, 5000);
});

/* -----------------------------------------------------------------------------
   GRAVAÇÃO DE RECADO DE VOZ
----------------------------------------------------------------------------- */

function pintarGravacao({ estado, segundos, duracao, url }) {
  const painel = $('#voz-painel');
  const btnGravar = $('#btn-gravar');
  const status = $('#voz-status');
  const player = $('#voz-preview');
  const entrada = $('#chat-input');

  btnGravar.classList.toggle('gravando', estado === 'gravando');

  if (estado === 'parado') {
    painel.style.display = 'none';
    btnGravar.textContent = '🎤';
    btnGravar.disabled = false;
    entrada.disabled = false;
    player.removeAttribute('src');
    return;
  }

  painel.style.display = 'flex';
  entrada.disabled = true;

  if (estado === 'gravando') {
    btnGravar.textContent = '⏹';
    btnGravar.disabled = false;
    player.style.display = 'none';
    const restam = Voz.LIMITE_SEGUNDOS - segundos;
    status.textContent = `● GRAVANDO ${Voz.formatarTempo(segundos)}${restam <= 10 ? `  (${restam}s)` : ''}`;
    return;
  }

  if (estado === 'pronto') {
    btnGravar.textContent = '🎤';
    btnGravar.disabled = true;
    status.textContent = `OUÇA E MANDE — ${Voz.formatarTempo(duracao)}`;
    player.style.display = 'block';
    if (url && player.src !== url) player.src = url;
    return;
  }

  if (estado === 'enviando') {
    btnGravar.disabled = true;
    status.textContent = 'ENVIANDO...';
    player.style.display = 'none';
  }
}

async function alternarGravacao() {
  const s = Voz.situacao();
  if (s.estado === 'gravando') {
    Voz.parar();
    return;
  }
  if (s.estado !== 'parado') return;

  const r = await Voz.gravar();
  if (!r.ok) {
    const status = $('#voz-status');
    $('#voz-painel').style.display = 'flex';
    status.textContent = r.motivo.toUpperCase();
    setTimeout(() => pintarGravacao(Voz.situacao()), 4000);
  }
}

async function enviarRecado() {
  const r = await Voz.enviar(meuUid);
  if (!r.ok) {
    $('#voz-status').textContent = r.motivo.toUpperCase();
    return false;
  }
  await enviarAudio(meuUid, meuNome, r.url, r.duracao);
  return true;
}

async function alternarChat(abrir) {
  chatAberto = abrir;
  $('#chat-modal').style.display = abrir ? 'flex' : 'none';
  if (!abrir) return;

  $('#chat-notif').style.display = 'none';
  const container = $('#chat-messages');
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 100);

  await marcarMensagensComoLidas(meuUid);
}

async function enviar() {
  // Se existe um recado gravado esperando, SEND manda o áudio
  if (Voz.situacao().estado === 'pronto') {
    await enviarRecado();
    return;
  }
  const input = $('#chat-input');
  const texto = input.value;
  input.value = '';
  await enviarMensagem(meuUid, meuNome, texto);
}

/* -----------------------------------------------------------------------------
   ABAS DO MODAL DE PERFIL
----------------------------------------------------------------------------- */

function abrirAba(botao, idAba) {
  $$('.tab-content').forEach((c) => (c.style.display = 'none'));
  $$('.tab-btn').forEach((b) => b.classList.remove('active'));
  $('#' + idAba).style.display = 'block';
  botao.classList.add('active');
  if (idAba === 'tab-leaderboard') carregarPlacar();
}

/* -----------------------------------------------------------------------------
   LIGAÇÃO COM O HTML
----------------------------------------------------------------------------- */

$('#btn-login-google').addEventListener('click', () => entrarComGoogle());

$('#btn-logout').addEventListener('click', () => {
  if (!confirm('SAIR?')) return;
  sair().then(() => location.reload());
});

$('#profile-pic').addEventListener('click', () => {
  $('#stats-modal').style.display = 'flex';
});

$('#btn-fechar-stats').addEventListener('click', () => {
  $('#stats-modal').style.display = 'none';
});

$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => abrirAba(btn, btn.dataset.aba));
});

$('#btn-conexao-estelar').addEventListener('click', () => mudarInterface('pergunta'));
$('#btn-sim').addEventListener('click', () => mostrarPopup(true));

$('#btn-voltar-arcade').addEventListener('click', () => {
  mostrarPopup(false);
  mudarInterface('fliperama');
});

$('#chat-trigger').addEventListener('click', () => alternarChat(true));
$('#chat-fechar').addEventListener('click', () => alternarChat(false));
$('#chat-send').addEventListener('click', enviar);
$('#chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enviar();
});

$('#btn-notificacoes').addEventListener('click', alternarNotificacoes);
$('#btn-gravar').addEventListener('click', alternarGravacao);
$('#btn-descartar-voz').addEventListener('click', () => Voz.descartar());

if (!Voz.gravacaoSuportada()) $('#btn-gravar').style.display = 'none';
Voz.onMudanca(pintarGravacao);

// Tocar na notificação com o app aberto: abre o chat direto
navigator.serviceWorker?.addEventListener?.('message', (evento) => {
  if (evento.data?.tipo === 'NOTIFICACAO_ABERTA' && evento.data.url?.includes('chat')) {
    alternarChat(true);
  }
});
if (new URLSearchParams(window.location.search).get('abrir') === 'chat') {
  onUsuario((u) => {
    if (u) setTimeout(() => alternarChat(true), 400);
  });
}

$('#btn-fechar-novidades').addEventListener('click', fecharNovidades);
$('#link-novidades').addEventListener('click', abrirNovidades);

$('#rodape-versao').textContent = `v${VERSAO}`;

pintarStatus();
