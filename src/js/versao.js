/* =============================================================================
   src/js/versao.js
   -----------------------------------------------------------------------------
   VERSÃO E HISTÓRICO DE MUDANÇAS DO JOSY ARCADE.

   ⚠️  AO PUBLICAR UMA VERSÃO NOVA, MEXA EM DOIS LUGARES:
       1. a constante VERSAO aqui embaixo
       2. a constante VERSAO no topo do sw.js  (tem que ser o MESMO texto)

   Se os dois não baterem, o menu avisa no console do navegador. É a proteção
   contra o erro clássico de publicar e o celular continuar mostrando o app
   velho porque o cache não foi invalidado.

   COMO A TELA DE NOVIDADES APARECE
   O app guarda no aparelho qual foi a última versão vista. Quando ela abre e
   a versão do código é diferente da guardada, a tela de novidades aparece
   sozinha — igual atualização de aplicativo. Na primeiríssima instalação não
   aparece nada, porque não há "novidade" em relação a nada.

   NUMERAÇÃO
     5.x  -> o arcade com 5 jogos
     .1   -> mudança grande dentro dessa geração
     .0.1 -> ajuste menor
   ============================================================================= */

export const VERSAO = '5.3.0';

/**
 * Histórico, do mais novo para o mais antigo.
 * `destaque: true` deixa o item em rosa, para o que mais importa da versão.
 */
export const HISTORICO = [
  {
    versao: '5.3.0',
    titulo: 'SOM, CHAT E TABULEIROS MAIORES',
    itens: [
      { texto: 'Controle de volume separado para música e efeitos', destaque: true },
      { texto: 'O botão de mudo saiu do canto e virou o menu SOM no perfil' },
      { texto: 'Tabuleiros crescem com a tela (bem maiores no computador)', destaque: true },
      { texto: 'Chat virou uma janela larga e legível no computador', destaque: true },
      { texto: 'Recado de voz: só tocar e parar, sem a barrinha de posição' },
      { texto: 'A nave do Guardião ganhou mais espaço de manobra' },
      { texto: 'Celular deitado não corta mais o tabuleiro' },
    ],
  },
  {
    versao: '5.1.2',
    titulo: 'O NÃO APRENDEU A FICAR NA TELA',
    itens: [
      { texto: 'O botão NÃO agora corre pela tela inteira, sem escapar', destaque: true },
    ],
  },
  {
    versao: '5.1.1',
    titulo: 'CORREÇÃO DAS NOTIFICAÇÕES',
    itens: [
      { texto: 'Tocar na notificação agora abre o jogo, e não uma página de erro', destaque: true },
      { texto: 'Se o arcade já estiver aberto, ele é trazido para a frente' },
    ],
  },
  {
    versao: '5.1.0',
    titulo: 'VOZ, NOTIFICAÇÕES E SONS NOVOS',
    itens: [
      { texto: 'Recado de voz no chat: grave, ouça antes e mande', destaque: true },
      { texto: 'Notificação no celular quando chega mensagem', destaque: true },
      { texto: 'Notificação quando o outro bate um recorde ou vence' },
      { texto: 'Ative em: foto de perfil → ATIVAR NOTIFICAÇÕES' },
      { texto: 'Trilha sonora nova em todos os jogos', destaque: true },
      { texto: 'Love Bird ganhou som de voar, de ponto e de batida' },
      { texto: 'O app baixa tudo na instalação e roda 100% sem internet' },
      { texto: 'O botão NÃO não foge mais para fora da tela' },
      { texto: 'Tela de novidades a cada atualização' },
    ],
  },
  {
    versao: '5.0.0',
    titulo: 'REFATORAÇÃO E MODO OFFLINE',
    itens: [
      { texto: 'Placar da Busca Estelar e do Minado voltou a funcionar', destaque: true },
      { texto: 'Recorde do Guardião (Modo Recorde) agora aparece no placar' },
      { texto: 'Love Bird não "teleporta" mais depois das pausas' },
      { texto: 'Guardião com colisão de tiros corrigida' },
      { texto: 'Pontuações feitas offline sobem sozinhas ao reconectar' },
      { texto: 'O arcade virou aplicativo instalável' },
    ],
  },
];

/** As novidades da versão que está rodando agora. */
export function novidadesAtuais() {
  return HISTORICO.find((v) => v.versao === VERSAO) || null;
}

const CHAVE_VISTA = 'josy-arcade:versao-vista';

/**
 * Decide se a tela de novidades deve abrir.
 * @returns {boolean} true quando é uma atualização (nunca na primeira instalação)
 */
export function deveMostrarNovidades() {
  try {
    const vista = localStorage.getItem(CHAVE_VISTA);
    if (!vista) {
      // Primeira vez neste aparelho: só registra, não incomoda com novidades
      localStorage.setItem(CHAVE_VISTA, VERSAO);
      return false;
    }
    return vista !== VERSAO;
  } catch {
    return false;
  }
}

/** Marca a versão atual como já vista. */
export function marcarNovidadesVistas() {
  try {
    localStorage.setItem(CHAVE_VISTA, VERSAO);
  } catch {
    /* silencioso */
  }
}
