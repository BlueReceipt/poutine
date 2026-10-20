const ACCENTS = /\p{Diacritic}/gu;

/** Accents stripped, lowercased, punctuation to single spaces: "Casse-Croûte" and "casse croute" match. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The words of a text laid in lines no wider than `width`, as `measure` says (the picture's font).
 * A word too wide alone gets a line of its own.
 */
export function wrapLines(
  text: string,
  width: number,
  measure: (line: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && measure(longer) > width) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * As wrapLines, in as few lines, but as even as they go: no word left alone on a last line when
 * a narrower width would keep the line count ("…sur / une carte" becomes two halves).
 */
export function balancedLines(
  text: string,
  width: number,
  measure: (line: string) => number,
): string[] {
  const lines = wrapLines(text, width, measure);
  if (lines.length < 2) return lines;
  let best = lines;
  for (let narrower = width - 8; narrower > 0; narrower -= 8) {
    const tried = wrapLines(text, narrower, measure);
    if (tried.length > lines.length || tried.some((line) => measure(line) > narrower)) break;
    best = tried;
  }
  return best;
}
