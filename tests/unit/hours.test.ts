import { describe, expect, it } from 'vitest';
import { readableHours } from '../../src/domain/hours.ts';
import { stringsFor } from '../../src/ui/strings.ts';

const en = stringsFor('en').hours;
const fr = stringsFor('fr').hours;
/** French spacing uses no-break spaces: compared here as plain ones. */
const plain = (lines: string[] | null): string[] | null =>
  lines?.map((line) => line.replaceAll(String.fromCharCode(0xa0), ' ')) ?? null;

describe('readableHours', () => {
  it('reads the usual week in English and French', () => {
    expect(readableHours('Mo-Fr 11:00-21:00; Sa,Su 10:00-22:00', en)).toEqual([
      'Mon–Fri 11:00–21:00',
      'Sat, Sun 10:00–22:00',
    ]);
    expect(plain(readableHours('Mo-Fr 11:00-21:00; Sa,Su 10:30-22:00', fr))).toEqual([
      'lun.–ven. 11 h–21 h',
      'sam., dim. 10 h 30–22 h',
    ]);
  });

  it('says every day for Mo-Su and for times with no days', () => {
    expect(readableHours('Mo-Su 11:00-20:00', en)).toEqual(['Every day 11:00–20:00']);
    expect(readableHours('10:00-20:00', en)).toEqual(['Every day 10:00–20:00']);
    expect(readableHours('24/7', en)).toEqual(['Open 24/7']);
    expect(plain(readableHours('24/7', fr))).toEqual(['Ouvert 24 h sur 24']);
  });

  it('splits rules at a comma between a time and the next days, not between two times', () => {
    expect(readableHours('Su-Th 11:00-04:00, Fr,Sa 11:00-05:00', en)).toEqual([
      'Sun–Thu 11:00–04:00',
      'Fri, Sat 11:00–05:00',
    ]);
    expect(readableHours('Mo-Sa 11:00-14:00, 17:00-21:00', en)).toEqual([
      'Mon–Sat 11:00–14:00, 17:00–21:00',
    ]);
  });

  it('reads closed days, holidays and open ends', () => {
    expect(readableHours('Mo off; Tu-Su 11:00-20:00', en)).toEqual([
      'Mon closed',
      'Tue–Sun 11:00–20:00',
    ]);
    expect(readableHours('11:00-20:00; PH on', en)).toEqual([
      'Every day 11:00–20:00',
      'holidays open',
    ]);
    expect(readableHours('Mo,Tu 16:00-20:00+', en)).toEqual(['Mon, Tue 16:00–20:00+']);
  });

  it('reads a cantine’s season, day first in French', () => {
    expect(readableHours('Apr 27-Sep 10 Mo-Su 11:00-20:00', en)).toEqual([
      'Apr 27–Sep 10 every day 11:00–20:00',
    ]);
    expect(plain(readableHours('Jun 01-Jun 23: Th-Su 11:00-20:00', fr))).toEqual([
      '1er juin–23 juin : jeu.–dim. 11 h–20 h',
    ]);
    expect(readableHours('May-Oct PH,Mo-Su 10:00-19:30', en)).toEqual([
      'May–Oct holidays, every day 10:00–19:30',
    ]);
  });

  it('gives up on what it doesn’t know, so the card shows it as tagged', () => {
    expect(readableHours('Mo-Fr 11:00-21:00 "sur rendez-vous"', en)).toBeNull();
    expect(readableHours('sunrise-sunset', en)).toBeNull();
    expect(readableHours('', en)).toBeNull();
  });
});
