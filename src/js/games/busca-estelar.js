/* Busca Estelar: encontre os 3 corações na grade 5x5. */

import { initViewportFix, AudioManager, embaralhar, som, $ } from '../utils.js';
import { registrarRecorde, CHAVES } from '../firebase-config.js';

initViewportFix();

const grade = $('#grid');
const telaVitoria = $('#message');
const placar = $('#score-display');
const overlay = $('#overlay');

const audio = new AudioManager({
  musica: som('cool.aac'),
  efeitos: {
    clique: som('click.aac'),
    vitoria: som('win.aac'),
  },
});

const TOTAL_CASAS = 25;
const TOTAL_ALVOS = 3;
const PONTUACAO_INICIAL = 1000;
const PENALIDADE = 40;

let alvos = [];
let encontrados = 0;
let pontuacao = PONTUACAO_INICIAL;

function novaPartida() {
  grade.innerHTML = '';
  telaVitoria.style.display = 'none';
  encontrados = 0;
  pontuacao = PONTUACAO_INICIAL;
  atualizarPlacar();

  // Fisher-Yates: distribuição uniforme dos corações.
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

$('#btn-iniciar').addEventListener('click', () => {
  overlay.style.display = 'none';
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
