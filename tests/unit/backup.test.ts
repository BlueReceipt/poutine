import { describe, expect, it } from 'vitest';
import { backupLink, keyFromHash, raterBytes, raterOfBytes } from '../../src/domain/backup.ts';

const rater = '0f8e3c1a-5b2d-4e6f-9a7b-1c2d3e4f5a6b';

describe('the backup link', () => {
  it('carries the rater’s key after a #, and reads it back', () => {
    expect(backupLink(rater)).toBe(`https://poutines.app/#cle=${rater}`);
    expect(keyFromHash(new URL(backupLink(rater)).hash)).toBe(rater);
    expect(keyFromHash(`#cle=${rater.toUpperCase()}`)).toBe(rater);
  });

  it('reads nothing from another # or a key that isn’t one', () => {
    expect(keyFromHash('')).toBeNull();
    expect(keyFromHash('#map=12/45.5/-73.6')).toBeNull();
    expect(keyFromHash('#cle=1234')).toBeNull();
    expect(keyFromHash(`#key=${rater}`)).toBeNull();
  });
});

describe('the passkey’s user ID', () => {
  it('holds the rater’s key as 16 bytes, and gives it back', () => {
    const bytes = raterBytes(rater);
    expect(bytes).toHaveLength(16);
    expect(bytes[0]).toBe(0x0f);
    expect(raterOfBytes(bytes)).toBe(rater);
    expect(raterOfBytes(new Uint8Array(8))).toBeNull();
  });
});
