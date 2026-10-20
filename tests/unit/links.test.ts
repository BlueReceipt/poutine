import { describe, expect, it } from 'vitest';
import {
  friendFromSearch,
  isEnglishLink,
  kindOf,
  placeIdFromPath,
  placePath,
  placeUrl,
  PREVIEW_PICTURE,
  previewOf,
  slugOf,
} from '../../src/domain/links.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { balancedLines, wrapLines } from '../../src/domain/text.ts';
import { stringsFor } from '../../src/ui/strings.ts';

const place = (overrides: Partial<Place> = {}): Place => ({
  osm: 'node/265847671',
  name: 'Casse-Croûte Trempette',
  housenumber: '12',
  street: 'Rue Principale',
  city: 'Saint-Rémi',
  citySource: 'osm',
  province: 'QC',
  postcode: '',
  addressCheck: 'unchecked',
  lat: 45.26,
  lon: -73.61,
  phone: '',
  website: '',
  facebook: '',
  instagram: '',
  menu: '',
  openingHours: '',
  cuisine: [],
  poutine: 'name',
  picked: false,
  ...overrides,
});

describe('place links', () => {
  it('reads the name in the link, without accents or punctuation, then the short ID', () => {
    expect(slugOf('Casse-Croûte Chez Ti-Paul')).toBe('casse-croute-chez-ti-paul');
    expect(placePath(place())).toBe('/p/casse-croute-trempette-n265847671');
    expect(placePath(place({ osm: 'way/42', name: 'Cantine Grains' }))).toBe(
      '/p/cantine-grains-w42',
    );
    expect(placePath(place({ osm: 'added/3', name: '???' }))).toBe('/p/a3');
    expect(placeUrl(place())).toBe('https://poutines.app/p/casse-croute-trempette-n265847671');
  });

  it('keeps the readable part to whole words, 60 characters at most', () => {
    const slug = slugOf('Poutini '.repeat(20));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('poutini')).toBe(true);
  });

  it('finds the place a link names, whatever its readable part says', () => {
    expect(placeIdFromPath('/p/casse-croute-trempette-n265847671')).toBe('node/265847671');
    expect(placeIdFromPath('/p/an-old-name-n265847671')).toBe('node/265847671');
    expect(placeIdFromPath('/p/n265847671')).toBe('node/265847671');
    expect(placeIdFromPath('/p/cantine-r12/')).toBe('relation/12');
    expect(placeIdFromPath('/p/a3')).toBe('added/3');
    expect(placeIdFromPath('/p/Cantine-Grains-W42')).toBe('way/42');
    for (const path of ['/', '/p/', '/p/cantine', '/p/x12', '/api/ratings', '/p/n12/extra'])
      expect(placeIdFromPath(path)).toBeNull();
    for (const each of [place(), place({ osm: 'added/3', name: '???' })])
      expect(placeIdFromPath(placePath(each))).toBe(each.osm);
  });

  it('carries the sharer’s stars with their code, only whole stars from 1 to 5', () => {
    expect(placeUrl(place(), { stars: 4, code: 'x7Kq2m-_' })).toBe(
      'https://poutines.app/p/casse-croute-trempette-n265847671?s=4&c=x7Kq2m-_',
    );
    for (const friend of [
      null,
      undefined,
      { stars: 0, code: 'x7Kq2m-_' },
      { stars: 4, code: 'short' },
    ])
      expect(placeUrl(place(), friend)).toBe(
        'https://poutines.app/p/casse-croute-trempette-n265847671',
      );
    expect(friendFromSearch('?s=4&c=x7Kq2m-_')).toEqual({ stars: 4, code: 'x7Kq2m-_' });
    expect(friendFromSearch('?s=4.5&c=x7Kq2m-_')).toEqual({ stars: 4.5, code: 'x7Kq2m-_' });
    expect(placeUrl(place(), { stars: 0.5, code: 'x7Kq2m-_' })).toBe(
      'https://poutines.app/p/casse-croute-trempette-n265847671?s=0.5&c=x7Kq2m-_',
    );
    expect(friendFromSearch('?c=AAAAAAAA&lang=fr&s=1')).toEqual({ stars: 1, code: 'AAAAAAAA' });
    for (const search of [
      '',
      '?s=4',
      '?s=0&c=AAAAAAAA',
      '?s=6&c=AAAAAAAA',
      '?s=4&c=AAAA',
      '?s=4&c=AAAAAAA%3C',
    ])
      expect(friendFromSearch(search)).toBeNull();
  });
});

