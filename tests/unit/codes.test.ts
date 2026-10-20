import { describe, expect, it } from 'vitest';
import { friendCode, friendCodeFits } from '../../worker/codes.ts';

describe('friend codes', () => {
  it('gives eight link-safe characters, the same for the same place and stars', async () => {
    const code = await friendCode('a secret', 'node/5228808422', 4);
    expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(await friendCode('a secret', 'node/5228808422', 4)).toBe(code);
  });

  it('fits only the place and stars it was made for, with the Worker’s secret', async () => {
    const code = await friendCode('a secret', 'node/5228808422', 4);
    expect(await friendCodeFits('a secret', 'node/5228808422', 4, code)).toBe(true);
    expect(await friendCodeFits('a secret', 'node/5228808422', 5, code)).toBe(false);
    expect(await friendCodeFits('a secret', 'node/8156068991', 4, code)).toBe(false);
    expect(await friendCodeFits('another secret', 'node/5228808422', 4, code)).toBe(false);
    expect(await friendCodeFits('a secret', 'node/5228808422', 4, 'AAAAAAAA')).toBe(false);
  });
});
