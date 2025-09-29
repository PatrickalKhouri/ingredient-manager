
export function normalizeIngredient(s: string) {
    return (s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[•·;]/g, ',')
      .replace(/\s*[,]\s*/g, ',')
      .replace(/[–—]/g, '-')
      .replace(/[^\w()\/\-\s,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
  

  export function normalizeLabel(input: string) {
    return (input || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()]/g, ' ')               // strip parens → space (matches Nest)
      .replace(/[^A-Za-z0-9\s\-\/]/g, ' ') // keep letters/digits/space - /
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();                      // UPPERCASE, not lower
  }
  
  
  export function splitIngredients(raw: string): string[] {
    if (!raw) return [];
  
    // Normalize separators and tidy whitespace
    const s = (raw || '')
      .replace(/\r?\n/g, ',') // ✅ newline = separator
      .replace(/[;|•·、・]/g, ',') // normalize other separators
      .replace(/\s+/g, ' ') // collapse runs of spaces
      .trim();
  
    const parts: string[] = [];
    let buf = '';
    let depthParens = 0;
    let depthBrackets = 0;
    let depthBraces = 0;
  
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
  
      if (ch === '(') depthParens++;
      else if (ch === ')') depthParens = Math.max(0, depthParens - 1);
      else if (ch === '[') depthBrackets++;
      else if (ch === ']') depthBrackets = Math.max(0, depthBrackets - 1);
      else if (ch === '{') depthBraces++;
      else if (ch === '}') depthBraces = Math.max(0, depthBraces - 1);
  
      // Split on commas only when not inside brackets
      if (
        ch === ',' &&
        depthParens === 0 &&
        depthBrackets === 0 &&
        depthBraces === 0
      ) {
        const prev = s[i - 1];
        const next = s[i + 1];
  
        // ✅ Edge case: don't split if comma is between two digits (e.g. 1,2-Hexanediol)
        if (/\d/.test(prev) && /\d/.test(next)) {
          buf += ch;
          continue;
        }
  
        const token = buf.trim().replace(/^,+|,+$/g, '');
        if (token) parts.push(token);
        buf = '';
        continue;
      }
  
      buf += ch;
    }
  
    const last = buf.trim().replace(/^,+|,+$/g, '');
    if (last) parts.push(last);
  
    return parts;
  }
  
  export function generateCandidates(norm: string): string[] {
    const set = new Set<string>();
    set.add(norm);
    const noParen = norm
      // Remove all text within parentheses (including the parentheses themselves) and replace with a single space
      .replace(/\([^)]*\)/g, ' ')
      // Replace multiple consecutive whitespace characters with a single space
      .replace(/\s+/g, ' ')
      .trim();
    if (noParen) set.add(noParen);
    const inside = [...norm.matchAll(/\(([^)]+)\)/g)]
      // Extract the text inside parentheses (capture group 1)
      .map((m) => m[1]?.trim())
      .filter(Boolean);
    inside.forEach((s) => set.add(s));
    return Array.from(set);
  }
  
  export function getKey(obj: any, ...keys: string[]) {
    const lower = Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.toLowerCase().replace(/^\uFEFF/, ''),
        v,
      ]),
    );
    for (const key of keys) {
      if (lower[key.toLowerCase()]) return lower[key.toLowerCase()];
    }
  }
  