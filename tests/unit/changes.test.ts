import { describe, expect, it } from 'vitest';
import { applyFixes } from '../../src/domain/addressFixes.ts';
import {
  changedFields,
  changeFormOf,
  checkChange,
  fixOfChange,
  type ChangeForm,
} from '../../src/domain/changes.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { changeMail } from '../../worker/mailText.ts';

const place: Place = {
  osm: 'node/7',
  name: 'Cantine Trempette',
  housenumber: '12',
  street: 'Rue Grains',
  city: 'Saint-Rémi',
  citySource: 'osm',
  province: 'QC',
  postcode: '',
  addressCheck: 'confirmed',
  lat: 45.26,
  lon: -73.61,
  phone: '+14185550123',
  website: '',
  facebook: '',
  instagram: '',
  menu: '',
  openingHours: 'Mo-Su 11:00-20:00',
  cuisine: [],
  poutine: 'name',
  picked: false,
};

const form = (changes: Partial<ChangeForm>): ChangeForm => ({ ...changeFormOf(place), ...changes });

describe('Add more info', () => {
  it('opens on the place as the map has it, and says nothing changed until something does', () => {
    expect(changeFormOf(place)).toMatchObject({
      name: 'Cantine Trempette',
      street: '12 Rue Grains',
    });
    expect(checkChange(form({}), place)).toEqual({ problems: ['nothing'] });
    expect(checkChange(form({ phone: '418 555-0123' }), place)).toEqual({ problems: ['nothing'] });
  });

  it('takes a fix, tidied like the list, and names what it changes', () => {
    const checked = checkChange(
      form({ phone: '(819) 555-0199', facebook: 'cantinetrempette', hours: 'Lun-ven 11 h-20 h' }),
      place,
    );
    if (!('change' in checked)) throw new Error('refused');
    expect(checked.change).toMatchObject({
      phone: '+18195550199',
      facebook: 'https://www.facebook.com/cantinetrempette',
    });
    expect(changedFields(checked.change, place).map((each) => each.field)).toEqual([
      'phone',
      'facebook',
      'hours',
    ]);
  });

  it('refuses a broken phone, a claim with no way to reach the owner, and stray fields', () => {
    expect(checkChange(form({ phone: '555' }), place)).toEqual({ problems: ['phone'] });
    expect(checkChange(form({ claim: true }), place)).toEqual({ problems: ['contact'] });
    expect(checkChange({ ...form({}), admin: true }, place)).toEqual({
      problems: ['not-a-change'],
    });
    expect(checkChange(form({ name: '' }), place)).toEqual({ problems: ['name'] });
  });

  it('takes a claim with an email or a phone, and closed for good with nothing else', () => {
    const claim = checkChange(form({ claim: true, contact: 'Owner@Example.com' }), place);
    expect(claim).toMatchObject({ change: { claim: true, contact: 'owner@example.com' } });
    expect(checkChange(form({ closed: true }), place)).toMatchObject({ change: { closed: true } });
  });

  it('becomes a fix of only what changed once approved, closing the place when it says so', () => {
    const checked = checkChange(form({ name: 'Chez Grains', street: '14 Rue Grains' }), place);
    if (!('change' in checked)) throw new Error('refused');
    const fix = fixOfChange(checked.change, place, 3, '2026-10-21');
    expect(fix).toEqual({
      name: 'Cantine Trempette',
      renamed: 'Chez Grains',
      housenumber: '14',
      street: 'Rue Grains',
      source: 'A visitor, approved by Alex 2026-10-21 (change #3)',
      was: '12 Rue Grains, Saint-Rémi',
    });
    expect(applyFixes([place], { 'node/7': fix })[0]).toMatchObject({
      name: 'Chez Grains',
      housenumber: '14',
      phone: '+14185550123',
    });
    const closing = checkChange(form({ closed: true }), place);
    if (!('change' in closing)) throw new Error('refused');
    expect(
      applyFixes([place], { 'node/7': fixOfChange(closing.change, place, 4, '2026-10-21') }),
    ).toEqual([]);
  });

  it('says a vegan poutine is on the menu, or no longer is, once approved', () => {
    expect(changeFormOf({ ...place, vegan: true }).vegan).toBe(true);
    const checked = checkChange(form({ vegan: true }), place);
    if (!('change' in checked)) throw new Error('refused');
    expect(changedFields(checked.change, place)).toEqual([
      { field: 'vegan', before: 'no', after: 'yes' },
    ]);
    const fix = fixOfChange(checked.change, place, 6, '2026-10-21');
    expect(fix.vegan).toBe(true);
    expect(applyFixes([place], { 'node/7': fix })[0]).toMatchObject({
      vegan: true,
      poutine: 'confirmed',
    });
    const vegan = { ...place, vegan: true as const };
    const gone = checkChange(form({ vegan: false }), vegan);
    if (!('change' in gone)) throw new Error('refused');
    expect(
      applyFixes([vegan], { 'node/7': fixOfChange(gone.change, vegan, 7, '2026-10-21') })[0],
    ).not.toHaveProperty('vegan');
    // A form from before the box leaves it as it is.
    const { vegan: _, ...before } = form({ phone: '' });
    const old = checkChange(before, vegan);
    if (!('change' in old)) throw new Error('refused');
    expect(old.change.vegan).toBeNull();
    expect(changedFields(old.change, vegan).map((each) => each.field)).toEqual(['phone']);
    expect(fixOfChange(old.change, vegan, 8, '2026-10-21')).not.toHaveProperty('vegan');
  });

  it('takes a phone away when the visitor empties it', () => {
    const checked = checkChange(form({ phone: '' }), place);
    if (!('change' in checked)) throw new Error('refused');
    const fix = fixOfChange(checked.change, place, 5, '2026-10-21');
    expect(applyFixes([place], { 'node/7': fix })[0]?.phone).toBe('');
  });

  it('mails Alex what changed, never the owner’s contact', () => {
    const checked = checkChange(
      form({ claim: true, contact: 'owner@example.com', phone: '' }),
      place,
    );
    if (!('change' in checked)) throw new Error('refused');
    const raw = changeMail(9, checked.change, place, 'alex@example.com', new Date('2026-10-21'));
    const body = raw.split('\r\n\r\n')[1] ?? '';
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(body.replaceAll('\r\n', '')), (c) => c.charCodeAt(0)),
    );
    expect(text).toContain("A claim by a place's owner");
    expect(text).toContain('phone: +14185550123 → (none)');
    expect(text).not.toContain('owner@example.com');
  });
});
