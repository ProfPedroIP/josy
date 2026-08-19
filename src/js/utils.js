/* =============================================================================
   src/js/utils.js
   -----------------------------------------------------------------------------
   Infraestrutura compartilhada do Josy Arcade: viewport mobile, áudio,
   loop de animação e manipulação segura de arrays.

   Não conhece Firebase e não conhece regra de jogo nenhuma.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   1. CAMINHOS DE ASSETS
   -----------------------------------------------------------------------------
   Ponto único de configuração. Para mover assets/ de lugar, troque só a
   constante ASSETS — nenhum jogo precisa ser editado.
----------------------------------------------------------------------------- */

export const ASSETS = 'assets';
export const som = (arquivo) => `${ASSETS}/sounds/${arquivo}`;
export const imagem = (arquivo) => `${ASSETS}/images/${arquivo}`;

/* -----------------------------------------------------------------------------
   2. ATALHOS DE DOM
----------------------------------------------------------------------------- */

export const $ = (seletor, raiz = document) =>
  typeof seletor === 'string' ? raiz.querySelector(seletor) : seletor;

export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/**
 * Resolve "#id", ".classe" ou um elemento já pronto.
 * querySelector lança SyntaxError com string que não é seletor válido
 * (uma URL, por exemplo), então protegemos com try/catch.
 */
function elemento(alvo) {
  if (!alvo) return null;
  if (alvo instanceof Element) return alvo;
  if (typeof alvo !== 'string') return null;
  try {
    return document.querySelector(alvo);
  } catch {
    return null;
  }
}

/* -----------------------------------------------------------------------------
   3. FIX DA VIEWPORT MOBILE (--vh)
   -----------------------------------------------------------------------------
   Estava copiado em 4 dos 5 arquivos. O 100vh no iOS/Android inclui a barra de
   endereço que some ao rolar; o --vh mede a altura real disponível.
----------------------------------------------------------------------------- */

export function initViewportFix() {
  const ajustar = () => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  };
  ajustar();
  window.addEventListener('resize', ajustar);
  window.addEventListener('orientationchange', ajustar);
  window.addEventListener('pageshow', ajustar);
  return ajustar;
}

/* -----------------------------------------------------------------------------
   4. GERENCIADOR DE ÁUDIO UNIFICADO
   -----------------------------------------------------------------------------
   Antes: cada página repetia o mesmo listener de mute, cada jogo tinha seu
   playSound(id) e os efeitos eram disparados com
   `if (btnSound.classList.contains("on")) ...` espalhado pelo loop.

   Agora: um objeto guarda o estado, persiste a preferência entre as páginas
   e cuida do bloqueio de autoplay dos navegadores.

     const audio = new AudioManager({
       musica: som('love_bird.mp3'),
       efeitos: { pulo: som('pulo.wav'), ponto: som('ponto.wav') },
     });
     audio.ligarBotao('#btn-sound');
     audio.tocar('pulo');
----------------------------------------------------------------------------- */

const CHAVE_PREFERENCIA = 'josy-arcade:som';

export class AudioManager {
  /**
   * @param {object} opcoes
   * @param {string|HTMLAudioElement} [opcoes.musica]
   * @param {Object<string, string|HTMLAudioElement>} [opcoes.efeitos]
   * @param {number} [opcoes.volumeMusica=0.5]
   * @param {number} [opcoes.volumeEfeitos=1]
   * @param {boolean} [opcoes.lembrarPreferencia=true]
   */
  constructor({
    musica = null,
    efeitos = {},
    volumeMusica = 0.5,
    volumeEfeitos = 1,
    lembrarPreferencia = true,
  } = {}) {
    this.lembrarPreferencia = lembrarPreferencia;
    this.musica = this._criarAudio(musica, { loop: true, volume: volumeMusica });
    this.efeitos = {};
    for (const [nome, origem] of Object.entries(efeitos)) {
      this.efeitos[nome] = this._criarAudio(origem, { volume: volumeEfeitos });
    }

    this.ativo = this._lerPreferencia();
    this.botoes = [];
    this._musicaDesejada = false; // o jogo quer trilha tocando agora?
  }