describe('link previews', () => {
  const words = (language: 'en' | 'fr') => {
    const strings = stringsFor(language);
    return {
      tagline: strings.tagline,
      summary: strings.ratings.summary,
      near: strings.card.near,
      friend: strings.share.friend,
      number: strings.ratings.number,
      ...strings.preview,
    };
  };

  it('names the place and its town, then its stars once it has some, what it is and where', () => {
    expect(previewOf(place(), { count: 3, total: 13 }, words('en'))).toEqual({
      title: 'Casse-Croûte Trempette · Saint-Rémi',
      description:
        '4.3 out of 5 · 3 ratings. Casse-croûte in Saint-Rémi. Poutine, not poo-teen: mapping Canada’s poutine expansion from its humble beginnings in central Québec.',
    });
    expect(previewOf(place(), undefined, words('fr')).description).toBe(
      'Casse-croûte à Saint-Rémi. Les casse-croûtes et cantines du Québec sur une carte',
    );
    expect(
      previewOf(place({ citySource: 'nearest-town' }), { count: 0, total: 0 }, words('fr'))
        .description,
    ).toBe(
      'Casse-croûte près de Saint-Rémi. Les casse-croûtes et cantines du Québec sur une carte',
    );
  });

  it('says what a place is from its name, poutine when it says nothing', () => {
    const kinds = [
      ['Casse-croute du Village', 'casse-croute'],
      ['La Belle Anne casse-croûte mets antillais', 'casse-croute'],
      ['Cantine Grains', 'cantine'],
      ['Friterie Poutini', 'friterie'],
      ['Bar laitier Trempette', 'bar-laitier'],
      ['La Patate d’Autrefois', 'patates'],
      ['La Pataterie', 'patates'],
      ['La Banquise', 'poutine'],
    ] as const;
    for (const [name, kind] of kinds) expect(kindOf({ name })).toBe(kind);
    expect(
      previewOf(place({ name: 'La Banquise', city: 'Montréal' }), undefined, words('en'))
        .description,
    ).toBe(
      'Poutine in Montréal. Poutine, not poo-teen: mapping Canada’s poutine expansion from its humble beginnings in central Québec.',
    );
  });

  it('leads with a friend’s stars when the link carries them', () => {
    expect(previewOf(place(), { count: 3, total: 13 }, words('en'), 4)).toEqual({
      title: '4 ★ · Casse-Croûte Trempette · Saint-Rémi',
      description:
        'A friend gave this place 4 stars. What would you give it? Poutine, not poo-teen: mapping Canada’s poutine expansion from its humble beginnings in central Québec.',
    });
    const nbsp = String.fromCharCode(0xa0);
    expect(previewOf(place(), undefined, words('fr'), 1).description).toBe(
      `Quelqu’un t’envoie sa note${nbsp}: 1 étoile. Et toi, tu lui donnes combien${nbsp}? Les casse-croûtes et cantines du Québec sur une carte`,
    );
  });

  it('gives the province outside Québec, and only the name without a town', () => {
    expect(
      previewOf(place({ city: 'Saint-Isidore', province: 'ON' }), undefined, words('en')).title,
    ).toBe('Casse-Croûte Trempette · Saint-Isidore, ON');
    expect(previewOf(place({ city: '' }), undefined, words('en')).title).toBe(
      'Casse-Croûte Trempette',
    );
  });
});

describe('wrapLines', () => {
  // One unit per character: lines of 12 at most.
  const measure = (line: string) => line.length;

  it('lays words in lines no wider than asked', () => {
    expect(wrapLines('Casse-Croûte Chez Poutini du Village', 12, measure)).toEqual([
      'Casse-Croûte',
      'Chez Poutini',
      'du Village',
    ]);
  });

  it('gives a word too wide its own line', () => {
    expect(wrapLines('La Patatemobilerie Grains', 12, measure)).toEqual([
      'La',
      'Patatemobilerie',
      'Grains',
    ]);
    expect(wrapLines('  ', 12, measure)).toEqual([]);
  });

  it('evens the lines out, no word left alone on the last one', () => {
    const tagline = 'Les casse-croûtes du Québec sur une carte';
    expect(wrapLines(tagline, 34, measure)).toEqual([
      'Les casse-croûtes du Québec sur',
      'une carte',
    ]);
    expect(balancedLines(tagline, 34, measure)).toEqual([
      'Les casse-croûtes du',
      'Québec sur une carte',
    ]);
    expect(balancedLines('La Banquise', 34, measure)).toEqual(['La Banquise']);
  });
});

describe('links shared from an English phone', () => {
  const trempette = { osm: 'node/265847671', name: 'Casse-croûte Trempette', link: 'trempette' };

  it('say so with ?en, after a friend’s stars', () => {
    expect(placeUrl(trempette, null, true)).toBe('https://poutines.app/trempette?en');
    expect(placeUrl(trempette, { stars: 4, code: 'x7Kq2m-_' }, true)).toBe(
      'https://poutines.app/trempette?s=4&c=x7Kq2m-_&en',
    );
    expect(placeUrl(trempette, null)).toBe('https://poutines.app/trempette');
  });

  it('are read back, with or without stars; their preview picture is the English one', () => {
    expect(isEnglishLink('?en')).toBe(true);
    expect(isEnglishLink('?s=4&c=x7Kq2m-_&en')).toBe(true);
    expect(friendFromSearch('?s=4&c=x7Kq2m-_&en')).toEqual({ stars: 4, code: 'x7Kq2m-_' });
    expect(isEnglishLink('')).toBe(false);
    expect(isEnglishLink('?s=4&c=x7Kq2m-_')).toBe(false);
    expect(PREVIEW_PICTURE.en).toBe('https://poutines.app/share-en.png?v=4');
  });
});
