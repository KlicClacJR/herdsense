export function hashString(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function seededUnit(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function seededBetween(seed, min, max) {
  return min + seededUnit(seed) * (max - min);
}

export function seededChoice(items, seed) {
  if (!items.length) return undefined;
  const idx = Math.floor(seededUnit(seed) * items.length) % items.length;
  return items[idx];
}
