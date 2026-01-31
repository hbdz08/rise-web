export function toYmd(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (!(value instanceof Date)) return null;

  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";

  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";

  if (typeof value === "string") {
    const s = value.trim();
    // Already a numeric date string.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Try to parse other forms (e.g. Date#toString, ISO) and re-format to numeric.
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return value;
    return toYmd(d) ?? value;
  }

  if (Number.isNaN(value.getTime())) return "-";
  return toYmd(value) ?? "-";
}
