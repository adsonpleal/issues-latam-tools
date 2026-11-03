# Changelog

## 1.11.0

- **The announcer had been dead for thirteen days, and the alarm died with it.**
  On 2026-10-20 the bot lost Send Messages on the reports channel. Every run
  since failed, and the deadman posted its alert to that same channel, where it
  was refused 8755 times in a row and swallowed by a `catch`. A watchdog that
  reports through the thing it watches cannot report that thing breaking. It now
  warns down a second path, an ntfy topic, which does not depend on Discord
  being healthy; either path succeeding is enough to go quiet, so a dead channel
  no longer leaves the alarm permanently un-sent.
- **The saturation guard could not clear itself.** It fired on "the query page
  came back full", which cannot tell a spam burst from a backlog — and since the
  watermark only moves when something is posted, a backlog over one page blocked
  every run forever and grew more certain to block the next. That is what turned
  one lost permission into thirteen silent days. Saturation is now a rate over a
  window, which a backlog spread across days never trips; a backlog is drained
  `--max` per run instead, and the journal says how many are left.
- **Each announcement opens a thread, and the card is followed into it.** When a
  pull request is recorded on a card, or its status moves, that is posted inside
  the card's thread, so a report stops being a message that scrolled away. The
  follow-up ends on its own at `resolvido` or `nao_sera_feito`.
- The follow-up kept the anonymous Firestore identity. `status` and `pr` are
  public fields, so reading them one document at a time fits the same rules that
  deny `privado/contato` — using an admin credential would have paid the whole
  privacy guarantee for something the rules already allowed.
- Checking follow-ups runs every 10 minutes rather than every 2, because each
  check costs one read per followed card and this service wakes 720 times a day.
  Reading too much is what exhausted the free quota once already.
- `infra/configure-ntfy.sh` installs the ntfy topic the same way the bot token is
  installed: a root-only drop-in, prompted from the terminal, never in the
  repository — which is public, and an ntfy topic is the password of whoever
  publishes to it.

## 1.10.1

- **1.10.0 shipped without half of what it replaced: the listener now runs
  `reconciliar` every 15 minutes.** Dropping the scheduled task took that half
  of the dispatcher's job with it, unnoticed. A card becomes `resolvido` when
  its pull request is merged, and a merge on GitHub pushes nothing to us, so
  that half still needs a clock. It cost six cards, which sat in `em_progresso`
  on the public board with their work already shipped and merged. A run costs no
  model turn — it is a CLI command, not a session.
- Anything `reconciliar` writes to stderr is announced **even when it exits 0**,
  because that is how it behaves: a `gh` failure on one card is logged, the card
  is skipped, and the run still succeeds. Judging it by the exit code alone
  would let an expired `gh` login stop every card from closing while reporting
  nothing — the same silence, one layer down.
- The `reconciliados: N de M` summary is never announced. It is printed on every
  run, and a notification every quarter of an hour teaches whoever reads them to
  stop reading.

## 1.10.0

- **The scheduled dispatcher is gone; Firestore now wakes the triage.**
  `tools/listen.mjs` opens an anonymous listener on `status == 'reportado'` and
  prints one line per new card. The scheduled task asked every 15 minutes
  whether a new card had arrived — 54 reads per cycle, 5,184 per day, and a
  whole model turn per question, almost always to hear "no". The initial
  snapshot costs one read per card in `reportado` (fewer than 20) and after that
  it is one read per change.
- Reads **anonymously**, like the Discord announcer: the rules allow listing
  `arquivado == false` with `limit <= 500` and deny `privado/contato` to anyone
  who is not the admin, so the listener cannot read the reporter's contact
  details even by accident. Writing is still `triagem.mjs`, authenticated,
  because moving a card demands the admin.
- A watermark of its own in `listen.json`, separate from `estado.json` so the two
  writes do not collide. Compared by the instant's raw fields and never through
  `Date`: Firestore stamps microseconds, `Date` truncates to milliseconds, and a
  truncated watermark lands before the card it came from — which then becomes
  news again on every restart. It is the defect the announcer already
  documented, and now it has a test.
- A restart is part of the design, not an accident: whoever arms the listener
  restarts it from time to time, because a stalled resident process stays
  "alive" forever with its announcements stopped — the warning the announcer
  left in writing. The on-disk watermark makes the restart neither lose nor
  repeat a card.
- A stdout line is printed only for a new card or when the listener dies
  (`LISTENER DIED`), because every line becomes a notification. Diagnostics go
  to stderr.
- The entry-point guard uses `pathToFileURL` rather than comparing against
  `file://` + `argv[1]`: on Windows the raw form never matches. Without it,
  importing the module — as the test does — opened a real listener against
  Firestore.

