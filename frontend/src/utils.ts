export function fmt(n: number, currency?: string): string {
  const abs = Math.abs(n);
  const symbol = currencySymbol(currency);
  const formatted = symbol + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '-' + formatted : formatted;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: 'US$',
  SGD: 'S$',
  HKD: 'HK$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  CNY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  MYR: 'RM',
  TWD: 'NT$',
  KRW: '₩',
  INR: '₹',
  THB: '฿',
};

export function currencySymbol(currency?: string): string {
  if (!currency) return '$';
  return CURRENCY_SYMBOLS[currency] || currency + ' ';
}
