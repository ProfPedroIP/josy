/* =============================================================================
   src/js/games/love-bird.js
   -----------------------------------------------------------------------------
   Flappy Bird com física escalada por segundo, milestones e cutscene final.

   CORREÇÕES APLICADAS NESTA REFATORAÇÃO
   1. Teletransporte no unpause: o GameLoop zera o relógio em resumir(), então
      o primeiro quadro após milestone/countdown/troca de aba tem delta 0.
   2. pipes.forEach + splice: substituído por atualizarEPodar (loop reverso).
   3. `pipes = []` era executado DENTRO da iteração ao atingir 100 pontos.
      Agora o pedido de cutscene é sinalizado e tratado depois do loop.
   4. Áudio centralizado no AudioManager (sem listener de mute próprio).
   ============================================================================= */

import {
  initViewportFix,
  AudioManager,
  GameLoop,
  atualizarEPodar,
  som,
  $,
} from '../utils.js';
import { registrarRecorde, CHAVES } from '../firebase-config.js';

initViewportFix();

/* -----------------------------------------------------------------------------
   DOM
----------------------------------------------------------------------------- */

const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = $('#score-display');
const countdownEl = $('#countdown');
const overlay = $('#overlay');
const milestoneScreen = $('#milestone-screen');
const gameOverDiv = $('#game-over');
const btnContinuar = $('#btn-continue');

/* -----------------------------------------------------------------------------
   ÁUDIO
----------------------------------------------------------------------------- */

const audio = new AudioManager({
  musica: som('happy.aac'),
  efeitos: {
    pulo: som('flap.wav'),      // clicou para voar
    ponto: som('score.wav'),    // passou por um cano
    batida: som('hit.wav'),     // encostou no cano
    derrota: som('lose.aac'),   // fim de jogo (cano ou chão)
    vitoria: som('win.aac'),    // marco atingido
  },
});

/* -----------------------------------------------------------------------------
   CONSTANTES DE JOGO  (idênticas ao original — física por segundo)
----------------------------------------------------------------------------- */

const GRAVIDADE = 1200;
const IMPULSO_PULO = -400;
const INTERVALO_CANO = 1.6;
const VELOCIDADE_INICIAL = 210;
const VELOCIDADE_MAXIMA = 390;
const ACELERACAO_POR_CANO = 5;
const VAO_CANO = 160;
const DURACAO_CUTSCENE = 3;

const MILESTONES = {
  25: 'Você é o meu melhor começo! ❤️',
  50: 'Metade do caminho, mas você já tem 100% do meu amor! 🥰',
  75: 'Quase lá! Minha campeã favorita. 🏆',
  100: 'VOCÊ É INCRÍVEL! 100 pontos! O amor venceu todos os obstáculos. 💖',
};

const CORACAO = [
  [0, 1, 1, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
];

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

const jogador = { x: 50, y: 300, width: 35, height: 35, velocidade: 0 };
let canos = [];
let pontos = 0;
let velocidadeCano = VELOCIDADE_INICIAL;
let timerCano = 0;

let emCutscene = false;
let cutsceneJaAconteceu = false;
let tempoCutscene = 0;
let pedidoCutscene = false; // sinalizado dentro do loop, tratado depois
let milestonePendente = null;
let timerContagem = null;

/* -----------------------------------------------------------------------------
   LOOP
----------------------------------------------------------------------------- */

const loop = new GameLoop((delta) => atualizar(delta), { maxDelta: 0.1 });

function atualizar(delta) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (emCutscene) {
    desenharCutscene(delta);
    return;
  }

  /* --- física do pássaro --- */
  jogador.velocidade += GRAVIDADE * delta;
  jogador.y += jogador.velocidade * delta;
  if (jogador.y < 0) {
    jogador.y = 0;
    jogador.velocidade = 0;
  }

  desenharJogador();

  /* --- spawn de canos --- */
  timerCano += delta;
  if (timerCano >= INTERVALO_CANO) {
    const alturaTopo = Math.floor(Math.random() * (canvas.height - VAO_CANO - 100)) + 50;
    canos.push({
      x: canvas.width,
      topY: 0,
      topHeight: alturaTopo,
      bottomY: alturaTopo + VAO_CANO,
      bottomHeight: canvas.height - (alturaTopo + VAO_CANO),
      width: 55,
      passou: false,
    });
    timerCano = 0;
  }

  /* --- canos: loop reverso, seguro para remoção durante a iteração --- */
  let morreu = false;
  let bateuNoCano = false;

  atualizarEPodar(canos, (cano) => {
    cano.x -= velocidadeCano * delta;
    desenharCano(cano.x, cano.topY, cano.width, cano.topHeight, true);
    desenharCano(cano.x, cano.bottomY, cano.width, cano.bottomHeight, false);

    if (cano.x + cano.width < jogador.x && !cano.passou) {
      cano.passou = true;
      marcarPonto();
    }

    const sobrepoeX =
      jogador.x < cano.x + cano.width && jogador.x + jogador.width > cano.x;
    const foraDoVao =
      jogador.y < cano.topHeight || jogador.y + jogador.height > cano.bottomY;
    if (sobrepoeX && foraDoVao) {
      morreu = true;
      bateuNoCano = true;
    }

    return cano.x + cano.width < 0; // true = remove
  });

  if (jogador.y + jogador.height >= canvas.height) morreu = true;

  /* --- efeitos colaterais tratados FORA da iteração --- */
  if (pedidoCutscene) {
    pedidoCutscene = false;
    iniciarCutscene();
    return;
  }

  if (milestonePendente !== null) {
    const marco = milestonePendente;
    milestonePendente = null;
    mostrarMilestone(marco);
    return;
  }

  if (morreu) fimDeJogo(bateuNoCano);
}

