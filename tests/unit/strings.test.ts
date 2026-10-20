import { describe, expect, it } from 'vitest';
import { phoneLanguage, stringsFor } from '../../src/ui/strings.ts';

describe('language', () => {
  it('follows the phone: French for any French, English otherwise', () => {
    expect(phoneLanguage(['fr-CA', 'en-CA'])).toBe('fr');
    expect(phoneLanguage(['FR'])).toBe('fr');
    for (const french of ['fr', 'fr-FR', 'fr-BE', 'fr-CH', 'fr-HT', 'fr_CA', 'fr-Latn-CA'])
      expect(phoneLanguage([french])).toBe('fr');
    expect(phoneLanguage(['en-CA', 'fr-CA'])).toBe('en');
    for (const other of ['es-MX', 'de', 'pt-BR', 'zh-Hans-CN', 'fy', 'frr', ''])
      expect(phoneLanguage([other])).toBe('en');
    expect(phoneLanguage([])).toBe('en');
  });

  it('names the app Poutine in both languages, how to say it in English', () => {
    expect(stringsFor('en').appName).toBe('Poutine');
    expect(stringsFor('en').pronounced).toBe('pronounced Pootsin');
    expect(stringsFor('fr').pronounced).toBe('');
    expect(stringsFor('fr').appName).toBe('Poutine');
  });

  it('counts half stars the language’s way', () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(stringsFor('en').ratings.star(4.5)).toBe('4.5 stars');
    expect(stringsFor('en').ratings.star(1)).toBe('1 star');
    expect(stringsFor('fr').ratings.star(4.5)).toBe('4,5 étoiles');
    expect(stringsFor('fr').ratings.star(1.5)).toBe('1,5 étoile');
    expect(stringsFor('fr').share.friend(4.5).replaceAll(nbsp, ' ')).toContain(': 4,5 étoiles.');
  });

  it('counts the places eaten, Gotta eat ’em all / Mange-les toutes', () => {
    const nbsp = String.fromCharCode(0xa0);
    const fr = stringsFor('fr');
    const en = stringsFor('en');
    expect(fr.ratings.thanks(1).replaceAll(nbsp, ' ')).toBe(
      'Merci ! 1re place, maintenant verte sur votre carte.',
    );
    expect(fr.ratings.thanks(7)).toContain('7e place');
    expect(en.ratings.thanks(7)).toBe('Thanks! Place #7, green on your map now.');
    expect(fr.tally.title(7)).toBe('7 places mangées');
    expect(fr.tally.motto.replaceAll(nbsp, ' ')).toBe('Mange-les toutes !');
    expect(en.tally.title(1)).toBe('1 place eaten');
    expect(en.tally.motto).toBe('Gotta eat ’em all!');
  });

  it('welcomes a first visit in Alex’s words, French typography in French', () => {
    expect(stringsFor('en').welcome).toMatchObject({
      title: 'Poutines.app',
      strap: 'Poots in, not poo-teen',
    });
    expect(stringsFor('en').welcome.text).toMatch(/^Mapping Canada’s poutine expansion/);
    const nbsp = String.fromCharCode(0xa0);
    expect(stringsFor('fr').welcome).toMatchObject({ title: '', strap: '' });
    expect(stringsFor('fr').welcome.text).toBe(
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
