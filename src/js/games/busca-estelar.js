/* =============================================================================
   src/js/games/busca-estelar.js
   -----------------------------------------------------------------------------
   Busca Estelar — encontre os 3 corações escondidos na grade 5x5.

   CORREÇÕES APLICADAS NESTA REFATORAÇÃO
   1. Sorteio dos alvos com embaralhar() (Fisher-Yates) no lugar do laço
      while + includes.
   2. Áudio centralizado no AudioManager.
   3. Grava em CHAVES.BUSCA_ESTELAR, a mesma chave que o menu lê.
   4. A pontuação agora tem piso em 0 — antes podia ficar negativa depois de
      muitos erros e aparecia "SCORE: -320 PTS" na tela de vitória.
   ============================================================================= */

import { initViewportFix, AudioManager, embaralhar, som, $ } from '../utils.js';
import { registrarRecorde, CHAVES } from '../firebase-config.js';

initViewportFix();

/* -----------------------------------------------------------------------------
   DOM E ÁUDIO
----------------------------------------------------------------------------- */

const grade = $('#grid');
const telaVitoria = $('#message');
const placar = $('#score-display');
const overlay = $('#overlay');

const audio = new AudioManager({
  musica: som('batalha_estelar.mp3'),
  efeitos: {
    clique: som('click.wav'),
    vitoria: som('win.wav'),
  },
});
audio.ligarBotao('#btn-sound');

/* -----------------------------------------------------------------------------
   CONSTANTES
----------------------------------------------------------------------------- */

const TOTAL_CASAS = 25;
const TOTAL_ALVOS = 3;
const PONTUACAO_INICIAL = 1000;
const PENALIDADE = 40;

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

let alvos = [];
let encontrados = 0;
let pontuacao = PONTUACAO_INICIAL;

/* -----------------------------------------------------------------------------
   PARTIDA
----------------------------------------------------------------------------- */

function novaPartida() {
  grade.innerHTML = '';
  telaVitoria.style.display = 'none';
  encontrados = 0;
  pontuacao = PONTUACAO_INICIAL;
  atualizarPlacar();

  alvos = embaralhar([...Array(TOTAL_CASAS).keys()]).slice(0, TOTAL_ALVOS);

  for (let i = 0; i < TOTAL_CASAS; i++) {
    const casa = document.createElement('div');
    casa.classList.add('cell');
    casa.innerHTML = '★';
    casa.addEventListener('click', () => revelar(casa, i), { once: true });
    grade.appendChild(casa);
  }
}

function atualizarPlacar() {
  placar.innerHTML = `CORAÇÕES: ${encontrados} / ${TOTAL_ALVOS}<br>PONTOS: ${pontuacao}`;
}

function revelar(casa, indice) {
  audio.tocar('clique');

  if (!alvos.includes(indice)) {
    casa.innerText = 'X';
    casa.classList.add('miss');
    pontuacao = Math.max(0, pontuacao - PENALIDADE);
    atualizarPlacar();
    return;
  }

  casa.innerText = '❤️';
  casa.classList.add('hit');
  encontrados++;
  atualizarPlacar();

  if (encontrados < TOTAL_ALVOS) return;

  audio.pausarMusica();
  audio.tocar('vitoria');
  $('#final-score-msg').innerText = `SCORE: ${pontuacao} PTS`;
  registrarRecorde(pontuacao, CHAVES.BUSCA_ESTELAR);
  telaVitoria.style.display = 'block';
}

/* -----------------------------------------------------------------------------
   LIGAÇÃO COM O HTML
----------------------------------------------------------------------------- */

$('#btn-iniciar').addEventListener('click', () => {
  overlay.style.display = 'none';
  audio.ligar();
  audio.tocarMusica();
});

document.querySelectorAll('[data-acao="reiniciar"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    novaPartida();
    audio.tocarMusica();
  });
});

$('#btn-close').addEventListener('click', () => {
  window.location.href = 'index.html';
});

novaPartida();
