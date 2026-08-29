#!/usr/bin/env node
/* =============================================================================
   ferramentas/verificar.mjs
   -----------------------------------------------------------------------------
   VERIFICADOR DO JOSY ARCADE.

   Roda sozinho a cada commit (pelo GitHub Actions) e falha se algo estiver
   errado. Serve para pegar erro de publicação ANTES de chegar no celular da
   Josy — como colar o código de um jogo no arquivo de outro.

   Não usa nenhuma biblioteca: só Node puro. Roda em 1 segundo.

   Para rodar na mão, se um dia quiser:
       node ferramentas/verificar.mjs
   ============================================================================= */

import fs from 'fs';
import path from 'path';

const RAIZ = process.argv[2] || process.cwd();
const problemas = [];
const avisos = [];
let checagens = 0;

const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

function checar(condicao, mensagem, detalhe = '') {
  checagens++;
  if (!condicao) problemas.push(detalhe ? `${mensagem}\n      ${detalhe}` : mensagem);
  return condicao;
}

/* -----------------------------------------------------------------------------
   1. CADA JOGO ESTÁ NO ARQUIVO CERTO
   -----------------------------------------------------------------------------
   Esta é a checagem que pega o erro de copiar o conteúdo para o arquivo errado.
   Cada módulo tem uma marca que só ele pode ter: a chave onde grava o placar e
   um trecho característico do código.
----------------------------------------------------------------------------- */

const JOGOS = [
  {
    modulo: 'src/js/games/love-bird.js',
    pagina: 'love_bird.html',
    nome: 'Love Bird',
    exige: ['CHAVES.LOVE_BIRD', 'IMPULSO_PULO', 'MILESTONES'],
    proibe: ['CHAVES.GUARDIAO', 'CHAVES.MINADO', 'CHAVES.BUSCA_ESTELAR'],
  },
  {
    modulo: 'src/js/games/guerra-estelar.js',
    pagina: 'guerra_estelar.html',
    nome: 'Guardião do Amor',
    exige: ['CHAVES.GUARDIAO_VITORIAS', 'CHAVES.GUARDIAO_RECORDE', 'TIPOS_INIMIGO'],
    proibe: ['CHAVES.LOVE_BIRD', 'CHAVES.MINADO', 'CHAVES.BUSCA_ESTELAR'],
  },
  {
    modulo: 'src/js/games/minado.js',
    pagina: 'campo_minado.html',
    nome: 'Minado Amorous',
    exige: ['CHAVES.MINADO', 'contarCoracoesVizinhos'],
    proibe: ['CHAVES.LOVE_BIRD', 'CHAVES.GUARDIAO', 'CHAVES.BUSCA_ESTELAR'],
  },
  {
    modulo: 'src/js/games/busca-estelar.js',
    pagina: 'batalha_estelar.html',
    nome: 'Busca Estelar',
    exige: ['CHAVES.BUSCA_ESTELAR'],
    proibe: ['CHAVES.LOVE_BIRD', 'CHAVES.GUARDIAO', 'CHAVES.MINADO'],
  },
  {
    modulo: 'src/js/games/menu.js',
    pagina: 'index.html',
    nome: 'Menu',
    exige: ['carregarPlacarGlobal', 'observarChat'],
    proibe: [],
  },
];

console.log('\n== 1. CADA JOGO NO SEU ARQUIVO ==');
for (const jogo of JOGOS) {
  if (!checar(existe(jogo.modulo), `Falta o arquivo ${jogo.modulo}`)) continue;
  const txt = ler(jogo.modulo);

  const faltando = jogo.exige.filter((m) => !txt.includes(m));
  const intrusos = jogo.proibe.filter((m) => txt.includes(m));

  const ok = checar(
    faltando.length === 0 && intrusos.length === 0,
    `${jogo.modulo} NÃO contém o código do ${jogo.nome}`,
    intrusos.length
      ? `parece ser de outro jogo (achei ${intrusos.join(', ')})`
      : `faltam marcas do jogo: ${faltando.join(', ')}`
  );
  console.log(`  ${ok ? '✔' : '✖'} ${jogo.modulo.padEnd(32)} ${jogo.nome}`);
}

/* -----------------------------------------------------------------------------
   2. A PÁGINA CARREGA O MÓDULO CERTO
----------------------------------------------------------------------------- */

console.log('\n== 2. CADA PÁGINA CHAMA O SEU MÓDULO ==');
for (const jogo of JOGOS) {
  if (!existe(jogo.pagina)) continue;
  const html = ler(jogo.pagina);
  const achado = (html.match(/src="(src\/js\/games\/[^"]+)"/) || [])[1];
  const ok = checar(
    achado === jogo.modulo,
    `${jogo.pagina} carrega "${achado}" em vez de "${jogo.modulo}"`
  );
  console.log(`  ${ok ? '✔' : '✖'} ${jogo.pagina.padEnd(24)} -> ${achado || '(nenhum)'}`);
}