## 1.9.1

- **A triagem parou de listar a coleção inteira a cada ciclo.** `fila` e
  `reconciliar` chamavam uma listagem completa cada um, de 15 em 15 minutos:
  ~580 leituras por ciclo, ~55 mil por dia, contra o teto de 50 mil do plano
  gratuito. E a cota de leitura é **a mesma do quadro público** — a automação
  derrubou o site para os visitantes, que passaram a receber 429. Agora as duas
  consultam só `status in (reportado, em_progresso)`, que é tudo que a fila
  enxerga: cerca de 20 documentos, ~2,5 mil leituras por dia.
- Filtro de campo único de propósito: usa o índice automático, e a ordenação
  continua em memória no `maduros`, então nada precisa ser provisionado no
  console.
- `buscaCard` busca o documento pelo id em vez de varrer a coleção atrás dele.
  Era a observação que a revisão do `/simplify` tinha feito e eu descartei como
  "economiza milissegundos num processo que morre em seguida" — o custo não era
  latência, era cota.
- **Erro de `runQuery` vem como linha dentro da lista**, não como objeto solto:
  cota estourada chega como `[{ error: { code: 429, ... } }]`. Lendo só
  `corpo.error`, isso viraria lista vazia e a fila anunciaria "nada a fazer"
  justamente quando precisava gritar. `cardsDaConsulta` olha linha a linha, com
  teste em cima do corpo copiado de uma resposta de verdade.

## 1.9.0

- **O aviso da triagem passa a chegar pelo ntfy.sh** em vez da notificação do
  app. O nome do tópico não entra no repositório, que é público: tópico de ntfy
  é senha de quem publica, e quem soubesse o nome mandaria notificação para o
  celular dele com `click` para qualquer URL. Ele fica em `ntfyTopico`, no
  `estado.json` fora do repositório onde a marca d'água já mora.
- **O link do aviso é decidido pelo card, não pelo texto**: com PR registrado
  abre o PR; sem PR abre o card. Aviso sem PR é card que não virou PR — relato
  que não procede, ou sessão travada —, e é no card que está o comentário
  dizendo o porquê. Quem escreve a frase é a sessão, mas o link não é dela: sai
  do campo `pr`, então ela não consegue apontar para um PR que não abriu.
- Publica em JSON na raiz do ntfy, não pelos cabeçalhos `Title`/`Click`:
  cabeçalho HTTP não carrega UTF-8, e título de card daqui vem acentuado
  ("Localização", "Colisão Astral").
- `alarme` é o aviso do próprio despachante, que não tem card para apontar — aí
  o toque abre o quadro. É comando separado em vez de `avisar` sem id porque
  `avisar "$ID"` com a variável vazia tem que falhar, não virar uma notificação
  genérica que parece ter dado certo.
- O POST do aviso tem prazo de 10 s, ao contrário das escritas no Firestore: ele
  é o último passo da sessão, e pendurado deixaria o card resolvido sem ninguém
  avisado.
- **A sessão que abriu o PR continua ouvindo.** Ela liga o monitor do app
  (`auto_fix`/`address_comments`) em vez de consultar o CI em laço, e acorda
  quando o check falha ou quando chega comentário.
- **Comentário no PR só é atendido se vier de `adsonpleal`.** O que decide é o
  `author.login` que o `gh` devolve: comentário de outro autor — gente, ou o
  `github-actions` que comenta o link do preview em todo PR — é informação, não
  ordem. Pedido fora do código daquele PR (mesclar, mexer em outro repositório,
  mover card) não é atendido nem vindo dele.
- **Sessão que gerou PR se fila na seção `Auto issues`** da barra lateral, no
  passo em que o PR nasce. Sessão que concluiu que o relato não procede fica
  fora: não há PR para revisar ali.

## 1.8.0

- **Card novo abre sozinho uma sessão que vai até o PR.** Ela valida o relato
  contra o código e as fontes antes de programar, e se ele não procede para ali,
  com o porquê comentado no card.
- **O quadro é a fila.** Não entrou banco nem arquivo de pendências: `status` *é*
  a fila, e pegar um card é movê-lo para `em_progresso` com precondição de
  `updateTime` — dois despachantes não conseguem pegar o mesmo card. Tirar um
  card da fila é arrastá-lo, como sempre foi.
- **Marca d'água, pelo mesmo motivo do anunciador.** `bootstrap` grava "a partir
  de agora"; sem ela, ligar isto com a fila cheia despejaria uma sessão por card
  acumulado. Um turno automático nunca grava a marca.
- **Card só fecha com merge como prova.** A sessão registra o PR no card e o
  `reconciliar` pergunta ao `gh` se ele foi mesclado — nenhuma sessão move card
  para `resolvido` por conta própria, e nenhuma mescla nada.
