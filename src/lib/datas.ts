const RTF = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const FULL_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "há 3 dias", "há 2 meses". Over a year it becomes an absolute date.
 *
 * The locale and the strings it returns are read by the community, so they stay
 * in Portuguese.
 */
export function formatRelative(date: Date | null): string {
  if (!date) return "";
  const delta = date.getTime() - Date.now();
  const abs = Math.abs(delta);

  if (abs < MINUTE) return "agora";
  if (abs < HOUR) return RTF.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return RTF.format(Math.round(delta / HOUR), "hour");
  if (abs < 30 * DAY) return RTF.format(Math.round(delta / DAY), "day");
  if (abs < 365 * DAY) return RTF.format(Math.round(delta / (30 * DAY)), "month");
  return FULL_DATE.format(date);
}

export function formatDate(date: Date | null): string {
  return date ? FULL_DATE.format(date) : "";
}
