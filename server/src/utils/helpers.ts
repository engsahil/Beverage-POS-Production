export function generateId(): string {
  return crypto.randomUUID();
}

export function generateInvoiceNumber(prefix: string = '', sequence: number): string {
  return `${prefix}${sequence.toString().padStart(6, '0')}`;
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/[<>]/g, '');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local.length > 2
    ? local.slice(0, 2) + '***'
    : local[0] + '***';
  return `${masked}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-2);
}
