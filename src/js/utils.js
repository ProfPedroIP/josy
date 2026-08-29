/* Base compartilhada: DOM, viewport, áudio, loop de jogo e listas. */

export const ASSETS = 'assets';
export const som = (arquivo) => `${ASSETS}/sounds/${arquivo}`;
export const imagem = (arquivo) => `${ASSETS}/images/${arquivo}`;

export const $ = (seletor, raiz = document) =>
  typeof seletor === 'string' ? raiz.querySelector(seletor) : seletor;

export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

// querySelector lança erro se a string não for um seletor (ex.: uma URL).
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

// Volume vale para o arcade inteiro: cada página lê e escuta esta config.
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

export function salvarConfigAudio(parcial) {
  const config = { ...lerConfigAudio(), ...parcial };
  try {
    localStorage.setItem(CHAVE_AUDIO, JSON.stringify(config));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENTO_AUDIO, { detail: config }));
  return config;
}

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

export class AudioManager {
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

  _criarAudio(origem, { loop = false } = {}) {
    if (!origem) return null;
    let audio = null;
    if (origem instanceof HTMLAudioElement) audio = origem;
    // Só trata como seletor quando começa com # ou . — o resto é URL.
    else if (typeof origem === 'string' && /^[#.]/.test(origem)) {
      const el = elemento(origem);
      if (el instanceof HTMLAudioElement) audio = el;
    }
    if (!audio) audio = new Audio(origem);
    audio.loop = loop;
    audio.preload = 'auto';
    return audio;
  }

  tocarMusica() {
    this._musicaDesejada = true;
    if (this.ativo && this.config.musica > 0) this._darPlay(this.musica);
  }

  pausarMusica() {
    this._musicaDesejada = false;
    this.musica?.pause();
  }

  pararMusica() {
    this._musicaDesejada = false;
    if (!this.musica) return;
    this.musica.pause();
    this.musica.currentTime = 0;
  }

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
    audio?.play?.().catch(() => {});
  }

  destruir() {
    this._cancelar?.();
    this.pararMusica();
  }
}

export class GameLoop {
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
    this._ultimoTempo = 0;
    this._acumulador = 0;
    this._quadro = this._quadro.bind(this);

    if (autoPausar) {
      document.addEventListener('visibilitychange', () => this._congelarRelogio());
    }
  }

  // Zerar o relógio faz o próximo quadro ter delta 0.
  // É isso que evita o salto de tempo ao voltar de uma pausa.
  _congelarRelogio() {
    this._ultimoTempo = 0;
    this._acumulador = 0;
  }

  iniciar() {
    if (this.rodando) this.parar();
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

    // Passo fixo mantém a mecânica idêntica em telas de 60 e 144 Hz.
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

// De trás para frente: remover um item não pula o seguinte.
export function atualizarEPodar(lista, passo) {
  for (let i = lista.length - 1; i >= 0; i--) {
    if (passo(lista[i], i) === true) lista.splice(i, 1);
  }
}

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

export const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

export const aleatorio = (min, max) => Math.random() * (max - min) + min;

export const aleatorioInt = (min, max) => Math.floor(aleatorio(min, max + 1));

export function colidem(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Fisher-Yates. O sort(() => Math.random() - 0.5) é enviesado.
export function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// O canvas é escalado por CSS; converte para as coordenadas internas.
export function posicaoNoCanvas(evento, canvas) {
  const ponto = evento.touches?.[0] ?? evento.changedTouches?.[0] ?? evento;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ponto.clientX - rect.left) * (canvas.width / rect.width),
    y: (ponto.clientY - rect.top) * (canvas.height / rect.height),
  };
}