/* -----------------------------------------------------------------------------
   3. TODO $('#id') DO JS EXISTE NO HTML
   -----------------------------------------------------------------------------
   Um id que o JS procura e o HTML não tem vira "null.addEventListener" e a
   página inteira morre. É o sintoma de arquivo trocado, e também de esquecer
   de subir o HTML junto com o JS.
----------------------------------------------------------------------------- */

console.log('\n== 3. SELETORES DO JS EXISTEM NO HTML ==');
for (const jogo of JOGOS) {
  if (!existe(jogo.modulo) || !existe(jogo.pagina)) continue;
  const ids = new Set([...ler(jogo.pagina).matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const busca = new Set([...ler(jogo.modulo).matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]));
  const orfaos = [...busca].filter((id) => !ids.has(id));
  const ok = checar(
    orfaos.length === 0,
    `${jogo.modulo} procura ids que não existem em ${jogo.pagina}`,
    orfaos.join(', ')
  );
  console.log(`  ${ok ? '✔' : '✖'} ${jogo.pagina.padEnd(24)} ${busca.size} seletores${orfaos.length ? ` — ÓRFÃOS: ${orfaos.join(', ')}` : ''}`);
}

/* -----------------------------------------------------------------------------
   4. IMPORTS x EXPORTS
   -----------------------------------------------------------------------------
   Em módulo ES6, importar algo que não existe é erro FATAL de carregamento:
   a página fica em branco. Já aconteceu com versaoDoServiceWorker.
----------------------------------------------------------------------------- */

console.log('\n== 4. TODO IMPORT TEM O EXPORT CORRESPONDENTE ==');
function listarJs(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
    const rel = `${dir}/${nome}`;
    if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) saida.push(...listarJs(rel));
    else if (nome.endsWith('.js')) saida.push(rel);
  }
  return saida;
}

const modulos = existe('src/js') ? listarJs('src/js') : [];
let problemasImport = 0;

/** Tira comentários antes de procurar imports — os cabeçalhos têm exemplos de
 *  código que não são imports de verdade. */
function semComentarios(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

for (const rel of modulos) {
  const txt = semComentarios(ler(rel));
  for (const [, bloco, origem] of txt.matchAll(/import \{([^}]+)\} from '([^']+)'/g)) {
    if (origem.startsWith('http')) continue;
    const alvo = path.posix.normalize(path.posix.join(path.posix.dirname(rel), origem));
    if (!existe(alvo)) {
      checar(false, `${rel} importa de "${origem}", que não existe`);
      problemasImport++;
      continue;
    }
    const destino = semComentarios(ler(alvo));
    const exportados = new Set([
      ...[...destino.matchAll(/export (?:async function|function|const|class) ([\w$]+)/g)].map((m) => m[1]),
      ...[...destino.matchAll(/export \{([^}]+)\}/g)].flatMap((m) =>
        m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)
      ),
    ]);
    for (const nome of bloco.split(',').map((x) => x.trim()).filter(Boolean)) {
      const limpo = nome.split(/\s+as\s+/)[0].trim();
      if (!exportados.has(limpo)) {
        checar(false, `${rel} importa "${limpo}" de ${origem}, mas lá não existe esse export`);
        problemasImport++;
      }
    }
  }
}
console.log(`  ${problemasImport === 0 ? '✔' : '✖'} ${modulos.length} módulos verificados${problemasImport ? ` — ${problemasImport} import(s) quebrado(s)` : ''}`);

/* -----------------------------------------------------------------------------
   5. TODO SOM REFERENCIADO EXISTE
----------------------------------------------------------------------------- */

console.log('\n== 5. ARQUIVOS DE SOM ==');
if (existe('assets/sounds')) {
  const reais = new Set(fs.readdirSync(path.join(RAIZ, 'assets/sounds')));
  const usados = new Map();
  for (const rel of modulos) {
    if (rel.endsWith('utils.js')) continue; // só tem exemplo em comentário
    for (const [, arq] of ler(rel).matchAll(/som\('([^']+)'\)/g)) {
      if (!usados.has(arq)) usados.set(arq, []);
      usados.get(arq).push(path.basename(rel));
    }
  }
  const quebrados = [...usados.keys()].filter((a) => !reais.has(a));
  checar(quebrados.length === 0, 'Sons referenciados que não existem em assets/sounds', quebrados.join(', '));
  console.log(`  ${quebrados.length === 0 ? '✔' : '✖'} ${usados.size} sons usados${quebrados.length ? ` — FALTAM: ${quebrados.join(', ')}` : ''}`);

  const semUso = [...reais].filter((a) => !usados.has(a) && /\.(aac|wav|mp3|ogg)$/i.test(a));
  if (semUso.length) avisos.push(`Sons no repositório que ninguém usa: ${semUso.join(', ')}`);
}

