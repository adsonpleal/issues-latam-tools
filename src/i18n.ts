// UI strings -- pt-BR only (the LATAM server's language).
//
// The keys are English and the values are not: every value here is read by a
// player on the site, so translating one would change the product. The keys of
// the four label maps at the bottom are stored values (a card's status, a
// recording's state, an issue's type) and keep the database's spelling.
import type { RecordingState } from "./lib/recordings";
import type { Column, Status, IssueType } from "./lib/status";

export const t = {
  siteName: "Issues",
  siteSubtitle: "Ferramentas RO LATAM",
  siteDescription:
    "Bugs e sugestões das ferramentas do RO LATAM, num quadro só. Reporte um problema e acompanhe o progresso.",

  // Navigation and filters
  allProjects: "Todos os projetos",
  filterByProject: "Filtrar por projeto",
  filterByType: "Filtrar por tipo",
  allTypes: "Bugs e sugestões",
  search: "Buscar",
  searchPlaceholder: "Buscar por texto…",
  report: "Reportar",
  reportTitle: "Reportar um bug ou sugerir uma melhoria",
  backToBoard: "Voltar ao quadro",

  // The board
  loading: "Carregando…",
  emptyColumn: "Nada por aqui.",
  emptyBoard: "Nenhum item ainda — seja a primeira pessoa a reportar.",
  loadError: "Não consegui carregar o quadro. Recarregue a página.",
  oneItem: "1 item",
  nItems: (n: number) => `${n} itens`,

  // A card on the board
  vote: "Votar",
  voteTitle: "Votar neste item",
  alreadyVoted: "Você já votou neste item",
  commentCount: (n: number) => (n === 1 ? "1 comentário" : `${n} comentários`),
  reportedBy: (nick: string) => `por ${nick}`,

  // The report form
  formTitle: "Reportar",
  formSubtitle: "Conta o que aconteceu. Quanto mais específico, mais rápido dá pra resolver.",
  fieldProject: "Qual ferramenta?",
  fieldType: "É um bug ou uma sugestão?",
  fieldSummary: "Resumo",
  fieldSummaryPlaceholder: "Ex.: Falta a carta Mosca Caçadora na lista",
  fieldDetails: "Detalhes",
  fieldDetailsPlaceholder:
    "O que você fez, o que aconteceu e o que você esperava que acontecesse. Se tiver um link do build ou do replay, cole aqui.",
  fieldNick: "Seu nick (opcional)",
  fieldNickHelp:
    "Aparece publicamente no card e nas novidades, como crédito. Deixe em branco se preferir não aparecer.",
  fieldAttachments: "Anexos (opcional)",
  fieldAttachmentsHelp:
    "Replay .rrf ou print da tela — até 5 arquivos. Imagem grande é reduzida automaticamente antes de enviar.",
  fieldImages: "Imagens (opcional)",
  fieldImagesHelp:
    "Print para ilustrar a atualização — até 5. Imagem grande é reduzida automaticamente antes de enviar.",
  attachmentPreparing: "Preparando os arquivos…",
  attachmentBadType: (name: string) => `${name}: só aceito .rrf e imagem.`,
  attachmentImageOnly: (name: string) => `${name}: aqui só entra imagem.`,
  attachmentTooBig: (name: string, max: string) => `${name}: passa de ${max}.`,
  attachmentUnreadable: (name: string) => `${name}: não consegui ler o arquivo.`,
  attachmentTooMany: "Máximo de 5 arquivos.",
  remove: "Remover",
  attachmentsTitle: "Anexos",
  download: "Baixar",
  openImage: "Abrir em tamanho cheio",

  fieldContact: "Contato (opcional)",
  fieldContactHelp:
    "Discord ou e-mail, caso eu precise de mais detalhes. Não aparece no site — só eu vejo.",
  submit: "Enviar",
  submitting: "Enviando…",
  submitted: "Obrigado! Seu item entrou na coluna Reportado.",
  submitError: "Não consegui enviar. Tente de novo em alguns segundos.",
  summaryTooShort: "Escreva um resumo com pelo menos 3 caracteres.",
  slowDown: "Calma lá — espere um pouquinho antes de enviar outro.",

  // A single card's page
  notFound: "Item não encontrado",
  notFoundHelp: "Ele pode ter sido arquivado, ou o link está errado.",
  noComments: "Sem comentários ainda.",
  comment: "Comentar",
  commentPlaceholder: "Escreva uma atualização…",

  // The admin session
  signIn: "Entrar com Google",
  signOut: "Sair",
  adminSignInHelp: "Entre com a conta de administrador para mexer no quadro.",
  noPermission: "Esta conta não tem permissão para administrar o quadro.",
  noPermissionHelp: "Entrar com uma conta Google não dá nenhum acesso de escrita.",
  signInError: (codigo: string) =>
    `Não consegui entrar: ${codigo}. Se for popup bloqueado, libere popups para este endereço no navegador e tente de novo.`,
  moveTo: "Mover para",
  moveUp: "Subir na coluna",
  moveDown: "Descer na coluna",
  autoOrder: "Ordem automática",
  autoOrderTitle:
    "Solta a ordem arrumada à mão e devolve a coluna à ordem padrão (votos, ou data nas colunas de encerramento)",
  archive: "Arquivar",
  save: "Salvar",
  cancel: "Cancelar",
  edit: "Editar",
  contactLabel: "Contato de quem reportou",
  noContact: "Sem contato informado.",

  // Recordings from "Ajude o simulador a acertar as contas"
  recordingsTitle: "Gravações do simulador",
  recordingsSubtitle:
    'Os .rrf que chegam do "Ajude o simulador a acertar as contas". Não são cards: ficam aqui, privadas, até a triagem promover uma — é isso que cria a ficha pública, com a gravação anexada.',
  recordingsLink: "Gravações",
  recordingsError: "Não consegui carregar a fila. Recarregue a página.",
  recordingsQueue: "Na fila",
  recordingsQueueHelp: "Esperando decisão. Nada daqui está publicado.",
  recordingsPromoted: "Viraram card",
  recordingsPromotedHelp: "A ficha e a gravação estão no quadro público.",
  recordingsClosed: "Fechadas sem publicar",
  recordingsClosedHelp:
    "Conferidas ou descartadas — continuam guardadas aqui, fora do quadro.",
  recordingsEmpty: "Nenhuma gravação chegou ainda.",
  queueEmpty: "Nada esperando decisão.",
  promote: "Promover",
  promoteTitle: "Cria o card público em Backlog, com a gravação anexada",
  markReviewed: "Conferida",
  markReviewedTitle: "Já serviu de teste, mas não vai para o quadro",
  discard: "Descartar",
  discardTitle: "Não dá para conferir fórmula com ela. Continua guardada aqui.",
  returnToQueue: "Devolver para a fila",
  deleteRecording: "Apagar",
  deleteRecordingTitle: "Apaga a gravação e o arquivo, para sempre",
  deleteRecordingConfirm: (title: string) =>
    `Apagar "${title}" e o arquivo, para sempre?\n\nIsto é para upload que não devia ter entrado. Gravação legítima que não presta é Descartar.`,
  downloadRrf: "Baixar .rrf",
  opening: "Abrindo…",
  downloadError: "Não consegui abrir o arquivo.",
  viewCard: "Ver o card",
  submitterNotes: "Observação de quem enviou",
  triageNote: "Nota da triagem",
  recordingNoSummary: "Esta ficha não tem o resumo do parser.",
  recordingCharacter: "Personagem",
  recordingHits: "Golpes",
  recordingEquipChanges: "Trocas de equipamento",
  recordingTraits: "Talentos",
  recordingUnknownItems: "Itens fora do banco",
  recordingDuration: "Duração",
  recordingFile: "Arquivo",
  recordingAppVersion: "Versão do simulador",
  traitsFromRecording: "lidos da gravação",
  traitsFromForm: "informados por quem gravou",

  // The footer
  moreTools: "Veja mais ferramentas em",
  joinDiscord: "Entre no nosso",
  openSource: "Projeto open source no",
} as const;

export const STATUS_LABEL: Record<Column, string> = {
  reportado: "Reportado",
  backlog: "Backlog",
  em_progresso: "Em progresso",
  resolvido: "Resolvido",
  nao_sera_feito: "Não será feito",
  // The archived drawer, keyed by the field name it reads from.
  arquivado: "Arquivado",
};

export const STATUS_HELP: Record<Status, string> = {
  reportado: "Chegou agora, ainda não foi analisado.",
  backlog: "Aceito, vai ser feito quando der.",
  em_progresso: "Estou mexendo nisso agora.",
  resolvido: "Já está no ar.",
  nao_sera_feito: "Analisado e descartado.",
};

export const RECORDING_STATE_LABEL: Record<RecordingState, string> = {
  // Keyed by the stored `estado` values on a recording.
  fila: "Na fila",
  promovida: "No quadro",
  conferida: "Conferida",
  descartada: "Descartada",
};

export const TYPE_LABEL: Record<IssueType, string> = {
  bug: "Bug",
  feature: "Sugestão",
  replay: "Gravação",
};
