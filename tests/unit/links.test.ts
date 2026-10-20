import { describe, expect, it } from 'vitest';
import {
  placeIdFromPath,
  placePath,
  placeUrl,
  previewOf,
  slugOf,
  starsFromSearch,
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

  it('carries the sharer’s stars, and only whole stars from 1 to 5', () => {
    expect(placeUrl(place(), 4)).toBe(
      'https://poutines.app/p/casse-croute-trempette-n265847671?s=4',
    );
    for (const stars of [null, undefined, 0, 6, 3.5])
      expect(placeUrl(place(), stars)).toBe(
        'https://poutines.app/p/casse-croute-trempette-n265847671',
      );
    expect(starsFromSearch('?s=4')).toBe(4);
    expect(starsFromSearch('?lang=fr&s=1')).toBe(1);
    expect(starsFromSearch('?s=2&x=1')).toBe(2);
    for (const search of ['', '?s=0', '?s=6', '?s=45', '?s=4x', '?ss=4', '?s='])
      expect(starsFromSearch(search)).toBeNull();
  });
});

describe('link previews', () => {
  const words = (language: 'en' | 'fr') => {
    const strings = stringsFor(language);
    return {
      appName: strings.appName,
      tagline: strings.tagline,
      summary: strings.ratings.summary,
      none: strings.ratings.none,
      near: strings.card.near,
      friend: strings.share.friend,
    };
  };

  it('names the place and its town, then its stars and what the site is', () => {
    expect(previewOf(place(), { count: 3, total: 13 }, words('en'))).toEqual({
      title: 'Casse-Croûte Trempette · Saint-Rémi',
      description: '4.3 out of 5 · 3 ratings. Québec’s casse-croûtes and potato shacks on a map',
    });
    expect(previewOf(place(), undefined, words('fr')).description).toBe(
      'Pas encore de note. Les casse-croûtes et cantines du Québec sur une carte',
    );
  });

  it('leads with a friend’s stars when the link carries them', () => {
    expect(previewOf(place(), { count: 3, total: 13 }, words('en'), 4)).toEqual({
      title: '4 ★ · Casse-Croûte Trempette · Saint-Rémi',
      description:
        'A friend gave this place 4 stars. What would you give it? Québec’s casse-croûtes and potato shacks on a map',
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