/* -----------------------------------------------------------------------------
   6. VERSÃO IGUAL NOS DOIS LUGARES
   -----------------------------------------------------------------------------
   Se sw.js e versao.js discordam, o cache não é invalidado e a atualização não
   chega no celular — parece que o deploy não funcionou.
----------------------------------------------------------------------------- */

console.log('\n== 6. VERSÃO ==');
if (existe('sw.js') && existe('src/js/versao.js')) {
  const vSw = (ler('sw.js').match(/const VERSAO = '([^']+)'/) || [])[1];
  const vJs = (ler('src/js/versao.js').match(/export const VERSAO = '([^']+)'/) || [])[1];
  const ok = checar(
    vSw && vJs && vSw === vJs,
    `Versão diferente: sw.js diz "${vSw}" e versao.js diz "${vJs}"`,
    'O cache não vai ser invalidado e a atualização não chega nos aparelhos.'
  );
  console.log(`  ${ok ? '✔' : '✖'} sw.js=${vSw}  versao.js=${vJs}`);

  const temNota = ler('src/js/versao.js').includes(`versao: '${vJs}'`);
  if (!temNota) avisos.push(`A versão ${vJs} não tem bloco de novidades no HISTORICO.`);
}

/* -----------------------------------------------------------------------------
   7. PRECACHE DO SERVICE WORKER
----------------------------------------------------------------------------- */

console.log('\n== 7. PRECACHE DO SERVICE WORKER ==');
if (existe('sw.js')) {
  const sw = ler('sw.js');
  for (const nome of ['ARQUIVOS_APP', 'ARQUIVOS_MIDIA']) {
    const bloco = (sw.match(new RegExp(nome + ' = \\[([\\s\\S]*?)\\];')) || [])[1] || '';
    const itens = [...bloco.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
    const faltam = itens.filter((i) => !existe(i));
    const ok = checar(faltam.length === 0, `${nome} lista arquivos que não existem`, faltam.join(', '));
    console.log(`  ${ok ? '✔' : '✖'} ${nome}: ${itens.length} itens${faltam.length ? ` — FALTAM: ${faltam.join(', ')}` : ''}`);
  }
}

/* -----------------------------------------------------------------------------
   8. RESTOS DE VERSÕES ANTIGAS
----------------------------------------------------------------------------- */

console.log('\n== 8. CÓDIGO ANTIGO QUE FICOU PARA TRÁS ==');
const REMOVIDOS = [
  ['ligarBotao', 'a função do botão 🔊 foi removida na 5.3.0'],
  ['baixarMidiaOffline', 'substituída por completarMidiaOffline na 5.0.1'],
  ['btn-sound', 'o botão de som virou o painel SOM no perfil'],
];
let restos = 0;
for (const rel of [...modulos, ...fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'))]) {
  const txt = ler(rel);
  for (const [termo, motivo] of REMOVIDOS) {
    if (rel.endsWith('.css')) continue;
    if (txt.includes(termo)) {
      checar(false, `${rel} ainda usa "${termo}" — ${motivo}`);
      restos++;
    }
  }
}
console.log(`  ${restos === 0 ? '✔' : '✖'} ${restos === 0 ? 'nada obsoleto' : `${restos} ocorrência(s)`}`);

/* -----------------------------------------------------------------------------
   9. CHAVE VAPID
----------------------------------------------------------------------------- */

console.log('\n== 9. NOTIFICAÇÕES ==');
if (existe('src/js/notificacoes.js')) {
  const chave = (ler('src/js/notificacoes.js').match(/CHAVE_VAPID = '([^']*)'/) || [])[1] || '';
  const ok = checar(
    chave.length > 80 && !chave.startsWith('COLE'),
    'A chave VAPID não foi preenchida em src/js/notificacoes.js',
    'Sem ela o botão de notificações não aparece.'
  );
  console.log(`  ${ok ? '✔' : '✖'} chave com ${chave.length} caracteres`);
}

/* -----------------------------------------------------------------------------
   RESULTADO
----------------------------------------------------------------------------- */

console.log('\n' + '='.repeat(70));
if (avisos.length) {
  console.log('\nAVISOS (não impedem a publicação):');
  avisos.forEach((a) => console.log('  ! ' + a));
}
if (problemas.length === 0) {
  console.log(`\n✔ TUDO CERTO — ${checagens} verificações passaram.\n`);
  process.exit(0);
}
console.log(`\n✖ ${problemas.length} PROBLEMA(S) — NÃO PUBLIQUE ASSIM:\n`);
problemas.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
console.log('');
process.exit(1);
