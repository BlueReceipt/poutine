import { describe, expect, it } from 'vitest';
import { placePath, placeUrl } from '../../src/domain/links.ts';
import { assignLinks, linkFromPath, searchFor } from '../../src/domain/shortLinks.ts';

const at = (osm: string, name: string, city: string) => ({ osm, name, city });

describe('assignLinks', () => {
  it('gives a name no other place has as it is, in one word', () => {
    expect(assignLinks([at('node/1', 'Casse-Croûte Trempette', 'Saint-Rémi')], {})).toEqual({
      'node/1': 'cassecroutetrempette',
    });
  });

  it('adds the town to every place sharing a name: mtl and qc for Montréal and Québec', () => {
    const places = [
      at('node/1', 'Cantine Grains', 'Montréal'),
      at('node/2', 'Cantine Grains', 'Québec'),
      at('node/3', 'Cantine Grains', 'Saint-Rémi'),
    ];
    expect(assignLinks(places, {})).toEqual({
      'node/1': 'cantinegrainsmtl',
      'node/2': 'cantinegrainsqc',
      'node/3': 'cantinegrainssaintremi',
    });
  });

  it('numbers the same name in the same town, in the order of their IDs', () => {
    const places = [
      at('node/30', 'Chez Poutini', 'Québec'),
      at('node/4', 'Chez Poutini', 'Québec'),
    ];
    expect(assignLinks(places, {})).toEqual({
      'node/4': 'chezpoutiniqc',
      'node/30': 'chezpoutiniqc2',
    });
  });

  it('never changes a link once given, nor gives it to another place', () => {
    const given = { 'node/1': 'cantinegrains', 'way/9': 'patatepoutini' };
    const places = [
      at('node/1', 'Cantine Grains (renamed)', 'Montréal'),
      at('node/2', 'Cantine Grains', 'Laval'),
      at('node/3', 'Patate Poutini', 'Gaspé'),
    ];
    expect(assignLinks(places, given)).toEqual({
      'node/1': 'cantinegrains',
      'way/9': 'patatepoutini',
      'node/2': 'cantinegrainslaval',
      'node/3': 'patatepoutinigaspe',
    });
  });

  it('leaves the site’s own words alone', () => {
    expect(assignLinks([at('added/1', 'API', 'Laval'), at('added/2', '!!', '')], {})).toEqual({
      'added/1': 'apilaval',
      'added/2': 'poutine',
    });
  });
});

describe('short links in use', () => {
  it('is the place’s path and link once it has one', () => {
    const banquise = { osm: 'node/5228808422', name: 'La Banquise', link: 'labanquise' };
    expect(placePath(banquise)).toBe('/labanquise');
    expect(placeUrl(banquise, 4)).toBe('https://poutines.app/labanquise?s=4');
  });

  it('reads a typed link however it’s written', () => {
    for (const path of ['/labanquise', '/La-Banquise', '/LaBanquise/', '/labanquis%C3%A9'])
      expect(linkFromPath(path)).toMatch(/^labanquise?$/);
    expect(linkFromPath('/la%20banquise')).toBe('labanquise');
    for (const path of ['/', '/p/n1', '/share.png', '/assets/index.js', '/%E0%A4%A', '/--'])
      expect(linkFromPath(path)).toBeNull();
  });

  it('turns a word that’s no link into a search: a shared name, then a town', () => {
    const places = [
      at('node/1', 'Casse-croûte', 'Gaspé'),
      at('node/2', 'Casse-croûte', 'Matane'),
      at('node/3', 'La Banquise', 'Montréal'),
      at('node/4', 'Chez Poutini', 'Saint-Rémi'),
    ];
    expect(searchFor('cassecroute', places)).toBe('Casse-croûte');
    expect(searchFor('saintremi', places)).toBe('Saint-Rémi');
    expect(searchFor('mtl', places)).toBe('Montréal');
    expect(searchFor('zzz', places)).toBeNull();
  });
});
