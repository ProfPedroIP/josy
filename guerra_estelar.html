/* =============================================================================
   src/js/games/guerra-estelar.js
   -----------------------------------------------------------------------------
   Guardião do Amor — space shooter top-down, modos Clássico e Recorde.

   CORREÇÕES APLICADAS NESTA REFATORAÇÃO
   1. bullets/enemies/items eram percorridos com .forEach() e removidos com
      .splice(i, 1) na mesma passada — o que pula o elemento seguinte. Agora
      todos usam loops reversos.
   2. A colisão tiro x inimigo era um forEach ANINHADO com splice nos DOIS
      arrays: o pior caso possível. Reescrita com loops reversos e `break`
      quando o inimigo morre.
   3. O loop contava frames++ sem delta time: em tela de 144 Hz o jogo rodava
      2,4x mais rápido. Agora GameLoop com passoFixo 1/60 garante 60 passos de
      lógica por segundo em qualquer tela — mecânica idêntica à original.
   4. resetGame() chamava loop() sem cancelar o rAF anterior, podendo deixar
      dois loops vivos. GameLoop.iniciar() cancela o anterior.
   5. Áudio centralizado no AudioManager.

   IMPORTANTE: como o passo é fixo em 1/60 s, todas as velocidades continuam
   expressas em "pixels por quadro", exatamente como no código original.
   ============================================================================= */

import {
  initViewportFix,
  AudioManager,
  GameLoop,
  atualizarEPodar,
  posicaoNoCanvas,
  limitar,
  som,
  $,
} from '../utils.js';
import { registrarVitoria, registrarRecorde, CHAVES } from '../firebase-config.js';

initViewportFix();

/* -----------------------------------------------------------------------------
   DOM E ÁUDIO
----------------------------------------------------------------------------- */

const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = $('#score-display');
const lifeDisplay = $('#life-display');
const btnPause = $('#btn-pause');
const overlay = $('#overlay');
const telaVitoria = $('#message');
const telaDerrota = $('#game-over');

const audio = new AudioManager({
  musica: som('excited.aac'),
  efeitos: {
    laser: som('laser.aac'),
    explosao: som('explosion.aac'),
    poder: som('win.aac'),
  },
});
audio.ligarBotao('#btn-sound');

/* -----------------------------------------------------------------------------
   CONSTANTES  (idênticas ao original)
----------------------------------------------------------------------------- */

const META_CLASSICO = 1000;
const SPAWN_INICIAL = 80;
const SPAWN_MINIMO = 15;
const CADENCIA = { classic: 12, infinite: 15 };
const INTERVALO_ITENS = 500;
const DURACAO_TIRO_ESPECIAL = 400;

const TIPOS_INIMIGO = [
  { limite: 0.6,  hp: 1, tipo: '🛸', pts: 10, velocidade: 2 },
  { limite: 0.85, hp: 2, tipo: '👾', pts: 30, velocidade: 3 },
  { limite: 1,    hp: 5, tipo: '☄️', pts: 50, velocidade: 1.5 },
];

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

let modo = 'classic';
let pontos = 0;
let vidas = 1;
let quadros = 0;
let taxaSpawn = SPAWN_INICIAL;
let timerTiroEspecial = 0;

const nave = { x: 160, y: 520, width: 40, height: 40 };
let tiros = [];
let inimigos = [];
let itens = [];

/* -----------------------------------------------------------------------------
   LOOP — passo fixo de 60 Hz
----------------------------------------------------------------------------- */

const loop = new GameLoop(() => atualizar(), { passoFixo: 1 / 60, maxPassos: 5 });

function atualizar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  quadros++;

  desenharNave();
  atualizarTiros();
  atualizarItens();
  atualizarInimigos();
}

function desenharNave() {
  ctx.font = '40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(nave.x + 20, nave.y + 20);
  ctx.rotate((-45 * Math.PI) / 180);
  ctx.fillText('🚀', 0, 0);
  ctx.restore();
}

/* -----------------------------------------------------------------------------
   TIROS
----------------------------------------------------------------------------- */

