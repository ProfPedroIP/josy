/* Grava, deixa ouvir e envia o recado de voz do chat. */

import {
  getStorage,
  ref as refStorage,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

import { app } from './firebase-config.js';

export const LIMITE_SEGUNDOS = 60;
const TETO_BYTES = 3 * 1024 * 1024;

const storage = getStorage(app);

// Cada navegador grava num formato diferente; usamos o primeiro aceito.
const FORMATOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function melhorFormato() {
  if (typeof MediaRecorder === 'undefined') return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported?.(f)) || null;
}

function extensaoDe(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function gravacaoSuportada() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!melhorFormato()
  );
}

let estado = 'parado';
let gravador = null;
let trilha = null;
let pedacos = [];
let inicio = 0;
let cronometro = null;

let blobGravado = null;
let urlPreview = null;
let duracaoGravada = 0;

const ouvintes = new Set();

export function onMudanca(cb) {
  ouvintes.add(cb);
  cb(situacao());
  return () => ouvintes.delete(cb);
}

export function situacao() {
  return {
    estado,
    segundos: estado === 'gravando' ? Math.floor((Date.now() - inicio) / 1000) : 0,
    duracao: duracaoGravada,
    url: urlPreview,
  };
}

function avisar() {
  const s = situacao();
  ouvintes.forEach((cb) => cb(s));
}

export async function gravar() {
  if (estado !== 'parado') return { ok: false, motivo: 'Já existe uma gravação em andamento.' };
  if (!gravacaoSuportada()) {
    return { ok: false, motivo: 'Este aparelho não permite gravar áudio pelo navegador.' };
  }

  let fluxo;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (erro) {
    const negou = erro?.name === 'NotAllowedError' || erro?.name === 'SecurityError';
    return {
      ok: false,
      motivo: negou
        ? 'Você precisa liberar o microfone para gravar.'
        : 'Não achei um microfone neste aparelho.',
    };
  }

  descartarPreview();
  trilha = fluxo;
  pedacos = [];

  const mime = melhorFormato();
  gravador = new MediaRecorder(fluxo, { mimeType: mime });
  gravador.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) pedacos.push(e.data);
  };
  gravador.onstop = fecharGravacao;

  gravador.start();
  estado = 'gravando';
  inicio = Date.now();

  cronometro = setInterval(() => {
    const s = Math.floor((Date.now() - inicio) / 1000);
    if (s >= LIMITE_SEGUNDOS) parar();
    else avisar();
  }, 250);

  avisar();
  return { ok: true };
}

export function parar() {
  if (estado !== 'gravando' || !gravador) return;
  clearInterval(cronometro);
  cronometro = null;
  duracaoGravada = Math.max(1, Math.round((Date.now() - inicio) / 1000));
  gravador.stop();
}

// Precisa soltar o microfone, senão a luz de gravando fica acesa no celular.
function fecharGravacao() {
  const mime = gravador?.mimeType || melhorFormato() || 'audio/webm';
  blobGravado = new Blob(pedacos, { type: mime });
  pedacos = [];

  trilha?.getTracks().forEach((t) => t.stop());
  trilha = null;
  gravador = null;

  urlPreview = URL.createObjectURL(blobGravado);
  estado = blobGravado.size > 0 ? 'pronto' : 'parado';
  avisar();
}

export function descartar() {
  if (estado === 'gravando') {
    clearInterval(cronometro);
    cronometro = null;
    try {
      gravador?.stop();
    } catch {}
    trilha?.getTracks().forEach((t) => t.stop());
    trilha = null;
    gravador = null;
  }
  descartarPreview();
  estado = 'parado';
  avisar();
}

function descartarPreview() {
  if (urlPreview) URL.revokeObjectURL(urlPreview);
  urlPreview = null;
  blobGravado = null;
  duracaoGravada = 0;
}

export async function enviar(uid) {
  if (estado !== 'pronto' || !blobGravado) {
    return { ok: false, motivo: 'Não há nada gravado para enviar.' };
  }
  if (!uid) return { ok: false, motivo: 'Faça login primeiro.' };
  if (blobGravado.size > TETO_BYTES) {
    return { ok: false, motivo: 'O recado ficou grande demais. Grave um mais curto.' };
  }

  estado = 'enviando';
  avisar();

  try {
    const extensao = extensaoDe(blobGravado.type);
    const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
    const destino = refStorage(storage, `chat_audio/${uid}/${nome}`);

    await uploadBytes(destino, blobGravado, { contentType: blobGravado.type });
    const url = await getDownloadURL(destino);
    const duracao = duracaoGravada;

    descartarPreview();
    estado = 'parado';
    avisar();

    return { ok: true, url, duracao };
  } catch (erro) {
    console.error('[audio-chat] falha no envio:', erro);
    estado = 'pronto';
    avisar();
    return {
      ok: false,
      motivo: navigator.onLine
        ? 'Não consegui enviar o recado. Tente de novo.'
        : 'Sem internet. Recado de voz precisa de conexão.',
    };
  }
}

export function formatarTempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