- Relato que não procede vai para o **backlog**, não para *Não será feito*:
  fechar um card na cara de quem reportou continua sendo decisão de gente.
- Teto de sessões simultâneas, porque o limite é a máquina e não a cota. Card
  movido à mão para `em_progresso` não ocupa vaga.
- `tools/triagem.test.mjs` cobra a tabela de repositórios contra
  `src/lib/projetos.ts`: projeto novo sem repositório mapeado é teste vermelho,
  não uma sessão abrindo PR no lugar errado.
- **`*.mjs` agora nasce com LF.** Um checkout novo nesta máquina — um worktree,
  por exemplo — trazia as ferramentas com CRLF, e aí `npm test` morria em
  `SyntaxError: Invalid or unexpected token` ao importar `tools/*.mjs`. O
  checkout antigo passava porque os arquivos tinham sido reescritos em LF depois,
  o que fazia o defeito aparecer só para quem clona ou cria worktree.

## 1.7.0

- **A triagem arruma a ordem dos cards dentro da coluna.** Arrastar um card em
  cima de outro o encaixa acima ou abaixo dele, conforme a metade da altura em
  que se solta; soltar no vazio da coluna continua sendo só mudar de coluna. A
  ordem é do quadro: o que a triagem arruma é o que o público vê.
- A posição mora num inteiro `ordem` no card, e o gesto **numera a pilha inteira
  num lote só**. Prender só o card arrastado não pararia em pé — ele não tem como
  ficar entre vizinhos sem número, e voltaria sozinho para outro lugar no
  primeiro voto que chegasse.
- O preço é a coluna arrumada parar de responder aos votos, então cada uma ganha
  um **Ordem automática** no topo, que só aparece quando há o que soltar.
- Cada card ganhou **setas ↑↓** ao lado do seletor de coluna: arrastar não
  funciona em toque nenhum, e elas são o mesmo gesto para celular, teclado e
  leitor de tela.
- A conta roda sempre sobre a pilha **completa** da coluna, nunca sobre o que
  está na tela — arrastar com um filtro ligado não embaralha o que o filtro está
  escondendo.
- Reordenar **não carimba `atualizadoEm`**: *Resolvido* e a gaveta ordenam por
  essa data, e arrumar a pilha não é mexer no card. A regra do Firestore tem uma
  entrada só para isso, que aceita mexer em `ordem` e em mais nada.

## 1.6.0

- **Acabou o `/admin`.** As URLs são as mesmas para todo mundo; o que muda é ter
  ou não sessão. Com sessão, `/` ganha a gaveta de arquivados, o arrastar, o
  seletor de coluna e o painel `?card=`; sem ela, é o quadro público de sempre.
- **`/t/:id` virou editável.** A ficha que o público lê é a mesma que a triagem
  edita: contato de quem reportou, editar, seletor de coluna, comentar com
  imagem e apagar anexo, tudo embaixo da ficha. Antes só o painel do quadro
  fazia isso, e o link direto era um beco sem saída.
- Como o seletor de coluna chegou ali, a página do card é agora o único jeito de
  **desarquivar** por link direto — e o admin passa a enxergar card arquivado em
  `/t/:id`, que para o público continua sendo "não encontrado".
- `/admin/gravacoes` → `/gravacoes`, e sem sessão ela é "não encontrado" em vez
  de um portão de login: nem a existência da fila é resposta que se deva a
  alguém.
- Entrar mudou para `/entrar`, que não é linkada de lugar nenhum. Sair mora na
  barra do topo, junto do nome e do link das gravações.
- **Uma marca em `localStorage` decide se vale baixar o SDK de auth.** Com as
  ações nas mesmas URLs do público, alguém precisava dizer se a pergunta "há
  sessão?" vale ~40 kB gz — e a resposta é quase sempre não. Sem a marca, nada
  toca o import. Ela não é segurança (forjá-la só faz baixar o SDK e descobrir
  que não há sessão) e perdê-la não tranca ninguém para fora: `/entrar` liga o
  observador sem consultá-la.
- Correção: as assinaturas de `/t/:id` agora esperam a sessão resolver. Um
  `onSnapshot` que toma `permission-denied` **morre** — não tenta de novo quando
  o token chega. Assinar antes da hora deixaria o admin olhando um "não
  encontrado" que nada mais consertaria.

## 1.5.0

- Rota `/admin/gravacoes`: a caixa de entrada das gravações do "Ajude o
  simulador", em lista, com o resumo do parser à vista, a observação de quem
  enviou, o contato e o `.rrf` para baixar.