  /**
   * Aceita um <audio> já no DOM, um seletor CSS que aponte para um, ou uma URL.
   * Só tenta resolver como seletor quando a string começa com # ou . — caso
   * contrário 'assets/sounds/x.mp3' seria interpretado como seletor inválido.
   */
  _criarAudio(origem, { loop = false, volume = 1 } = {}) {
    if (!origem) return null;

    let audio = null;
    if (origem instanceof HTMLAudioElement) {
      audio = origem;
    } else if (typeof origem === 'string' && /^[#.]/.test(origem)) {
      const el = elemento(origem);
      if (el instanceof HTMLAudioElement) audio = el;
    }
    if (!audio) audio = new Audio(origem);

    audio.loop = loop;
    audio.volume = volume;
    audio.preload = 'auto';
    return audio;
  }

  _lerPreferencia() {
    if (!this.lembrarPreferencia) return false;
    try {
      return localStorage.getItem(CHAVE_PREFERENCIA) === 'on';
    } catch {
      return false; // modo privativo / storage bloqueado
    }
  }

  _salvarPreferencia() {
    if (!this.lembrarPreferencia) return;
    try {
      localStorage.setItem(CHAVE_PREFERENCIA, this.ativo ? 'on' : 'off');
    } catch {
      /* silencioso */
    }
  }

  /* ---- controle ---- */

  /** Liga/desliga tudo. @returns {boolean} novo estado */
  alternar() {
    return this.ativo ? this.desligar() : this.ligar();
  }

  ligar() {
    this.ativo = true;
    this._salvarPreferencia();
    if (this._musicaDesejada) this._darPlay(this.musica);
    this._atualizarBotoes();
    return true;
  }

  desligar() {
    this.ativo = false;
    this._salvarPreferencia();
    this.musica?.pause();
    this._atualizarBotoes();
    return false;
  }

  /** Toca a trilha (respeitando o mute). Chame no início da partida. */
  tocarMusica() {
    this._musicaDesejada = true;
    if (this.ativo) this._darPlay(this.musica);
  }

  /** Pausa mantendo a posição — pause, milestone, cutscene. */
  pausarMusica() {
    this._musicaDesejada = false;
    this.musica?.pause();
  }

  /** Para e volta ao início — game over. */
  pararMusica() {
    this._musicaDesejada = false;
    if (!this.musica) return;
    this.musica.pause();
    this.musica.currentTime = 0;
  }

  /** Dispara um efeito pelo nome registrado no construtor. */
  tocar(nome) {
    if (!this.ativo) return;
    const efeito = this.efeitos[nome];
    if (!efeito) {
      console.warn(`[AudioManager] efeito "${nome}" não registrado.`);
      return;
    }
    efeito.currentTime = 0;
    this._darPlay(efeito);
  }

  _darPlay(audio) {
    // play() rejeita quando o navegador ainda não viu um gesto do usuário ou
    // quando o arquivo não existe. Engolimos para não quebrar o loop do jogo.
    audio?.play?.().catch(() => {});
  }

  /* ---- botão de mute ---- */

  /**
   * Conecta um botão de som, substituindo os listeners duplicados por página.
   * @param {string|Element} alvo
   * @param {{ligado?: string, desligado?: string}} [rotulos]
   */
  ligarBotao(alvo, rotulos = {}) {
    const btn = elemento(alvo);
    if (!btn) return this;
    const config = {
      btn,
      ligado: rotulos.ligado ?? '🔊',
      desligado: rotulos.desligado ?? '🔇',
    };
    this.botoes.push(config);
    btn.addEventListener('click', () => this.alternar());
    this._pintar(config);
    return this;
  }

  _atualizarBotoes() {
    this.botoes.forEach((c) => this._pintar(c));
  }

  _pintar({ btn, ligado, desligado }) {
    btn.innerHTML = this.ativo ? ligado : desligado;
    btn.classList.toggle('on', this.ativo);
  }
}

/* -----------------------------------------------------------------------------
   5. LOOP DE ANIMAÇÃO ROBUSTO
   -----------------------------------------------------------------------------
   Resolve o "teletransporte" do Love Bird e a dependência de frame-rate do
   Guardião Estelar.

   a) Ao pausar por overlay/milestone, o loop parava mas o relógio do
      requestAnimationFrame continuava correndo. No resume,
      `timestamp - lastTime` valia vários segundos e a física era integrada de
      uma vez só.
      -> resumir() zera o relógio: o primeiro quadro após a pausa tem delta 0.
   b) Trocar de aba ou receber ligação congela o rAF. Mesmo efeito.
      -> autoPausar: true congela o relógio sozinho no visibilitychange.
   c) O Guardião contava frames++ e usava frames % 12 para atirar. Num monitor
      de 144 Hz o jogo roda 2,4x mais rápido que num de 60 Hz.
      -> passoFixo: 1/60 executa a lógica em passos fixos de 60 Hz, mantendo a
         mecânica idêntica em qualquer tela.

     const loop = new GameLoop((dt) => atualizar(dt), { maxDelta: 0.1 });
     loop.iniciar();  loop.pausar();  loop.resumir();
----------------------------------------------------------------------------- */

export class GameLoop {
  /**
   * @param {(delta: number, tempoTotal: number) => void} atualizar delta em segundos
   * @param {object} [opcoes]
   * @param {number} [opcoes.maxDelta=0.1] teto do delta, evita atravessar paredes
   * @param {number|null} [opcoes.passoFixo=null] ex.: 1/60 para lógica determinística
   * @param {number} [opcoes.maxPassos=5] teto de passos por quadro (anti espiral da morte)
   * @param {boolean} [opcoes.autoPausar=true] congela o relógio ao esconder a aba
   */
  constructor(atualizar, {
    maxDelta = 0.1,
    passoFixo = null,
    maxPassos = 5,
    autoPausar = true,
  } = {}) {
    this.atualizar = atualizar;
    this.maxDelta = maxDelta;
    this.passoFixo = passoFixo;
    this.maxPassos = maxPassos;

    this.rodando = false;
    this.pausado = false;
    this.tempoTotal = 0;

    this._rafId = null;
    this._ultimoTempo = 0; // 0 = relógio zerado, próximo quadro tem delta 0
    this._acumulador = 0;
    this._quadro = this._quadro.bind(this);

    if (autoPausar) {
      document.addEventListener('visibilitychange', () => this._congelarRelogio());
    }
  }

