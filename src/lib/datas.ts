const RTF = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const DATA_COMPLETA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "há 3 dias", "há 2 meses". Acima de um ano vira data absoluta. */
export function formatRelative(data: Date | null): string {
  if (!data) return "";
  const delta = data.getTime() - Date.now();
  const abs = Math.abs(delta);

  if (abs < MINUTO) return "agora";
  if (abs < HORA) return RTF.format(Math.round(delta / MINUTO), "minute");
  if (abs < DIA) return RTF.format(Math.round(delta / HORA), "hour");
  if (abs < 30 * DIA) return RTF.format(Math.round(delta / DIA), "day");
  if (abs < 365 * DIA) return RTF.format(Math.round(delta / (30 * DIA)), "month");
  return DATA_COMPLETA.format(data);
}

export function formatData(data: Date | null): string {
  return data ? DATA_COMPLETA.format(data) : "";
}
