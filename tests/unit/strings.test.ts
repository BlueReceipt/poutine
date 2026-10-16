import { describe, expect, it } from 'vitest';
import { phoneLanguage, stringsFor } from '../../src/ui/strings.ts';

describe('language', () => {
  it('follows the phone: French for any French, English otherwise', () => {
    expect(phoneLanguage(['fr-CA', 'en-CA'])).toBe('fr');
    expect(phoneLanguage(['FR'])).toBe('fr');
    expect(phoneLanguage(['en-CA', 'fr-CA'])).toBe('en');
    expect(phoneLanguage([])).toBe('en');
  });

  it('names the app Pootsin in English and Poutine in French', () => {
    expect(stringsFor('en').appName).toBe('Pootsin');
    expect(stringsFor('fr').appName).toBe('Poutine');
  });
});
