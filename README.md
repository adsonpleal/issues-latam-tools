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
| `/admin` | quadro editável, exige login |
| `/:slug` | atalho: `/visuais` redireciona para `/?projeto=visuais` |

Os filtros vivem na querystring em vez de virarem rota própria porque eles
compõem (projeto × tipo × busca) e porque `/visuais` na raiz brigaria por
espaço de nome com `/admin`, `/novo` e `/t/:id`.

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
apaga, pelo painel do `/admin`.

### Gravações do "Ajude o simulador"

O simulador tem um diálogo que recebe gravações `.rrf` para conferir as fórmulas
contra o jogo. Elas viram fichas daqui, de **`tipo: "replay"`** — é essa etiqueta
que a triagem usa para achá-las no meio do resto.

Elas **nascem arquivadas**, e isso não é detalhe: na origem a coleção era
`allow read: if false` de propósito, para as gravações não ficarem atrás de uma
URL adivinhável, e o consentimento que a pessoa marca fala em o arquivo virar
teste no repositório aberto — não em ficar publicado num quadro. Enquanto a
ficha estiver arquivada, a regra dos anexos nega o `.rrf` também.

**Promover para `backlog` é o que publica.** É a decisão da triagem, e a partir
dela o card e a gravação ficam abertos. O contato de quem enviou continua no
subdocumento privado, sempre.

O ciclo inteiro vive na skill `triage-rrf-uploads`, no repositório do simulador.

### Privacidade

Quem reporta pode deixar **nick** (público, aparece no card — o formulário diz
isso) e **contato** (Discord/e-mail, num subdocumento que só o admin lê).

Os 62 cards migrados das planilhas **não** têm nick público: aquelas pessoas
responderam a um formulário privado e nunca combinaram de aparecer num quadro
aberto. O contato delas foi para o subdocumento privado, então dá para dar
retorno sem publicar nada.

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

## Migração

`data/seed-issues.json` é a fonte da verdade do que veio do mundo antigo.

```bash
npm run importar     # relê as planilhas + o Firestore do recap e regenera o JSON
npm run seed -- --dry-run
npm run seed
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

`/admin` → entrar com Google. **Qualquer conta Google consegue entrar** e ganha
um registro de usuário; nenhuma delas consegue escrever nada. O portão é a regra
`isAdmin()` em `firestore.rules`, não a interface.

Arrastar card funciona no desktop. No celular, use o seletor de coluna que
aparece em cada card — arrastar (HTML5 drag and drop) não funciona em toque
nenhum, nem no Safari do iPhone nem no Chrome do Android.

### Endurecer depois, se precisar

- **UID no lugar do e-mail.** Depois do primeiro login, pegue o UID em
  Authentication → Users e troque a checagem de `isAdmin()`.
- **App Check com reCAPTCHA v3.** Regra de segurança não sabe limitar taxa; hoje
  o envio tem campo-isca, espera de 60 s e limites de tamanho. Se aparecer flood
  de verdade, é aqui que se resolve.
