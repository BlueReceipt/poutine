import { describe, expect, it } from 'vitest';
import {
  leadName,
  leadTier,
  registerAddress,
  type Establishment,
} from '../../src/domain/registerLeads.ts';

const establishment = (details: Partial<Establishment>): Establishment => ({
  neq: '1140000564',
  name: 'CANTINE TREMPETTE',
  lines: ['554 boul. du Curé-Labelle', 'Blainville (Québec)', '', 'J7C2L5'],
  activities: [{ code: '9212', text: 'RESTAURANT' }],
  ...details,
});

describe('register leads', () => {
  it('takes restaurants named like a casse-croûte, then those whose activity says so', () => {
    expect(leadTier(establishment({}), 'CANTINE TREMPETTE')).toBe('named');
    expect(
      leadTier(
        establishment({ activities: [{ code: '9213', text: 'CASSE-CROÛTE' }] }),
        'CHEZ GRAINS',
      ),
    ).toBe('described');
    expect(leadTier(establishment({}), 'CHEZ GRAINS')).toBeNull();
    const fastFood = establishment({ activities: [{ code: '9213', text: 'RESTAURATION RAPIDE' }] });
    expect(leadTier(fastFood, 'CHEZ GRAINS')).toBeNull();
    expect(
      leadTier(
        establishment({ activities: [{ code: '9213', text: 'CASSE-CROÛTE' }] }),
        'PIZZÉRIA GRAINS',
      ),
    ).toBeNull();
    expect(
      leadTier(establishment({ activities: [{ code: '7215', text: 'GESTION' }] }), 'CANTINE'),
    ).toBeNull();
  });

  it('leaves out chains and institutions’ cafeterias', () => {
    const fastFood = establishment({ activities: [{ code: '9213', text: 'RESTAURATION RAPIDE' }] });
    expect(leadTier(fastFood, 'SUBWAY')).toBeNull();
    expect(leadTier(fastFood, 'DAIRY QUEEN JOLIETTE')).toBeNull();
    expect(leadTier(fastFood, 'SODEXO A/S: CASSE-CROÛTE LES MURAILLES')).toBeNull();
  });

  it('names a numbered company by its other name that says casse-croûte', () => {
    expect(
      leadName(establishment({ name: '9123-4567 QUÉBEC INC.' }), ['GRAINS', 'CASSE-CROÛTE GRAINS']),
    ).toBe('CASSE-CROÛTE GRAINS');
    expect(leadName(establishment({ name: '171674 CANADA INC.' }), [])).toBe('171674 CANADA INC.');
    expect(leadName(establishment({}), ['OTHER'])).toBe('CANTINE TREMPETTE');
  });

  it('reads the four address lines: street without its post-office box, town, postal code', () => {
    expect(
      registerAddress(['554 boul. du Curé-Labelle', 'Blainville (Québec)', '', 'J7C2L5']),
    ).toEqual({
      street: '554 boul. du Curé-Labelle',
      town: 'Blainville',
      postalCode: 'J7C 2L5',
    });
    expect(
      registerAddress(['3035, CHEMIN PRINCIPAL C.P. 405', 'MONT-TREMBLANT QC', '', 'J0T1Z0']),
    ).toEqual({ street: '3035, CHEMIN PRINCIPAL', town: 'MONT-TREMBLANT', postalCode: 'J0T 1Z0' });
  });
});
