/* =============================================================================
   src/js/games/minado.js
   -----------------------------------------------------------------------------
   Minado Amorous — campo minado 5x5 com corações e buracos negros.

   CORREÇÕES APLICADAS NESTA REFATORAÇÃO
   1. `positions.sort(() => Math.random() - 0.5)` é um embaralhamento enviesado:
      algumas casas recebiam buraco negro com mais frequência. Trocado por
      Fisher-Yates (embaralhar()).
   2. Áudio centralizado no AudioManager.
   3. Grava em CHAVES.MINADO, a mesma chave que o menu lê.
   ============================================================================= */

import { initViewportFix, AudioManager, embaralhar, som, $ } from '../utils.js';
import { registrarRecorde, CHAVES } from '../firebase-config.js';

initViewportFix();

/* -----------------------------------------------------------------------------
   DOM E ÁUDIO
----------------------------------------------------------------------------- */

const grade = $('#grid');
const telaVitoria = $('#message');
const telaDerrota = $('#game-over');
const placar = $('#score-display');
const overlay = $('#overlay');

const audio = new AudioManager({
  musica: som('cool.aac'),
  efeitos: {
    clique: som('click.aac'),
    vitoria: som('win.aac'),
    derrota: som('lose.aac'),
  },
});
audio.ligarBotao('#btn-sound');

/* -----------------------------------------------------------------------------
   CONSTANTES  (idênticas ao original)
----------------------------------------------------------------------------- */

const LADO = 5;
const TOTAL_CASAS = LADO * LADO;
const TOTAL_CORACOES = 3;
const PONTUACAO_INICIAL = 1000;
const PENALIDADE = 40;
const PONTUACAO_MINIMA = 120;

/* -----------------------------------------------------------------------------
   ESTADO
----------------------------------------------------------------------------- */

let coracoes = [];
let buracos = [];
let coracoesEncontrados = 0;
let pontuacao = PONTUACAO_INICIAL;
let partidaAtiva = false;
let totalBuracos = 3;

/* -----------------------------------------------------------------------------
   PARTIDA
----------------------------------------------------------------------------- */

function iniciarMissao(dificuldade) {
  totalBuracos = dificuldade;
  overlay.style.display = 'none';
  audio.ligar();
  novaPartida();
}

function novaPartida() {
  grade.innerHTML = '';
  telaVitoria.style.display = 'none';
  telaDerrota.style.display = 'none';

  coracoesEncontrados = 0;
  pontuacao = PONTUACAO_INICIAL;
  partidaAtiva = true;
  atualizarPlacar();

  // Fisher-Yates: distribuição realmente uniforme
  const posicoes = embaralhar([...Array(TOTAL_CASAS).keys()]);
  coracoes = posicoes.slice(0, TOTAL_CORACOES);
  buracos = posicoes.slice(TOTAL_CORACOES, TOTAL_CORACOES + totalBuracos);

  for (let i = 0; i < TOTAL_CASAS; i++) {
    const casa = document.createElement('div');
    casa.classList.add('cell');
    casa.innerHTML = '★';
    casa.id = 'cell-' + i;
    casa.addEventListener('click', () => revelar(casa, i));
    grade.appendChild(casa);
  }

  audio.tocarMusica();
}

function atualizarPlacar() {
  placar.innerHTML = `CORAÇÕES: ${coracoesEncontrados} / ${TOTAL_CORACOES}<br>PONTOS: ${pontuacao}`;
}

function revelar(casa, indice) {
  if (!partidaAtiva || casa.classList.contains('revealed')) return;
  casa.classList.add('revealed');

  if (buracos.includes(indice)) {
    audio.pausarMusica();
    audio.tocar('derrota');
    casa.innerHTML = '🌑';
    casa.classList.add('blackhole');
    fimDeJogo(false);
    return;
  }

  if (coracoes.includes(indice)) {
    audio.tocar('clique');
    casa.innerHTML = '❤️';
    casa.classList.add('heart');
    coracoesEncontrados++;
    atualizarPlacar();

    if (coracoesEncontrados === TOTAL_CORACOES) {
      audio.pausarMusica();
      audio.tocar('vitoria');
      fimDeJogo(true);
    }
    return;
  }

  audio.tocar('clique');
  const vizinhos = contarCoracoesVizinhos(indice);
  casa.classList.add('number');
  casa.innerHTML = vizinhos > 0 ? vizinhos : '';
  if (pontuacao > PONTUACAO_MINIMA) pontuacao -= PENALIDADE;
  atualizarPlacar();
}

function contarCoracoesVizinhos(indice) {
  const linha = Math.floor(indice / LADO);
  const coluna = indice % LADO;
  let total = 0;

  for (let dl = -1; dl <= 1; dl++) {
    for (let dc = -1; dc <= 1; dc++) {
      const l = linha + dl;
      const c = coluna + dc;
      if (l < 0 || l >= LADO || c < 0 || c >= LADO) continue;
      if (coracoes.includes(l * LADO + c)) total++;
    }
  }
  return total;
}

function fimDeJogo(venceu) {
  partidaAtiva = false;

  if (venceu) {
    $('#win-score-msg').innerText = `SCORE: ${pontuacao} PTS`;
    telaVitoria.style.display = 'block';
    registrarRecorde(pontuacao, CHAVES.MINADO);

    // Mostra onde estavam os buracos que ela desviou
    buracos.forEach((i) => {
      const casa = $('#cell-' + i);
      if (casa.classList.contains('revealed')) return;
      casa.innerHTML = '🌑';
      casa.classList.add('revealed', 'blackhole');
      casa.style.opacity = '0.5';
    });
    return;
  }

  telaDerrota.style.display = 'block';
  buracos.forEach((i) => {
    const casa = $('#cell-' + i);
    casa.innerHTML = '🌑';
    casa.classList.add('revealed', 'blackhole');
  });
  coracoes.forEach((i) => {
    const casa = $('#cell-' + i);
    if (casa.classList.contains('revealed')) return;
    casa.innerHTML = '❤️';
    casa.classList.add('revealed', 'heart-revealed');
  });
}

/* -----------------------------------------------------------------------------
   LIGAÇÃO COM O HTML
----------------------------------------------------------------------------- */

document.querySelectorAll('[data-dificuldade]').forEach((btn) => {
  btn.addEventListener('click', () => iniciarMissao(Number(btn.dataset.dificuldade)));
});
document.querySelectorAll('[data-acao="reiniciar"]').forEach((btn) => {
  btn.addEventListener('click', novaPartida);
});
$('#btn-close').addEventListener('click', () => {
  window.location.href = 'index.html';
});
