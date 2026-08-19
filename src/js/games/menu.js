/* =============================================================================
   src/js/games/menu.js
   -----------------------------------------------------------------------------
   Hub do Josy Arcade: login, menu de jogos, chat global, placar e a
   brincadeira da "CONEXÃO ESTELAR".

   CORREÇÕES APLICADAS NESTA REFATORAÇÃO
   1. O placar lia 'busca_estelar' e 'minado_amorous' enquanto os jogos
      gravavam '..._max'. Agora tudo vem do catálogo JOGOS.
   2. O recorde do Modo Recorde do Guardião passa a aparecer no placar.
   3. sw.js nunca era registrado — o PWA não era instalável. Corrigido.
   4. As mensagens do chat eram inseridas com innerHTML (o texto digitado ia
      direto para o HTML). Agora o corpo da mensagem usa textContent.
   5. nomeCurto() não quebra mais com conta Google sem nome público.
   6. Áudio centralizado no AudioManager.
   ============================================================================= */

import {
  initViewportFix,
  registrarServiceWorker,
  AudioManager,
  som,
  $,
  $$,
} from '../utils.js';
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
} from '../firebase-config.js';

initViewportFix();
registrarServiceWorker();

/* -----------------------------------------------------------------------------
   ÁUDIO
----------------------------------------------------------------------------- */

const audio = new AudioManager({ musica: som('track.wav'), volumeMusica: 1 });
audio.ligarBotao('#btn-sound', { ligado: '🔊 SOM ON', desligado: '🔇 SOM OFF' });

// O menu quer trilha sempre que o som estiver ligado
audio.tocarMusica();

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

let meuUid = '';
let meuNome = '';
let chatAberto = false;
let cancelarChat = null;

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

    // Devolve o botão NÃO para o lado do SIM
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
  const email = $('#profile-pic').dataset.email || '';
  return USUARIOS_AUTORIZADOS.includes(email);
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
    linhas.forEach(({ jogo, valor }) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${jogo.rotulo}</td>` +
        `<td style="text-align:right" class="score-indiv">${valor}${jogo.sufixo}</td>`;
      corpo.appendChild(tr);
    });
  });
}

async function carregarPlacar() {
  const corpo = $('#leaderboard-body');
  const linhas = await carregarPlacarGlobal();
  corpo.innerHTML = '';

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
  const modal = $('#chat-modal');
  modal.style.display = abrir ? 'flex' : 'none';
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
   LIGAÇÃO COM O HTML
   -----------------------------------------------------------------------------
   Com type="module" nada vira global, então os antigos onclick="" do HTML
   foram removidos e substituídos por estes listeners.
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
