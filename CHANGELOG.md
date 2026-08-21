# Changelog

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
