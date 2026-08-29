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
   4. CONFIGURAÇÃO DE SOM (única para o arcade inteiro)
   -----------------------------------------------------------------------------
   Antes cada página tinha um botão 🔊/🔇 no canto e só isso: ligado ou mudo.
   Agora existe um painel de configurações no menu com volume separado para
   música e efeitos, e a preferência vale em todas as páginas.

   Como as páginas são arquivos diferentes, a configuração mora no
   localStorage. Mudanças disparam evento na mesma página e o `storage` avisa
   as outras abas.
----------------------------------------------------------------------------- */

const CHAVE_AUDIO = 'josy-arcade:audio';
const PADRAO_AUDIO = { musica: 0.5, efeitos: 0.8, mudo: false };
const EVENTO_AUDIO = 'josy-arcade:audio-mudou';

export function lerConfigAudio() {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE_AUDIO) || '{}');
    return {
      musica: limitar(Number(cru.musica ?? PADRAO_AUDIO.musica), 0, 1),
      efeitos: limitar(Number(cru.efeitos ?? PADRAO_AUDIO.efeitos), 0, 1),
      mudo: !!cru.mudo,
    };
  } catch {
    return { ...PADRAO_AUDIO };
  }
}

/** Grava só o que mudou e avisa quem estiver ouvindo. */
export function salvarConfigAudio(parcial) {
  const config = { ...lerConfigAudio(), ...parcial };
  try {
    localStorage.setItem(CHAVE_AUDIO, JSON.stringify(config));
  } catch {
    /* silencioso */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_AUDIO, { detail: config }));
  return config;
}

/**
 * Observa mudanças de som. Dispara na hora com o valor atual.
 * @returns {() => void} cancela a inscrição
 */
export function onConfigAudio(callback) {
  const naMesmaPagina = (e) => callback(e.detail);
  const emOutraAba = (e) => {
    if (e.key === CHAVE_AUDIO) callback(lerConfigAudio());
  };
  window.addEventListener(EVENTO_AUDIO, naMesmaPagina);
  window.addEventListener('storage', emOutraAba);
  callback(lerConfigAudio());
  return () => {
    window.removeEventListener(EVENTO_AUDIO, naMesmaPagina);
    window.removeEventListener('storage', emOutraAba);
  };
}

/* -----------------------------------------------------------------------------
   GERENCIADOR DE ÁUDIO
   -----------------------------------------------------------------------------
     const audio = new AudioManager({
       musica: som('happy.aac'),
       efeitos: { pulo: som('flap.wav') },
     });
     audio.tocarMusica();
     audio.tocar('pulo');

   Ele se inscreve na configuração sozinho: mexer no volume pelo menu já muda
   o som do jogo aberto, sem recarregar nada.
----------------------------------------------------------------------------- */

export class AudioManager {
  /**
   * @param {object} opcoes
   * @param {string|HTMLAudioElement} [opcoes.musica]
   * @param {Object<string, string|HTMLAudioElement>} [opcoes.efeitos]
   * @param {number} [opcoes.pesoMusica=1] ajuste fino por jogo (0 a 1)
   * @param {number} [opcoes.pesoEfeitos=1]
   */
  constructor({ musica = null, efeitos = {}, pesoMusica = 1, pesoEfeitos = 1 } = {}) {
    this.pesoMusica = pesoMusica;
    this.pesoEfeitos = pesoEfeitos;

    this.musica = this._criarAudio(musica, { loop: true });
    this.efeitos = {};
    for (const [nome, origem] of Object.entries(efeitos)) {
      this.efeitos[nome] = this._criarAudio(origem);
    }

    this._musicaDesejada = false;
    this.config = lerConfigAudio();
    this._cancelar = onConfigAudio((c) => this._aplicar(c));
  }

  /** True quando o som está audível (não mudo e volume acima de zero). */
  get ativo() {
    return !this.config.mudo;
  }

  _aplicar(config) {
    this.config = config;
    if (this.musica) this.musica.volume = config.mudo ? 0 : config.musica * this.pesoMusica;
    for (const efeito of Object.values(this.efeitos)) {
      efeito.volume = config.mudo ? 0 : config.efeitos * this.pesoEfeitos;
    }
    if (!this.musica) return;
    if (config.mudo || config.musica === 0) this.musica.pause();
    else if (this._musicaDesejada) this._darPlay(this.musica);
  }

  /**
   * Aceita um <audio> do DOM, um seletor CSS que aponte para um, ou uma URL.
   * Só tenta resolver como seletor quando começa com # ou . — senão
   * 'assets/sounds/x.aac' seria lido como seletor inválido e lançaria erro.
   */
  _criarAudio(origem, { loop = false } = {}) {
    if (!origem) return null;
    let audio = null;
    if (origem instanceof HTMLAudioElement) audio = origem;
    else if (typeof origem === 'string' && /^[#.]/.test(origem)) {
      const el = elemento(origem);
      if (el instanceof HTMLAudioElement) audio = el;
    }
    if (!audio) audio = new Audio(origem);
    audio.loop = loop;
    audio.preload = 'auto';
    return audio;
  }

  /** Começa a trilha. Chame no início da partida (precisa de um gesto antes). */
  tocarMusica() {
    this._musicaDesejada = true;
    if (this.ativo && this.config.musica > 0) this._darPlay(this.musica);
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
    if (!this.ativo || this.config.efeitos === 0) return;
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

  /** Solta os ouvintes. Só é preciso se a página trocar de AudioManager. */
  destruir() {
    this._cancelar?.();
    this.pararMusica();
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

/* O registro do Service Worker e o download de mídia offline ficam em
   src/js/offline.js, junto com o resto da lógica de funcionamento sem rede. */
