// Strings de UI — só pt-BR (a língua do servidor LATAM).
import type { EstadoGravacao } from "./lib/gravacoes";
import type { Coluna, Status, Tipo } from "./lib/status";

export const t = {
  siteNome: "Issues",
  siteSub: "Ferramentas RO LATAM",
  siteDescricao:
    "Bugs e sugestões das ferramentas do RO LATAM, num quadro só. Reporte um problema e acompanhe o progresso.",

  // Navegação e filtros
  todosProjetos: "Todos os projetos",
  filtrarProjeto: "Filtrar por projeto",
  filtrarTipo: "Filtrar por tipo",
  todosTipos: "Bugs e sugestões",
  buscar: "Buscar",
  buscarPlaceholder: "Buscar por texto…",
  reportar: "Reportar",
  reportarTitulo: "Reportar um bug ou sugerir uma melhoria",
  voltar: "Voltar ao quadro",

  // Quadro
  carregando: "Carregando…",
  colunaVazia: "Nada por aqui.",
  quadroVazio: "Nenhum item ainda — seja a primeira pessoa a reportar.",
  erroCarregar: "Não consegui carregar o quadro. Recarregue a página.",
  umItem: "1 item",
  nItens: (n: number) => `${n} itens`,

  // Card
  votar: "Votar",
  votarTitulo: "Votar neste item",
  jaVotou: "Você já votou neste item",
  comentariosLabel: (n: number) => (n === 1 ? "1 comentário" : `${n} comentários`),
  reportadoPor: (nick: string) => `por ${nick}`,

  // Formulário
  novoTitulo: "Reportar",
  novoSub: "Conta o que aconteceu. Quanto mais específico, mais rápido dá pra resolver.",
  campoProjeto: "Qual ferramenta?",
  campoTipo: "É um bug ou uma sugestão?",
  campoTituloLabel: "Resumo",
  campoTituloPlaceholder: "Ex.: Falta a carta Mosca Caçadora na lista",
  campoDescricao: "Detalhes",
  campoDescricaoPlaceholder:
    "O que você fez, o que aconteceu e o que você esperava que acontecesse. Se tiver um link do build ou do replay, cole aqui.",
  campoAutor: "Seu nick (opcional)",
  campoAutorAjuda:
    "Aparece publicamente no card e nas novidades, como crédito. Deixe em branco se preferir não aparecer.",
  campoAnexos: "Anexos (opcional)",
  campoAnexosAjuda:
    "Replay .rrf ou print da tela — até 5 arquivos. Imagem grande é reduzida automaticamente antes de enviar.",
  campoImagens: "Imagens (opcional)",
  campoImagensAjuda:
    "Print para ilustrar a atualização — até 5. Imagem grande é reduzida automaticamente antes de enviar.",
  anexoPreparando: "Preparando os arquivos…",
  anexoTipoInvalido: (nome: string) => `${nome}: só aceito .rrf e imagem.`,
  anexoSoImagem: (nome: string) => `${nome}: aqui só entra imagem.`,
  anexoGrande: (nome: string, max: string) => `${nome}: passa de ${max}.`,
  anexoFalhou: (nome: string) => `${nome}: não consegui ler o arquivo.`,
  anexoDemais: "Máximo de 5 arquivos.",
  remover: "Remover",
  anexosTitulo: "Anexos",
  baixar: "Baixar",
  abrirImagem: "Abrir em tamanho cheio",

  campoContato: "Contato (opcional)",
  campoContatoAjuda:
    "Discord ou e-mail, caso eu precise de mais detalhes. Não aparece no site — só eu vejo.",
  enviar: "Enviar",
  enviando: "Enviando…",
  enviado: "Obrigado! Seu item entrou na coluna Reportado.",
  erroEnviar: "Não consegui enviar. Tente de novo em alguns segundos.",
  erroTituloCurto: "Escreva um resumo com pelo menos 3 caracteres.",
  espereUmPouco: "Calma lá — espere um pouquinho antes de enviar outro.",

  // Card individual
  naoEncontrado: "Item não encontrado",
  naoEncontradoAjuda: "Ele pode ter sido arquivado, ou o link está errado.",
  semComentarios: "Sem comentários ainda.",
  comentar: "Comentar",
  comentarPlaceholder: "Escreva uma atualização…",

  // Sessão de admin
  entrar: "Entrar com Google",
  sair: "Sair",
  adminEntrarAjuda: "Entre com a conta de administrador para mexer no quadro.",
  semPermissao: "Esta conta não tem permissão para administrar o quadro.",
  semPermissaoAjuda: "Entrar com uma conta Google não dá nenhum acesso de escrita.",
  moverPara: "Mover para",
  arquivar: "Arquivar",
  salvar: "Salvar",
  cancelar: "Cancelar",
  editar: "Editar",
  contatoLabel: "Contato de quem reportou",
  semContato: "Sem contato informado.",

  // Gravações do "Ajude o simulador a acertar as contas"
  gravacoesTitulo: "Gravações do simulador",
  gravacoesSub:
    'Os .rrf que chegam do "Ajude o simulador a acertar as contas". Não são cards: ficam aqui, privadas, até a triagem promover uma — é isso que cria a ficha pública, com a gravação anexada.',
  gravacoesLink: "Gravações",
  erroGravacoes: "Não consegui carregar a fila. Recarregue a página.",
  gravacoesFila: "Na fila",
  gravacoesFilaAjuda: "Esperando decisão. Nada daqui está publicado.",
  gravacoesPromovidas: "Viraram card",
  gravacoesPromovidasAjuda: "A ficha e a gravação estão no quadro público.",
  gravacoesDecididas: "Fechadas sem publicar",
  gravacoesDecididasAjuda:
    "Conferidas ou descartadas — continuam guardadas aqui, fora do quadro.",
  gravacoesVazio: "Nenhuma gravação chegou ainda.",
  filaVazia: "Nada esperando decisão.",
  promover: "Promover",
  promoverTitulo: "Cria o card público em Backlog, com a gravação anexada",
  marcarConferida: "Conferida",
  marcarConferidaTitulo: "Já serviu de teste, mas não vai para o quadro",
  descartar: "Descartar",
  descartarTitulo: "Não dá para conferir fórmula com ela. Continua guardada aqui.",
  devolverParaFila: "Devolver para a fila",
  apagarGravacao: "Apagar",
  apagarGravacaoTitulo: "Apaga a gravação e o arquivo, para sempre",
  apagarGravacaoConfirma: (titulo: string) =>
    `Apagar "${titulo}" e o arquivo, para sempre?\n\nIsto é para upload que não devia ter entrado. Gravação legítima que não presta é Descartar.`,
  baixarRrf: "Baixar .rrf",
  baixando: "Abrindo…",
  erroBaixar: "Não consegui abrir o arquivo.",
  verCard: "Ver o card",
  notasDeQuemEnviou: "Observação de quem enviou",
  notaDaTriagem: "Nota da triagem",
  gravacaoSemResumo: "Esta ficha não tem o resumo do parser.",
  gravacaoClasse: "Personagem",
  gravacaoGolpes: "Golpes",
  gravacaoTrocas: "Trocas de equipamento",
  gravacaoTalentos: "Talentos",
  gravacaoItensFora: "Itens fora do banco",
  gravacaoDuracao: "Duração",
  gravacaoArquivo: "Arquivo",
  gravacaoVersao: "Versão do simulador",
  talentosDaGravacao: "lidos da gravação",
  talentosDoFormulario: "informados por quem gravou",

  // Rodapé
  maisFerramentas: "Veja mais ferramentas em",
  entreNoDiscord: "Entre no nosso",
  codigoAberto: "Projeto open source no",
} as const;

export const LABEL_STATUS: Record<Coluna, string> = {
  reportado: "Reportado",
  backlog: "Backlog",
  em_progresso: "Em progresso",
  resolvido: "Resolvido",
  nao_sera_feito: "Não será feito",
  arquivado: "Arquivado",
};

export const AJUDA_STATUS: Record<Status, string> = {
  reportado: "Chegou agora, ainda não foi analisado.",
  backlog: "Aceito, vai ser feito quando der.",
  em_progresso: "Estou mexendo nisso agora.",
  resolvido: "Já está no ar.",
  nao_sera_feito: "Analisado e descartado.",
};

export const LABEL_ESTADO: Record<EstadoGravacao, string> = {
  fila: "Na fila",
  promovida: "No quadro",
  conferida: "Conferida",
  descartada: "Descartada",
};

export const LABEL_TIPO: Record<Tipo, string> = {
  bug: "Bug",
  feature: "Sugestão",
  replay: "Gravação",
};