  /** Zera o relógio sem mexer no estado de pausa. */
  _congelarRelogio() {
    this._ultimoTempo = 0;
    this._acumulador = 0;
  }

  iniciar() {
    if (this.rodando) this.parar(); // nunca deixa dois rAF concorrentes vivos
    this.rodando = true;
    this.pausado = false;
    this.tempoTotal = 0;
    this._congelarRelogio();
    this._rafId = requestAnimationFrame(this._quadro);
    return this;
  }

  parar() {
    this.rodando = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    return this;
  }

  pausar() {
    if (!this.rodando) return this;
    this.pausado = true;
    this._congelarRelogio();
    return this;
  }

  /** Retoma sem salto de tempo. É este reset que elimina o teletransporte. */
  resumir() {
    if (!this.rodando) return this.iniciar();
    this.pausado = false;
    this._congelarRelogio();
    return this;
  }

  alternarPausa() {
    return this.pausado ? this.resumir() : this.pausar();
  }

  _quadro(timestamp) {
    if (!this.rodando) return;
    this._rafId = requestAnimationFrame(this._quadro);

    if (this.pausado) {
      this._ultimoTempo = 0;
      return;
    }

    if (!this._ultimoTempo) this._ultimoTempo = timestamp;
    let delta = (timestamp - this._ultimoTempo) / 1000;
    this._ultimoTempo = timestamp;
    delta = Math.min(delta, this.maxDelta);

    if (this.passoFixo) {
      this._acumulador += delta;
      let passos = 0;
      while (this._acumulador >= this.passoFixo && passos < this.maxPassos) {
        this.tempoTotal += this.passoFixo;
        this.atualizar(this.passoFixo, this.tempoTotal);
        this._acumulador -= this.passoFixo;
        passos++;
        if (!this.rodando || this.pausado) return;
      }
      if (passos === this.maxPassos) this._acumulador = 0;
    } else {
      this.tempoTotal += delta;
      this.atualizar(delta, this.tempoTotal);
    }
  }
}

/* -----------------------------------------------------------------------------
   6. ITERAÇÃO SEGURA COM REMOÇÃO
   -----------------------------------------------------------------------------
   O bug clássico do Guardião Estelar:

     bullets.forEach((b, i) => { ...; if (saiuDaTela) bullets.splice(i, 1); });

   Ao remover o índice 3, o antigo 4 vira 3 — mas o forEach já vai para o 4.
   O elemento pulado não é desenhado nem testado por colisão naquele quadro.
   Com 5 tiros simultâneos (tiro especial) isso vira falha visível.

   Percorrer de trás para frente resolve: remover o índice i não afeta os
   índices ainda não visitados (0..i-1).
----------------------------------------------------------------------------- */

/**
 * Percorre a lista de trás para frente. Retorne exatamente `true` para remover
 * o item atual.
 * @template T
 * @param {T[]} lista
 * @param {(item: T, indice: number) => boolean|void} passo
 */
export function atualizarEPodar(lista, passo) {
  for (let i = lista.length - 1; i >= 0; i--) {
    if (passo(lista[i], i) === true) lista.splice(i, 1);
  }
}

/**
 * Remove in-place todos os itens que satisfazem o teste, sem pular índices.
 * @returns {number} quantidade removida
 */
export function removerSe(lista, teste) {
  let removidos = 0;
  for (let i = lista.length - 1; i >= 0; i--) {
    if (teste(lista[i], i)) {
      lista.splice(i, 1);
      removidos++;
    }
  }
  return removidos;
}

/* -----------------------------------------------------------------------------
   7. MATEMÁTICA E COLISÃO
----------------------------------------------------------------------------- */

export const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

export const aleatorio = (min, max) => Math.random() * (max - min) + min;

export const aleatorioInt = (min, max) => Math.floor(aleatorio(min, max + 1));

/** Colisão AABB. Cada caixa é {x, y, width, height}. */
export function colidem(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Embaralha uma cópia da lista (Fisher-Yates).
 * O `sort(() => Math.random() - 0.5)` do código original é enviesado: algumas
 * posições recebiam buraco negro com mais frequência que outras.
 */
export function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/* -----------------------------------------------------------------------------
   8. ENTRADA DO JOGADOR
----------------------------------------------------------------------------- */

/**
 * Converte evento de mouse/toque em coordenadas internas do canvas,
 * respeitando o escalonamento CSS (canvas width=360 exibido a ~95vw).
 */
export function posicaoNoCanvas(evento, canvas) {
  const ponto = evento.touches?.[0] ?? evento.changedTouches?.[0] ?? evento;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ponto.clientX - rect.left) * (canvas.width / rect.width),
    y: (ponto.clientY - rect.top) * (canvas.height / rect.height),
  };
}

/* -----------------------------------------------------------------------------
   9. PWA
   -----------------------------------------------------------------------------
   O sw.js existe no repositório mas nunca era registrado por página nenhuma —
   por isso o "Instalar app" não aparecia no Chrome.
----------------------------------------------------------------------------- */

export function registrarServiceWorker(caminho = 'sw.js') {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(caminho).catch(() => {});
  });
}
