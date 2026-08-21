# Issues — Ferramentas RO LATAM

Quadro público de bugs e sugestões das cinco ferramentas do
[latam-tools.com.br](https://latam-tools.com.br), em
[issues.latam-tools.com.br](https://issues.latam-tools.com.br).

Antes disso cada projeto tinha o seu jeito: dois Google Forms despejando numa
planilha, um quadro de sugestões próprio dentro do RagnaRecap e dois projetos
sem nada além do Discord. Ninguém conseguia ver o andamento de nada.

- **Leitura pública.** Qualquer pessoa vê o quadro, filtra por projeto e vota.
- **Envio público.** Qualquer pessoa reporta em `/novo`; o card cai em *Reportado*.
- **Escrita restrita.** Mover, editar, comentar e arquivar exigem login Google
  com um e-mail só.

## Como funciona

React + Vite + TypeScript, Firebase Hosting e Firestore. Sem framework de CSS e
sem biblioteca de componentes — são cinco colunas, uma barra de filtros e um
formulário.

### Rotas

| Rota | O quê |
|---|---|
| `/` | o quadro; aceita `?projeto=`, `?tipo=` e `?busca=` |
| `/novo` | formulário de envio; aceita `?projeto=` para pré-selecionar |
| `/t/:id` | um card, com os comentários |
| `/entrar` | a porta do admin; não é linkada de lugar nenhum |
| `/gravacoes` | a caixa de entrada das gravações do simulador, e o botão que promove uma para card; sem sessão, é "não encontrado" |
| `/:slug` | atalho: `/visuais` redireciona para `/?projeto=visuais` |

**Não existe espaço de URL de admin.** As rotas são as mesmas para todo mundo, e
é ter ou não sessão que decide o que aparece: com sessão, `/` ganha a gaveta de
arquivados, o arrastar, o seletor de coluna e o painel `?card=`, e `/t/:id` ganha
editar, mover, contato, comentar e apagar anexo. Sem sessão, as mesmas URLs são o
quadro público de sempre.

Os filtros vivem na querystring em vez de virarem rota própria porque eles
compõem (projeto × tipo × busca) e porque `/visuais` na raiz brigaria por
espaço de nome com `/novo`, `/t/:id` e `/gravacoes`.

### Colunas

`reportado` · `backlog` · `em_progresso` · `resolvido` · `nao_sera_feito`, mais
uma gaveta `arquivado` que só o admin vê.

`arquivado` é um **booleano separado**, não um sexto status. Isso é o que torna
possível esconder card arquivado do público: regra de segurança não filtra
coleção — para um `list`, o Firestore analisa a *consulta* e só a autoriza se as
restrições dela provarem que todo documento alcançável passa na regra. Então o
cliente é obrigado a mandar `where("arquivado","==",false)`, e sem isso a
consulta inteira é recusada antes de ler qualquer documento. De quebra,
desarquivar devolve o card para o status real em vez de jogá-lo em *Reportado*.

**Todo documento precisa ter o campo.** Um único card sem `arquivado` faz a
regra dar erro e derruba a consulta do quadro para todo mundo — por isso o seed
valida isso e falha alto.

### Votos

Um por navegador, guardado em `localStorage`. Limpar o storage vota de novo, e
tudo bem: é termômetro de prioridade, não eleição. A regra do Firestore só
garante que cada escrita pública mexe em um campo e soma exatamente 1.

### Anexos

Quem reporta pode mandar até 5 arquivos: replay `.rrf` ou print de tela.

Cada anexo é um documento em `issues/{id}/anexos/{anexoId}`, com o conteúdo num
campo `bytes` nativo do Firestore — **não** no Cloud Storage, que exigiria plano
Blaze. É a mesma solução que o simulador já usa para receber `.rrf`.

Daí sai o teto de **900 kB por arquivo**: o limite do Firestore é 1 MiB por
documento, e o resto é folga. Um `.rrf` de verdade fica em 50–100 kB e passa
folgado. Imagem é convertida para WebP no navegador antes de subir
(`src/lib/imagem.ts`), apertando primeiro a qualidade e depois a dimensão até
caber — um PNG de 12 MB sai em ~800 kB no pior caso.

Apagar anexo é a única exceção ao `delete: if false` que vale para todo o resto:
qualquer pessoa anexa arquivo, então precisa existir moderação. Só o admin
apaga, pelo painel do quadro ou pela própria página do card.

Imagem colada num comentário vive na **mesma subcoleção**, com um campo
`comentarioId` a mais — é o que decide se ela é renderizada na lista de anexos
do card ou dentro daquele comentário. Ficar junto evita um `onSnapshot` por
comentário na página e herda de graça a regra de leitura (card arquivado nega os
dois), a redução para WebP e o apagar do admin. O selo de anexos do card não
conta essas: ele fala do que veio no relato.

Escrever `comentarioId` exige admin, ao contrário do anexo comum, que é escrita
pública. Sem essa trava qualquer pessoa faria uma imagem sua aparecer *dentro*
da fala do admin — o anexo do card, no fim da página, não empresta essa
autoridade a ninguém.

### Gravações do "Ajude o simulador"

O simulador tem um diálogo que recebe gravações `.rrf` para conferir as fórmulas
contra o jogo. Elas **não são cards**: caem na coleção `gravacoes`, que é caixa
de entrada e não quadro — `allow read: if isAdmin()`, o arquivo num subdocumento
`gravacoes/{id}/arquivo/rrf`, e nick e contato no próprio documento, já que a
coleção inteira é privada.

Isso não é detalhe. Na origem a coleção do simulador era `allow read: if false`
de propósito, para as gravações não ficarem atrás de uma URL adivinhável, e o
consentimento que a pessoa marca fala em o arquivo virar teste no repositório
aberto — não em ficar publicado num quadro.

**Promover é o que publica, e publicar é criar o card**: `/gravacoes` →
*Promover* escreve uma ficha pública em `backlog` com o `.rrf` anexado, o contato
no subdocumento privado e o mesmo id da gravação, numa escrita atômica só. O card
herda a data do envio, não a de hoje — o crédito é do dia em que a pessoa gravou.

Antes isso era um card nascendo `arquivado`. Dava dois sentidos para o mesmo
booleano — "a triagem despachou" e "ninguém olhou ainda" — e empilhava a caixa de
entrada na gaveta de arquivados, junto de bug arquivado por outro motivo.

Fora `promovida`, os estados são `fila`, `conferida` (já serviu de teste, mas não
vira card) e `descartada`. **Descartar não apaga**: é o arquivar daqui. Apagar
existe, e é só para upload que não devia ter entrado — mesma razão pela qual
anexo tem delete.

`npm run mover-gravacoes` recolhe para a coleção nova qualquer gravação que ainda
apareça como card arquivado — o que acontece enquanto houver simulador antigo em
cache por aí. É idempotente e não toca no que já foi promovido.

O ciclo inteiro vive na skill `triage-rrf-uploads`, no repositório do simulador,
que faz pela linha de comando o que esta rota faz pelo navegador.

### Privacidade

Quem reporta pode deixar **nick** (público, aparece no card — o formulário diz
isso) e **contato** (Discord/e-mail, num subdocumento que só o admin lê).

Os 62 cards migrados das planilhas **não** têm nick público: aquelas pessoas
responderam a um formulário privado e nunca combinaram de aparecer num quadro
aberto. O contato delas foi para o subdocumento privado, então dá para dar
retorno sem publicar nada.

### Aviso no Discord

Card novo e público vira um embed no canal de reports do Discord, com projeto,
tipo, título, um trecho da descrição, o nick (quando tem) e o link do card.

Quem faz isso é `tools/anunciar-discord.mjs`, rodando na EC2 compartilhada como
one-shot do systemd a cada 2 min (`infra/issues-discord.{service,timer}`). O
plano gratuito do Firebase não tem Cloud Functions, então o gatilho tem que vir
de fora; e como o serviço não escuta em porta nenhuma, não há endpoint público
para ninguém abusar.

**Ele consulta o Firestore sem autenticação, de propósito.** Com a identidade de
um visitante anônimo, as regras o deixam listar só card com `arquivado == false`
e negam `issues/{id}/privado/contato` — ou seja, o anunciador *não consegue* ler
o contato de quem reportou. A privacidade é garantida pelo banco, não pelo
cuidado do script, que é por que aqui não entra `firebase-admin` nem service
account.

Duas consequências de graça: gravação do "Ajude o simulador" não é card até
alguém promover, então nunca é anunciada na chegada; e o marco d'água em disco
significa que a primeira execução não despeja o histórico no canal. (O card que
sai de uma promoção também não é anunciado — ele nasce com a data do envio, que
é anterior ao marco.)

O texto que sai dali é escrita pública anônima, então vai saneado: sem menção em
massa (`allowed_mentions: {parse: []}`), sem URL na descrição, com markdown
escapado e sem caractere invisível. Se 25 cards chegarem num intervalo de 2 min,
ele para em vez de repassar a enxurrada.

```bash
node tools/anunciar-discord.mjs --dry-run --desde 2020-01-01T00:00:00Z --max 100
```

Renderiza os cards existentes como embeds sem postar nada — é o teste de olho
antes de qualquer mudança no formato.

## Desenvolvimento

```bash
npm install
npm run dev
npm test
npm run build
```

Não há projeto de dev separado: `npm run dev` fala com o Firestore de produção.
Escrita pública é só criar card e votar, então o estrago possível é pequeno —
mas evite testar envio com o formulário apontado para valer.

## Deploy

Hosting sai no push para `main` (`.github/workflows/firebase-hosting-merge.yml`).

**Regras e índices do Firestore são deploy manual**, de propósito:

```bash
firebase deploy --only firestore
```

Assim a credencial do CI não precisa de escrita no banco, e uma regressão de
regra não entra de carona num push de rotina.

O anunciador do Discord **não sai neste caminho** — ele mora na EC2 e é deploy
manual (tar + scp + `infra/apply-unit.sh`). Os comandos estão na skill de deploy,
que não vai para o repositório porque tem endereço e chave do servidor.

## Migração

`data/seed-issues.json` é a fonte da verdade do que veio do mundo antigo.

```bash
npm run importar     # relê as planilhas + o Firestore do recap e regenera o JSON
npm run seed -- --dry-run
npm run seed
npm run mover-gravacoes -- --dry-run   # gravação que virou card arquivado -> coleção `gravacoes`
```

O seed é idempotente: usa id determinístico e cria com `currentDocument.exists=false`,
então rodar de novo pula o que existe em vez de sobrescrever. Sem isso, uma
segunda execução devolveria para *Reportado* um card já movido para *Em progresso*.

As planilhas não tinham campo de título — a tabela `REVISAO` em
`tools/importar-planilhas.mjs` é a leitura humana de cada linha, feita uma vez
na migração e chaveada pela origem (para reescrever um título não mudar o id do
card).

Credencial: se `GOOGLE_APPLICATION_CREDENTIALS` estiver definida, usa a chave de
service account; senão usa o token que o `firebase login` já deixou na máquina.

## Administração

`/entrar` → entrar com Google. **Qualquer conta Google consegue entrar** e ganha
um registro de usuário; nenhuma delas consegue escrever nada. O portão é a regra
`isAdmin()` em `firestore.rules`, não a interface — o que a interface faz é
mostrar ou esconder controles.

Depois disso não há para onde ir: os poderes aparecem nas próprias URLs
públicas. `/entrar` só é útil de novo para sair, ou quando a marca abaixo some.

### Por que existe uma marca em localStorage

O SDK de auth são ~40 kB gz. Enquanto o admin tinha rota própria, bastava
carregá-la em `lazy()` para o público nunca baixá-lo. Com as ações morando nas
mesmas URLs de todo mundo, algo precisa dizer se vale a pena perguntar se há
sessão — e é `issues.latamtools.admin` (ver `src/lib/auth.ts`).

Sem a marca, `SessaoProvider` resolve "sem sessão" já na primeira render e nunca
toca no import. Ela **não é segurança**: forjá-la só faz baixar o SDK e descobrir
que não há sessão. E perdê-la não tranca ninguém para fora — `/entrar` liga o
observador sem consultá-la, então a sessão que ainda estiver no IndexedDB é
reconhecida sem popup nenhum.

Arrastar card funciona no desktop. No celular, use o seletor de coluna que
aparece em cada card — arrastar (HTML5 drag and drop) não funciona em toque
nenhum, nem no Safari do iPhone nem no Chrome do Android.

### Endurecer depois, se precisar

- **UID no lugar do e-mail.** Depois do primeiro login, pegue o UID em
  Authentication → Users e troque a checagem de `isAdmin()`.
- **App Check com reCAPTCHA v3.** Regra de segurança não sabe limitar taxa; hoje
  o envio tem campo-isca, espera de 60 s e limites de tamanho. Se aparecer flood
  de verdade, é aqui que se resolve.
