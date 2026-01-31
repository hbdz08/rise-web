export function isValidChinaIdNo(idNo: string): boolean {
  return /^\d{17}[\dXx]$/.test(idNo.trim());
}

export function isValidChinaPhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone.trim());
}

export function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length !== 11) return p;
  return `${p.slice(0, 3)}****${p.slice(7)}`;
}

