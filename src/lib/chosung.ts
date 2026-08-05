const CHOSUNG_LIST = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

export function toChosung(str: string) {
  let result = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG_LIST[Math.floor(code / 588)];
    } else {
      result += ch.toLowerCase();
    }
  }
  return result;
}

export function matchesCompanyQuery(name: string, query: string) {
  if (!query) return false;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerName.includes(lowerQuery)) return true;
  return toChosung(name).includes(toChosung(query));
}

export function filterCompanyCandidates(
  names: string[],
  query: string,
  limit = 6
) {
  const q = query.trim();
  if (!q) return [];
  return names.filter((name) => matchesCompanyQuery(name, q)).slice(0, limit);
}