function atualizarTiros() {
  if (quadros % CADENCIA[modo] === 0) {
    tiros.push({ x: nave.x + 18, y: nave.y, vx: 0, vy: -10 });
    if (timerTiroEspecial > 0) {
      tiros.push({ x: nave.x + 18, y: nave.y, vx: -3, vy: -9.5 });
      tiros.push({ x: nave.x + 18, y: nave.y, vx: 3, vy: -9.5 });
      tiros.push({ x: nave.x + 18, y: nave.y, vx: -6, vy: -8 });
      tiros.push({ x: nave.x + 18, y: nave.y, vx: 6, vy: -8 });
    }
    audio.tocar('laser');
  }
  if (timerTiroEspecial > 0) timerTiroEspecial--;

  ctx.fillStyle = '#00ffff';
  atualizarEPodar(tiros, (t) => {
    t.x += t.vx;
    t.y += t.vy;
    ctx.fillRect(t.x, t.y, 4, 12);
    return t.y < 0 || t.x < 0 || t.x > canvas.width; // true = remove
  });
}

/* -----------------------------------------------------------------------------
   ITENS (só no modo Recorde)
----------------------------------------------------------------------------- */

function atualizarItens() {
  if (modo === 'infinite' && quadros % INTERVALO_ITENS === 0) {
    itens.push({
      x: Math.random() * 320,
      y: -30,
      tipo: Math.random() > 0.5 ? '⭐' : '⚡',
      velocidade: 2,
    });
  }

  ctx.font = '40px Arial';
  atualizarEPodar(itens, (item) => {
    item.y += item.velocidade;
    ctx.fillText(item.tipo, item.x + 15, item.y + 15);

    const pegou =
      item.x < nave.x + 40 &&
      item.x + 30 > nave.x &&
      item.y < nave.y + 40 &&
      item.y + 30 > nave.y;

    if (!pegou) return item.y > canvas.height + 40;

    audio.tocar('poder');
    if (item.tipo === '⭐') vidas++;
    else timerTiroEspecial = DURACAO_TIRO_ESPECIAL;
    lifeDisplay.innerText = `VIDAS: ${vidas}`;
    return true;
  });
}

/* -----------------------------------------------------------------------------
   INIMIGOS E COLISÕES
   -----------------------------------------------------------------------------
   O ponto mais delicado da refatoração. Percorremos inimigos de trás para
   frente; dentro de cada inimigo, percorremos os tiros também de trás para
   frente. Quando o inimigo morre, removemos e saímos do laço interno com
   `break` — nenhum índice é pulado nas duas listas.
----------------------------------------------------------------------------- */

function atualizarInimigos() {
  if (quadros % Math.floor(taxaSpawn) === 0) {
    const sorteio = Math.random();
    const modelo = TIPOS_INIMIGO.find((m) => sorteio < m.limite);
    inimigos.push({
      x: Math.random() * 320,
      y: -40,
      hp: modelo.hp,
      tipo: modelo.tipo,
      pts: modelo.pts,
      velocidade: modelo.velocidade,
    });
  }

  ctx.font = '40px Arial';

  for (let ei = inimigos.length - 1; ei >= 0; ei--) {
    const inimigo = inimigos[ei];
    inimigo.y += inimigo.velocidade;
    ctx.fillText(inimigo.tipo, inimigo.x + 20, inimigo.y + 20);

    /* --- escapou pelo rodapé ou bateu na nave: custa uma vida --- */
    const bateuNaNave =
      inimigo.x < nave.x + 35 &&
      inimigo.x + 35 > nave.x &&
      inimigo.y < nave.y + 35 &&
      inimigo.y + 35 > nave.y;

    if (inimigo.y > canvas.height || bateuNaNave) {
      inimigos.splice(ei, 1);
      vidas--;
      lifeDisplay.innerText = `VIDAS: ${vidas}`;

      if (vidas <= 0) {
        fimDeJogo(false);
        return;
      }
      audio.tocar('explosao');
      ctx.fillStyle = 'rgba(255,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      continue;
    }

    /* --- colisão com os tiros --- */
    for (let ti = tiros.length - 1; ti >= 0; ti--) {
      const t = tiros[ti];
      const acertou =
        t.x < inimigo.x + 40 &&
        t.x + 4 > inimigo.x &&
        t.y < inimigo.y + 40 &&
        t.y + 12 > inimigo.y;

      if (!acertou) continue;

      tiros.splice(ti, 1);
      inimigo.hp--;

      if (inimigo.hp > 0) continue;

      inimigos.splice(ei, 1);
      audio.tocar('explosao');
      pontos += inimigo.pts;
      scoreDisplay.innerText = `PONTOS: ${pontos}`;

      const aceleracao = modo === 'classic' ? 1.1 : 0.8;
      if (taxaSpawn > SPAWN_MINIMO) taxaSpawn -= aceleracao;

      if (modo === 'classic' && pontos >= META_CLASSICO) {
        fimDeJogo(true);
        return;
      }
      break; // inimigo morreu, não faz sentido testar os outros tiros
    }
  }
}

