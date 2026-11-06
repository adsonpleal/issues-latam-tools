import { t } from "../../i18n";
import type { Recording } from "../../lib/gravacoes";
import type { ReplaySummary } from "../../lib/issues";

/**
 * A fila da triagem, em três pilhas.
 *
 * `fila` é o que espera decisão; `decididas` junta conferida e descartada, que
 * são as duas formas de fechar sem publicar; `promovidas` já viraram card.
 */
export type RecordingQueue = {
  queue: Recording[];
  promovidas: Recording[];
  decididas: Recording[];
};

function timeOf(d: Date | null): number {
  return d ? d.getTime() : 0;
}

export function splitRecordings(recordings: Recording[]): RecordingQueue {
  // A fila ordena pela chegada; as decididas, pelo carimbo — ali o que interessa
  // é o que acabou de sair, não o que foi gravado primeiro.
  const porChegada = (a: Recording, b: Recording) => timeOf(b.createdAt) - timeOf(a.createdAt);
  const porDecisao = (a: Recording, b: Recording) => timeOf(b.decidedAt) - timeOf(a.decidedAt);

  return {
    queue: recordings.filter((g) => g.state === "fila").sort(porChegada),
    promovidas: recordings.filter((g) => g.state === "promovida").sort(porDecisao),
    decididas: recordings
      .filter((g) => g.state === "conferida" || g.state === "descartada")
      .sort(porDecisao),
  };
}

/** "2m 13s". O .rrf mede em milissegundos, e ninguém lê 133400 como dois minutos. */
export function formatDuration(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return min ? `${min}m ${seg}s` : `${seg}s`;
}

export type SummaryRow = { chave: string; rotulo: string; value: string; help?: string };

/**
 * O que a triagem lê de uma gravação, numa lista só — a mesma na fila e no
 * painel do card promovido. Ficar num lugar é o que impede as duas telas de
 * discordarem sobre o que importa: trocas de equipamento separam "fórmula
 * errada" de "item faltando no banco", e golpes em dummy é o que gera crítico
 * suficiente para fechar a conta.
 */
export function summaryRows(replay: ReplaySummary): SummaryRow[] {
  const rows: SummaryRow[] = [
    {
      chave: "personagem",
      rotulo: t.recordingCharacter,
      value: `${replay.className ?? "?"} — ${replay.player ?? "?"} (nv ${replay.baseLevel ?? "?"}/${
        replay.jobLevel ?? "?"
      })`,
    },
    {
      chave: "golpes",
      rotulo: t.recordingHits,
      value: `${replay.dummyHits ?? 0} em dummy · ${replay.damageEvents ?? 0} no total`,
    },
    { chave: "trocas", rotulo: t.recordingEquipChanges, value: String(replay.equipChangeCount ?? 0) },
  ];

  if (replay.traits && Object.keys(replay.traits).length > 0) {
    rows.push({
      chave: "talentos",
      rotulo: t.recordingTraits,
      // Separador visível: o espaço duplo que estava aqui antes colapsava para
      // um só no HTML, e "POW 10 CON 5" lia como um número atrás do outro.
      value: Object.entries(replay.traits)
        .map(([k, v]) => `${k.toUpperCase()} ${v}`)
        .join(" · "),
      // De onde vieram muda o peso: lido da gravação é fato, informado no
      // formulário é palavra de quem gravou.
      help: replay.traitsSource === "replay" ? t.traitsFromRecording : t.traitsFromForm,
    });
  }

  if (replay.skippedItems && replay.skippedItems.length > 0) {
    rows.push({
      chave: "itens",
      rotulo: t.recordingUnknownItems,
      value: replay.skippedItems.join(", "),
    });
  }

  const duracao = formatDuration(replay.durationMs);
  if (duracao) rows.push({ chave: "duracao", rotulo: t.recordingDuration, value: duracao });

  // A migração escreveu string vazia quando a origem não tinha o campo, por isso
  // `||` e não `??`.
  rows.push({ chave: "versao", rotulo: t.recordingAppVersion, value: replay.appVersion || "?" });

  if (replay.fileName) {
    rows.push({ chave: "arquivo", rotulo: t.recordingFile, value: replay.fileName });
  }

  return rows;
}