- **Gravação deixou de ser card.** Ela mora agora na coleção `gravacoes`, que só
  o admin lê, com o arquivo num subdocumento. Antes nascia como card
  `arquivado: true`, o que dava dois sentidos para o mesmo booleano — "a triagem
  despachou" e "ninguém olhou ainda" — e empilhava a fila na gaveta de
  arquivados, junto de bug arquivado por outro motivo.
- **Promover cria o card**, em vez de desarquivar um: ficha pública em backlog
  com o `.rrf` anexado, o contato no subdocumento privado e o mesmo id, numa
  escrita atômica. O card herda a data do envio — o crédito é do dia em que a
  pessoa gravou, não do dia em que a triagem olhou.
- Estados da fila: `fila`, `conferida`, `descartada` e `promovida`. Descartar não
  apaga nada; apagar existe à parte, e é só para upload que não devia ter
  entrado.
- `npm run mover-gravacoes` recolhe para a coleção nova o que ficou como card
  arquivado. Idempotente, e não toca no que já era público.
- O simulador (`latam-ro-calc`) passa a escrever em `gravacoes`, e a skill
  `triage-rrf-uploads` ganhou `--promover`. O caminho antigo continua aceito nas
  regras enquanto houver simulador em cache por aí.

## 1.4.0

- Comentário do `/admin` aceita imagem: dá para colar o print junto da
  atualização, e ele aparece dentro do comentário na página do card.
- As imagens moram na mesma subcoleção `anexos`, com um `comentarioId` — sem
  onSnapshot novo por comentário e reaproveitando a redução para WebP, a regra
  de leitura (card arquivado nega) e o apagar do admin. O selo de anexos do card
  não conta essas: ele fala do que veio no relato.
- Amarrar anexo a comentário exige admin na regra. Sem isso qualquer pessoa
  faria uma imagem sua brotar dentro da fala do admin.
- O campo de comentar volta a ocupar a largura do painel — o `align-items:
  flex-start` encolhia o campo e o `width: 100%` do textarea virava 100% de nada.

## 1.3.0

- Card novo e público vira embed no canal de reports do Discord: projeto, tipo,
  título, trecho da descrição, nick (quando tem) e link do card.
- Quem anuncia é `tools/anunciar-discord.mjs`, one-shot do systemd na EC2 a cada
  2 min. Consulta o Firestore **sem autenticação**: as regras negam
  `privado/contato` a um anônimo, então o serviço é incapaz de vazar o contato de
  quem reportou, e não só "programado para não vazar".
- Gravação do "Ajude o simulador" continua fora — nasce arquivada, e a consulta
  só enxerga card público.
- O texto do usuário vai saneado: sem `@everyone`, sem URL na descrição, markdown
  escapado, invisíveis removidos. Enxurrada de 25 cards num intervalo trava o
  anúncio em vez de repassar.

## 1.2.1

- O painel lateral do `/admin` agora mora na URL (`/admin?card=<id>`): dá para
  linkar um card específico da triagem e o botão voltar do navegador fecha o
  painel. Os filtros continuam compondo com ele.

## 1.2.0

- Fichas de `tipo: "replay"`: as gravações `.rrf` do "Ajude o simulador a acertar
  as contas" agora entram aqui, com o arquivo em anexo e o resumo do parser no
  campo `replay`.
- Elas chegam arquivadas — fora do quadro público e com o anexo ilegível — e só
  aparecem quando a triagem promove para backlog. É a mesma privacidade que a
  coleção de origem tinha.
- Migradas as 24 gravações que estavam no Firestore do simulador, todas
  arquivadas: 9 aguardando conferência, 9 já conferidas, 6 recusadas.

## 1.1.0

- Anexos no formulário: até 5 arquivos por card, `.rrf` ou imagem, guardados em
  campo `bytes` do Firestore (teto de 900 kB por arquivo). Imagem grande é
  convertida para WebP e reduzida no navegador antes de subir.
- Admin apaga anexo pelo painel — é a moderação de quem subir o que não devia.
- Rádio de tipo do formulário volta a ficar em uma linha só.

## 1.0.0

Primeira versão.

- Quadro público com as colunas Reportado, Backlog, Em progresso, Resolvido e
  Não será feito, filtrável por projeto, tipo e busca.
- Envio público de bugs e sugestões, com nick opcional (público) e contato
  opcional (só o admin lê).
- Voto por card, um por navegador.
- `/admin` com login Google restrito a uma conta: mover card (arrastando ou pelo
  seletor), editar, comentar e arquivar.
- Migração das origens antigas: 54 linhas da planilha do simulador, 5 da
  planilha do visuais e 3 sugestões do Firestore do recap — 62 cards, sendo 4
  arquivados por serem repetidos ou não serem item de quadro.