function marcarPonto() {
  pontos++;
  scoreDisplay.innerText = 'PONTOS: ' + pontos;
  audio.tocar('ponto');
  if (velocidadeCano < VELOCIDADE_MAXIMA) velocidadeCano += ACELERACAO_POR_CANO;

  if (pontos === 100 && !cutsceneJaAconteceu) {
    cutsceneJaAconteceu = true;
    pedidoCutscene = true;
  } else if (MILESTONES[pontos] && pontos !== 100) {
    milestonePendente = pontos;
  }
}

/* -----------------------------------------------------------------------------
   DESENHO
----------------------------------------------------------------------------- */

function desenharJogador() {
  ctx.save();
  ctx.translate(jogador.x + jogador.width / 2, jogador.y + jogador.height / 2);
  ctx.rotate(Math.min(Math.PI / 4, Math.max(-Math.PI / 4, jogador.velocidade * 0.002)));
  ctx.scale(-1, 1);
  ctx.font = '35px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐦', 0, 0);
  ctx.restore();
}

function desenharCano(x, y, largura, altura, ehTopo) {
  const alturaTampa = 24;
  const larguraExtra = 8;

  const gradiente = ctx.createLinearGradient(x, 0, x + largura, 0);
  gradiente.addColorStop(0, '#549C16');
  gradiente.addColorStop(0.3, '#85D638');
  gradiente.addColorStop(0.7, '#74BF2E');
  gradiente.addColorStop(1, '#549C16');

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#305A0C';
  ctx.fillStyle = gradiente;

  if (ehTopo) {
    ctx.fillRect(x, y, largura, altura - alturaTampa);
    ctx.strokeRect(x, y, largura, altura - alturaTampa);
    ctx.fillRect(x - larguraExtra / 2, altura - alturaTampa, largura + larguraExtra, alturaTampa);
    ctx.strokeRect(x - larguraExtra / 2, altura - alturaTampa, largura + larguraExtra, alturaTampa);
  } else {
    ctx.fillRect(x, y + alturaTampa, largura, altura - alturaTampa);
    ctx.strokeRect(x, y + alturaTampa, largura, altura - alturaTampa);
    ctx.fillRect(x - larguraExtra / 2, y, largura + larguraExtra, alturaTampa);
    ctx.strokeRect(x - larguraExtra / 2, y, largura + larguraExtra, alturaTampa);
  }
}

/* -----------------------------------------------------------------------------
   CUTSCENE DOS 100 PONTOS
----------------------------------------------------------------------------- */

function iniciarCutscene() {
  emCutscene = true;
  tempoCutscene = 0;
  canos = [];
  audio.pausarMusica();
  audio.tocar('vitoria');
}

function desenharCutscene(delta) {
  tempoCutscene += delta;

  const escala = Math.min(20, tempoCutscene * 12);
  const alfa = Math.min(1, tempoCutscene / 1.5);

  ctx.fillStyle = `rgba(255, 77, 109, ${alfa})`;
  const inicioX = canvas.width / 2 - (CORACAO[0].length * escala) / 2;
  const inicioY = canvas.height / 2 - (CORACAO.length * escala) / 2;
  for (let l = 0; l < CORACAO.length; l++) {
    for (let c = 0; c < CORACAO[0].length; c++) {
      if (CORACAO[l][c]) {
        ctx.fillRect(inicioX + c * escala, inicioY + l * escala, escala, escala);
      }
    }
  }

  jogador.x += (canvas.width / 2 - 30 - jogador.x) * 0.05;
  jogador.y += (canvas.height / 2 - jogador.y) * 0.05;

  ctx.save();
  ctx.translate(jogador.x, jogador.y);
  ctx.scale(-1, 1);
  ctx.font = '35px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🐦', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width / 2 + 30, canvas.height / 2);
  ctx.font = '35px Arial';
  ctx.globalAlpha = alfa;
  ctx.fillText('🐦', 0, 0);
  ctx.restore();

  if (tempoCutscene >= DURACAO_CUTSCENE) {
    emCutscene = false;
    mostrarMilestone(100);
  }
}

