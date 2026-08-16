// Strings de UI — só pt-BR (a língua do servidor LATAM).
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
  admin: "Admin",
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

  // Admin
  entrar: "Entrar com Google",
  sair: "Sair",
  adminTitulo: "Administração",
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

export const LABEL_TIPO: Record<Tipo, string> = {
  bug: "Bug",
  feature: "Sugestão",
};
