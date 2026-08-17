# Changelog

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