/* -----------------------------------------------------------------------------
   CICLO DA PARTIDA
----------------------------------------------------------------------------- */

function iniciarJogo(novoModo) {
  modo = novoModo;
  vidas = novoModo === 'infinite' ? 3 : 1;
  overlay.style.display = 'none';
  lifeDisplay.innerText = `VIDAS: ${vidas}`;
  audio.ligar();
  novaPartida();
}

function novaPartida() {
  pontos = 0;
  quadros = 0;
  taxaSpawn = SPAWN_INICIAL;
  timerTiroEspecial = 0;
  tiros = [];
  inimigos = [];
  itens = [];

  vidas = modo === 'infinite' ? 3 : 1;
  lifeDisplay.innerText = `VIDAS: ${vidas}`;
  scoreDisplay.innerText = 'PONTOS: 0';

  telaVitoria.style.display = 'none';
  telaDerrota.style.display = 'none';
  btnPause.innerText = 'PAUSE';

  audio.tocarMusica();
  loop.iniciar();
}

function fimDeJogo(venceu) {
  loop.parar();
  audio.pausarMusica();

  if (venceu) {
    telaVitoria.style.display = 'block';
    registrarVitoria(CHAVES.GUARDIAO_VITORIAS);
    return;
  }

  telaDerrota.style.display = 'block';
  $('#go-title').innerText = modo === 'infinite' ? 'MISSÃO CONCLUÍDA!' : 'SISTEMA FALHOU!';
  $('#go-text').innerText =
    modo === 'infinite'
      ? `Que bom que você chegou até aqui! Suas vidas acabaram.\nPontuação final: ${pontos}`
      : 'A barreira foi rompida. Tente novamente!';

  if (modo === 'infinite') registrarRecorde(pontos, CHAVES.GUARDIAO_RECORDE);
}

function alternarPausa() {
  if (!loop.rodando) return;
  loop.alternarPausa();
  btnPause.innerText = loop.pausado ? 'RESUME' : 'PAUSE';
  if (loop.pausado) audio.pausarMusica();
  else audio.tocarMusica();
}

/* -----------------------------------------------------------------------------
   ENTRADA
----------------------------------------------------------------------------- */

function moverNave(evento) {
  if (!loop.rodando || loop.pausado) return;
  const { x } = posicaoNoCanvas(evento, canvas);
  nave.x = limitar(x - 20, 0, canvas.width - 40);
}

canvas.addEventListener('mousemove', moverNave);
canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    moverNave(e);
  },
  { passive: false }
);

/* -----------------------------------------------------------------------------
   LIGAÇÃO COM O HTML
----------------------------------------------------------------------------- */

$('#btn-modo-classico').addEventListener('click', () => iniciarJogo('classic'));
$('#btn-modo-recorde').addEventListener('click', () => iniciarJogo('infinite'));
$('#btn-pause').addEventListener('click', alternarPausa);
$('#btn-close').addEventListener('click', () => {
  window.location.href = 'index.html';
});
document.querySelectorAll('[data-acao="reiniciar"]').forEach((btn) => {
  btn.addEventListener('click', novaPartida);
});
