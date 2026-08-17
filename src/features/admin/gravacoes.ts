import { t } from "../../i18n";
import type { Gravacao } from "../../lib/gravacoes";
import type { ResumoReplay } from "../../lib/issues";

/**
 * A fila da triagem, em três pilhas.
 *
 * `fila` é o que espera decisão; `decididas` junta conferida e descartada, que
 * são as duas formas de fechar sem publicar; `promovidas` já viraram card.
 */
export type FilaGravacoes = {
  fila: Gravacao[];
  promovidas: Gravacao[];
  decididas: Gravacao[];
};

function tempo(d: Date | null): number {
  return d ? d.getTime() : 0;
}

export function separarGravacoes(gravacoes: Gravacao[]): FilaGravacoes {
  // A fila ordena pela chegada; as decididas, pelo carimbo — ali o que interessa
  // é o que acabou de sair, não o que foi gravado primeiro.
  const porChegada = (a: Gravacao, b: Gravacao) => tempo(b.criadoEm) - tempo(a.criadoEm);
  const porDecisao = (a: Gravacao, b: Gravacao) => tempo(b.decididaEm) - tempo(a.decididaEm);

  return {
    fila: gravacoes.filter((g) => g.estado === "fila").sort(porChegada),
    promovidas: gravacoes.filter((g) => g.estado === "promovida").sort(porDecisao),
    decididas: gravacoes
      .filter((g) => g.estado === "conferida" || g.estado === "descartada")
      .sort(porDecisao),
  };
}

/** "2m 13s". O .rrf mede em milissegundos, e ninguém lê 133400 como dois minutos. */
export function formataDuracao(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return min ? `${min}m ${seg}s` : `${seg}s`;
}

export type LinhaResumo = { chave: string; rotulo: string; valor: string; ajuda?: string };

/**
 * O que a triagem lê de uma gravação, numa lista só — a mesma na fila e no
 * painel do card promovido. Ficar num lugar é o que impede as duas telas de
 * discordarem sobre o que importa: trocas de equipamento separam "fórmula
 * errada" de "item faltando no banco", e golpes em dummy é o que gera crítico
 * suficiente para fechar a conta.
 */
export function linhasDoResumo(replay: ResumoReplay): LinhaResumo[] {
  const linhas: LinhaResumo[] = [
    {
      chave: "personagem",
      rotulo: t.gravacaoClasse,
      valor: `${replay.className ?? "?"} — ${replay.player ?? "?"} (nv ${replay.baseLevel ?? "?"}/${
        replay.jobLevel ?? "?"
      })`,
    },
    {
      chave: "golpes",
      rotulo: t.gravacaoGolpes,
      valor: `${replay.dummyHits ?? 0} em dummy · ${replay.damageEvents ?? 0} no total`,
    },
    { chave: "trocas", rotulo: t.gravacaoTrocas, valor: String(replay.equipChangeCount ?? 0) },
  ];

  if (replay.traits && Object.keys(replay.traits).length > 0) {
    linhas.push({
      chave: "talentos",
      rotulo: t.gravacaoTalentos,
      // Separador visível: o espaço duplo que estava aqui antes colapsava para
      // um só no HTML, e "POW 10 CON 5" lia como um número atrás do outro.
      valor: Object.entries(replay.traits)
        .map(([k, v]) => `${k.toUpperCase()} ${v}`)
        .join(" · "),
      // De onde vieram muda o peso: lido da gravação é fato, informado no
      // formulário é palavra de quem gravou.
      ajuda: replay.traitsSource === "replay" ? t.talentosDaGravacao : t.talentosDoFormulario,
    });
  }

  if (replay.skippedItems && replay.skippedItems.length > 0) {
    linhas.push({
      chave: "itens",
      rotulo: t.gravacaoItensFora,
      valor: replay.skippedItems.join(", "),
    });
  }

  const duracao = formataDuracao(replay.durationMs);
  if (duracao) linhas.push({ chave: "duracao", rotulo: t.gravacaoDuracao, valor: duracao });

  // A migração escreveu string vazia quando a origem não tinha o campo, por isso
  // `||` e não `??`.
  linhas.push({ chave: "versao", rotulo: t.gravacaoVersao, valor: replay.appVersion || "?" });

  if (replay.fileName) {
    linhas.push({ chave: "arquivo", rotulo: t.gravacaoArquivo, valor: replay.fileName });
  }

  return linhas;
}
