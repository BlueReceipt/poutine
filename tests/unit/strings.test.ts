import { describe, expect, it } from 'vitest';
import { phoneLanguage, stringsFor } from '../../src/ui/strings.ts';

describe('language', () => {
  it('follows the phone: French for any French, English otherwise', () => {
    expect(phoneLanguage(['fr-CA', 'en-CA'])).toBe('fr');
    expect(phoneLanguage(['FR'])).toBe('fr');
    expect(phoneLanguage(['en-CA', 'fr-CA'])).toBe('en');
    expect(phoneLanguage([])).toBe('en');
  });

  it('names the app Poutine in both languages, how to say it in English', () => {
    expect(stringsFor('en').appName).toBe('Poutine');
    expect(stringsFor('en').pronounced).toBe('pronounced Pootsin');
    expect(stringsFor('fr').pronounced).toBe('');
    expect(stringsFor('fr').appName).toBe('Poutine');
  });

  it('welcomes a first visit in Alex’s words, French typography in French', () => {
    expect(stringsFor('en').welcome).toMatch(
      /^Poutine, pronounced pootsin, was invented in Québec\./,
    );
    const nbsp = String.fromCharCode(0xa0);
    expect(stringsFor('fr').welcome).toBe(
      `Poutines.app te permet de trouver ta prochaine poutine. Note-la pis partage ta photo${nbsp}! Fini les chaînes${nbsp}!`,
    );
  });

  it('writes distances in metres, then kilometres, the language’s way', () => {
    const en = stringsFor('en').nearMe.distance;
    const fr = (meters: number): string =>
      stringsFor('fr').nearMe.distance(meters).replaceAll(String.fromCharCode(0xa0), ' ');
    expect(en(384)).toBe('380 m');
    expect(en(995)).toBe('1 km');
    expect(en(1340)).toBe('1.3 km');
    expect(en(12_600)).toBe('13 km');
    expect(fr(1340)).toBe('1,3 km');
    expect(fr(384)).toBe('380 m');
  });
});
