---
name: triagem-automatica
description: O manual de uma sessão de triagem automática — do card recém-chegado ao PR com CI verde. Use quando o despachante entregar um card do quadro público (https://issues.latam-tools.com.br) para resolver sozinho, ou quando alguém pedir para "rodar a triagem" de um card específico.
---

# Triagem automática de um card

Você recebeu **um** card do quadro público e vai levá-lo sozinho até um PR com CI
verde — ou até a conclusão de que ele não procede. Ninguém está olhando enquanto
você trabalha; quem lê o resultado é o Adson, pelo celular, nas duas notificações
que você manda no fim.

O card já foi movido para `em_progresso` pelo despachante. Ele é seu.

A ferramenta que fala com o quadro é sempre a mesma, e mora no checkout
principal, não no seu worktree:

```bash
node /c/Users/adson/dev/issues-latam-tools/tools/triagem.mjs <comando>
```

## O que você recebeu

O despachante te passou `id`, `projeto`, `repo`, `pasta`, `tipo`, `autor`,
`titulo` e `descricao`. Se faltar alguma coisa, leia o card:
`https://issues.latam-tools.com.br/t/<id>`.

| projeto | produto | repositório |
|---|---|---|
| `simulador` | Simulador de dano | `adsonpleal/latam-ro-calc` |
| `visuais` | Simulador de visuais | `adsonpleal/latamvisuais` |
| `recap` | RagnaRecap | `adsonpleal/ragreplaystats` |
| `calc` | RagCalc | `adsonpleal/ragcalc` |
| `mercado` | Mercado | `adsonpleal/latam-market` |

## 1. Validar antes de qualquer coisa

**Não comece a programar pela descrição do card.** Quem reporta descreve o
sintoma, e com frequência o sintoma não é o problema. Vá ao código e às fontes.

O relato **procede** quando você consegue apontar, com evidência de primeira mão,
o que está errado ou o que falta: a linha do código, a tabela da fonte, a
consulta que devolve vazio. O relato **não procede** quando:

- o que ele pede já existe e funciona (mostre onde);
- ele descreve o comportamento correto como se fosse defeito;
- ele depende de um dado que o jogo não publica — e aí não há o que fazer sem inventar;
- ele é vago a ponto de qualquer mudança ser chute ("tá errado", sem dizer o quê).

Duvidar é parte do trabalho: um relato que você não conseguiu reproduzir **não é**
um relato que procede. Para o simulador, as fontes na ordem de preferência são o
**bROWiki**, a **descrição do item ou habilidade no cliente** e, por último, o
rAthena — que no LATAM erra com frequência e costuma marcar o próprio número
como não confirmado.

Nunca invente número. Todo valor novo entra com a fonte ao lado, no comentário ou
no teste.

### Se não procede, pare aqui

```bash
node /c/Users/adson/dev/issues-latam-tools/tools/triagem.mjs parar <id> --motivo "<o porquê, em português, para quem reportou ler>"
```

O card vai para `backlog` com o seu texto como comentário público — **não** para
`nao_sera_feito`: fechar um card na cara de quem reportou é decisão do Adson, e o
backlog tira o card da fila sem tomar essa decisão por ele.

Depois mande a notificação e **encerre o turno**:

> `PushNotification`: `<projeto>: "<titulo curto>" não procede — <motivo em meia dúzia de palavras>. Card no backlog.`

## 2. Planejar e implementar

Trabalhe na pasta do projeto, num worktree seu. Cada repositório tem os próprios
comandos: leia o `CLAUDE.md`, o `package.json` e o `.claude/launch.json` dele
antes de supor qualquer coisa — eles não são iguais entre si.

Escreva como o código ao redor já escreve: mesma língua nos comentários, mesma
densidade, mesmos nomes. Um comentário explica **por que**, não o que a linha faz.

## 3. Testar

Rode a suíte do repositório e **acrescente teste** que fixe o que você mudou
contra a fonte que você citou. O teste é o que impede a próxima pessoa de
desfazer isto sem perceber; um PR que só muda número e não fixa nada volta.

Se a suíte já tinha falha antes de você mexer, confirme isso rodando-a num
checkout limpo do `main` antes de afirmar no PR que a falha é pré-existente.

## 4. Conferir à mão, com captura

Suba a instância e **olhe**. Teste verde não prova que a tela mudou.

Tire captura do **antes** e do **depois** do mesmo estado — mesma build, mesmos
parâmetros, mesmo quadro da animação quando houver. A diferença entre as duas tem
que ser só o que você mudou; se mudou mais coisa na imagem, ou você mexeu em algo
que não devia, ou a comparação não é honesta.

## 5. `/simplify`

Rode a skill `simplify` e aplique o que fizer sentido. Ela é de qualidade, não de
bug: não espere que ela ache defeito.

## 6. Abrir o PR

O corpo do PR é o relatório, e tem obrigatoriamente:

1. **A tabela antes/depois**, com as capturas, uma linha por coisa que mudou.
2. **O id do card** e o link `https://issues.latam-tools.com.br/t/<id>`.
3. **O crédito de quem reportou**, pelo nick, exatamente como está no card:
   "reportado por `<autor>`". Sem autor no card, não invente — omita a linha.
4. **A fonte** de cada número novo.
5. O que você decidiu **não** fazer, e por quê.

Termine a descrição com a linha de atribuição:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Registre o PR no card assim que ele existir — é por este campo que o card vira
`resolvido` sozinho quando o PR for mesclado:

```bash
node /c/Users/adson/dev/issues-latam-tools/tools/triagem.mjs pr <id> adsonpleal/<repo>#<numero>
```

## 7. Acompanhar o CI até verde

Fique com o PR até os checks fecharem. Se vier vermelho, leia o log, decida se é
sua a culpa e conserte — **menos** nestes casos, em que a falha não é sua e você
não deve mexer:

- `403 Permission denied to get service [firebasehosting.googleapis.com]`: é o
  firebase-tools 15.34.1, que passou a exigir Service Usage num passo que a conta
  de serviço do CI não tem. Diga na notificação e siga.

Não mescle nada. Nunca. O merge é do Adson.

## 8. Avisar

> `PushNotification`: `<projeto>: PR #<n> pronto para revisão — <o que mudou, em meia dúzia de palavras>. CI <verde|vermelho: motivo>.`

Uma notificação por card, no fim. Não notifique progresso: o celular dele não é
log.

## Quando travar

Travou de um jeito que você não resolve — fonte que não existe, mudança que
exigiria decisão de produto, repositório que não sobe — **não force**. Comente no
card o que você tentou, deixe o card em `em_progresso`, notifique dizendo que
precisa dele, e encerre. Meio PR é pior que nenhum.
