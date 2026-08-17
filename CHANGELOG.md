# Changelog

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
