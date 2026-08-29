/* Versão e novidades. A VERSAO daqui e a do sw.js precisam ser iguais. */

export const VERSAO = '5.3.0';

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

export function novidadesAtuais() {
  return HISTORICO.find((v) => v.versao === VERSAO) || null;
}

const CHAVE_VISTA = 'josy-arcade:versao-vista';

// Só aparece quando é atualização, nunca na primeira instalação.
export function deveMostrarNovidades() {
  try {
    const vista = localStorage.getItem(CHAVE_VISTA);
    if (!vista) {
      localStorage.setItem(CHAVE_VISTA, VERSAO);
      return false;
    }
    return vista !== VERSAO;
  } catch {
    return false;
  }
}

export function marcarNovidadesVistas() {
  try {
    localStorage.setItem(CHAVE_VISTA, VERSAO);
  } catch {}
}
