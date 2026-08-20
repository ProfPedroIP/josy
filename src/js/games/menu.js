/* =============================================================================
   src/js/games/menu.js
   -----------------------------------------------------------------------------
   Hub do Josy Arcade: login, menu, chat global, placar, brincadeira da
   "CONEXÃO ESTELAR" e a camada de estado offline.
   ============================================================================= */

import { initViewportFix, AudioManager, som, $, $$ } from '../utils.js';
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
  marcarMensagensComoLidas,
  USUARIOS_AUTORIZADOS,
  registrarServiceWorker,
  baixarMidiaOffline,
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

/* -----------------------------------------------------------------------------
   ÁUDIO
----------------------------------------------------------------------------- */

const audio = new AudioManager({ musica: som('track.wav'), volumeMusica: 1 });
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
  pintarStatus();
  if (estaOn) sincronizar();
});

onPendencias((n) => {
  naFila = n;
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

function desviar() {
  const maxX = appWrapper.clientWidth - btnNao.offsetWidth;
  const maxY = appWrapper.clientHeight - btnNao.offsetHeight;
  btnNao.style.position = 'absolute';
  btnNao.style.right = 'auto';
  btnNao.style.left = `${Math.floor(Math.random() * maxX)}px`;
  btnNao.style.top = `${Math.floor(Math.random() * maxY)}px`;
}

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

      // textContent, não innerHTML: o que a pessoa digita não vira markup
      const corpo = document.createTextNode(m.texto || '');

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

function enviar() {
  const input = $('#chat-input');
  enviarMensagem(meuUid, meuNome, input.value);
  input.value = '';
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
   DOWNLOAD DOS ÁUDIOS PARA USO OFFLINE
----------------------------------------------------------------------------- */

async function baixarParaOffline() {
  const btn = $('#btn-baixar-offline');
  if (!estaOnline()) {
    btn.innerText = 'PRECISA DE INTERNET';
    setTimeout(() => (btn.innerText = 'BAIXAR SONS P/ OFFLINE'), 2500);
    return;
  }

  btn.disabled = true;
  btn.innerText = 'BAIXANDO... 0%';

  const resultado = await baixarMidiaOffline((feitos, total) => {
    btn.innerText = `BAIXANDO... ${Math.round((feitos / total) * 100)}%`;
  });

  btn.disabled = false;
  btn.innerText = resultado.ok
    ? `PRONTO — ${resultado.feitos} SONS OFFLINE`
    : 'FALHOU — TENTE DE NOVO';
  setTimeout(() => (btn.innerText = 'BAIXAR SONS P/ OFFLINE'), 4000);
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

$('#btn-baixar-offline').addEventListener('click', baixarParaOffline);

$('#btn-conexao-estelar').addEventListener('click', () => mudarInterface('pergunta'));
$('#btn-sim').addEventListener('click', () => mostrarPopup(true));

$('#btn-voltar-fliperama').addEventListener('click', () => {
  mostrarPopup(false);
  mudarInterface('fliperama');
});
$('#btn-voltar-pergunta').addEventListener('click', () => mostrarPopup(false));

$('#chat-trigger').addEventListener('click', () => alternarChat(true));
$('#chat-fechar').addEventListener('click', () => alternarChat(false));
$('#chat-send').addEventListener('click', enviar);
$('#chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enviar();
});

pintarStatus();
