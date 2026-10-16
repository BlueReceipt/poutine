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
