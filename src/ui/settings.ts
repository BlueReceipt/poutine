import type { Language } from './strings.ts';

/** The language chosen in the secret menu. Every key this browser keeps starts with "poutine.". */
const LANGUAGE = 'poutine.language';

/** The language chosen in the secret menu; null to follow the phone (nothing chosen, storage off). */
export function chosenLanguage(): Language | null {
  try {
    const saved = localStorage.getItem(LANGUAGE);
    return saved === 'fr' || saved === 'en' ? saved : null;
  } catch {
    return null;
  }
}

/** Keeps the language chosen on this phone; null goes back to the phone's own. */
export function chooseLanguage(language: Language | null): void {
  try {
    if (language) localStorage.setItem(LANGUAGE, language);
    else localStorage.removeItem(LANGUAGE);
  } catch {
    // Storage off: the choice holds for this visit only.
  }
}
