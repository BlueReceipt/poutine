import { afterEach, describe, expect, it } from 'vitest';
import { chooseLanguage, chosenLanguage } from '../../src/ui/settings.ts';

/** A stand-in for the browser's storage, emptied after each test. */
const kept = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
    removeItem: (key: string) => kept.delete(key),
  },
});
afterEach(() => {
  kept.clear();
});

describe('the language chosen in the secret menu', () => {
  it('follows the phone until one is chosen, and again once that is undone', () => {
    expect(chosenLanguage()).toBeNull();
    chooseLanguage('fr');
    expect(chosenLanguage()).toBe('fr');
    expect(kept.get('poutine.language')).toBe('fr');
    chooseLanguage('en');
    expect(chosenLanguage()).toBe('en');
    chooseLanguage(null);
    expect(chosenLanguage()).toBeNull();
    expect(kept.has('poutine.language')).toBe(false);
  });

  it('ignores anything else kept under its name', () => {
    kept.set('poutine.language', 'de');
    expect(chosenLanguage()).toBeNull();
  });
});
