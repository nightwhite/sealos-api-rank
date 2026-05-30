export function maskApiKey(value, prefixLength = 7, suffixLength = 4) {
  if (typeof value !== 'string') return '••••••';
  const trimmed = value.trim();
  if (trimmed.length <= prefixLength + suffixLength) return '••••••';
  return `${trimmed.slice(0, prefixLength)}••••••${trimmed.slice(-suffixLength)}`;
}