/* -----------------------------------------------------------------------------
   MILESTONES E CONTAGEM REGRESSIVA
----------------------------------------------------------------------------- */

function mostrarMilestone(marco) {
  loop.pausar();
  audio.pausarMusica();
  if (marco !== 100) audio.tocar('vitoria');

  $('#milestone-text').innerText = MILESTONES[marco];
  if (marco === 100) {
    btnContinuar.innerText = 'MODO IMPOSSÍVEL 🔥';
    btnContinuar.style.background = '#ff0000';
  } else {
    btnContinuar.innerText = 'CONTINUAR';
    btnContinuar.style.background = '#00ff41';
  }
  milestoneScreen.style.display = 'block';
}

function retomarComContagem() {
  milestoneScreen.style.display = 'none';

  // Reposiciona o pássaro e limpa a tela, mantendo a velocidade acumulada
  // (é isso que faz o "modo impossível" depois dos 100 pontos).
  jogador.x = 50;
  jogador.y = 300;
  jogador.velocidade = 0;
  canos = [];
  timerCano = 0;

  countdownEl.style.display = 'block';
  let contagem = 3;
  countdownEl.innerText = contagem;

  clearInterval(timerContagem);
  timerContagem = setInterval(() => {
    contagem--;
    if (contagem > 0) {
      countdownEl.innerText = contagem;
      return;
    }
    clearInterval(timerContagem);
    timerContagem = null;
    countdownEl.style.display = 'none';
    audio.tocarMusica();
    loop.resumir(); // <- reset do relógio: sem salto de tempo
  }, 800);
}

/* -----------------------------------------------------------------------------
   CICLO DA PARTIDA
----------------------------------------------------------------------------- */

function iniciarMissao() {
  overlay.style.display = 'none';
  novaPartida();
}

function novaPartida() {
  clearInterval(timerContagem);
  timerContagem = null;

  milestoneScreen.style.display = 'none';
  gameOverDiv.style.display = 'none';
  countdownEl.style.display = 'none';

  pontos = 0;
  velocidadeCano = VELOCIDADE_INICIAL;
  canos = [];
  timerCano = 0;
  scoreDisplay.innerText = 'PONTOS: 0';

  jogador.x = 50;
  jogador.y = 300;
  jogador.velocidade = 0;

  emCutscene = false;
  cutsceneJaAconteceu = false;
  pedidoCutscene = false;
  milestonePendente = null;

  audio.tocarMusica();
  loop.iniciar();
}

/**
 * @param {boolean} bateuNoCano true = colidiu com um cano; false = caiu no chão
 *
 * Batendo no cano tocam DOIS sons: a batida na hora e a derrota logo depois.
 * O pequeno atraso evita que os dois saiam sobrepostos e virem um borrão.
 */
function fimDeJogo(bateuNoCano = false) {
  loop.parar();
  audio.pausarMusica();

  if (bateuNoCano) {
    audio.tocar('batida');
    setTimeout(() => audio.tocar('derrota'), 260);
  } else {
    audio.tocar('derrota');
  }

  registrarRecorde(pontos, CHAVES.LOVE_BIRD);
  $('#final-score-text').innerText = 'Sua pontuação final: ' + pontos;
  gameOverDiv.style.display = 'block';
}

/* -----------------------------------------------------------------------------
   ENTRADA
----------------------------------------------------------------------------- */

function pular(evento) {
  if (!loop.rodando || loop.pausado || emCutscene) return;
  if (evento.type === 'keydown' && evento.code !== 'Space') return;
  if (evento.type === 'touchstart' || evento.type === 'mousedown') evento.preventDefault();
  jogador.velocidade = IMPULSO_PULO;
  audio.tocar('pulo');
}

canvas.addEventListener('mousedown', pular);
canvas.addEventListener('touchstart', pular, { passive: false });
window.addEventListener('keydown', pular);

/* -----------------------------------------------------------------------------
   LIGAÇÃO COM O HTML
   -----------------------------------------------------------------------------
   Com type="module" nada vira global, então os antigos onclick="" do HTML
   foram removidos e substituídos por estes listeners.
----------------------------------------------------------------------------- */

$('#btn-voar').addEventListener('click', iniciarMissao);
$('#btn-continue').addEventListener('click', retomarComContagem);
$('#btn-tentar-novamente').addEventListener('click', novaPartida);
$('#btn-close').addEventListener('click', () => {
  window.location.href = 'index.html';
});
