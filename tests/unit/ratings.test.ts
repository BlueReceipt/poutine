import { describe, expect, it } from 'vitest';
import { averageOf, checkRating, confirmedByRaters, REVIEWS_ON } from '../../src/domain/ratings.ts';

const rater = '0b5c1e7a-3f2d-4c8e-9a61-2d4f8e6b7c90';
const sent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  place: 'node/1016199628',
  rater,
  stars: 4,
  ...overrides,
});

describe('checkRating', () => {
  it('keeps whole stars from 1 to 5 for a place of the list', () => {
    expect(checkRating(sent())).toEqual({
      rating: { place: 'node/1016199628', rater, stars: 4, comment: '', poutine: null },
    });
    expect(checkRating(sent({ place: 'added/12', stars: 1 }))).toMatchObject({
      rating: { place: 'added/12', stars: 1 },
    });
  });

  it('refuses other stars', () => {
    for (const stars of [0, 6, 3.5, '4', null])
      expect(checkRating(sent({ stars }))).toEqual({ problems: ['stars'] });
  });

  it('refuses what isn’t a rating: other fields, IDs of another form', () => {
    expect(checkRating(sent({ name: 'Grains' }))).toEqual({ problems: ['not-a-rating'] });
    expect(checkRating(sent({ place: 'https://example.com' }))).toEqual({
      problems: ['not-a-rating'],
    });
    expect(checkRating(sent({ rater: 'me' }))).toEqual({ problems: ['not-a-rating'] });
    expect(checkRating('4 stars')).toEqual({ problems: ['not-a-rating'] });
  });

  it('refuses a written review while reviews are switched off, takes it once on', () => {
    expect(REVIEWS_ON).toBe(false);
    expect(checkRating(sent({ comment: 'La meilleure sauce!' }))).toEqual({
      problems: ['reviews-off'],
    });
    expect(checkRating(sent({ comment: '   ' }))).toMatchObject({ rating: { comment: '' } });
    expect(checkRating(sent({ comment: ' La meilleure sauce! ' }), true)).toMatchObject({
      rating: { comment: 'La meilleure sauce!' },
    });
    expect(checkRating(sent({ comment: 'x'.repeat(501) }), true)).toEqual({
      problems: ['comment-too-long'],
    });
  });
});

describe('Did you have poutine here?', () => {
  it('takes a yes or a no with the stars, and nothing else', () => {
    expect(checkRating(sent({ poutine: true }))).toMatchObject({ rating: { poutine: true } });
    expect(checkRating(sent({ poutine: false }))).toMatchObject({ rating: { poutine: false } });
    for (const poutine of ['yes', 1, 0])
      expect(checkRating(sent({ poutine }))).toEqual({ problems: ['not-a-rating'] });
  });

  it('confirms a place with three yeses from raters, and more yeses than noes', () => {
    expect(confirmedByRaters({ count: 3, total: 12, yes: 3 })).toBe(true);
    expect(confirmedByRaters({ count: 5, total: 20, yes: 3, no: 2 })).toBe(true);
    expect(confirmedByRaters({ count: 6, total: 20, yes: 3, no: 3 })).toBe(false);
    expect(confirmedByRaters({ count: 2, total: 8, yes: 2 })).toBe(false);
    expect(confirmedByRaters({ count: 9, total: 30 })).toBe(false);
    expect(confirmedByRaters(undefined)).toBe(false);
  });
});

describe('averageOf', () => {
  it('rounds to one decimal, none without ratings', () => {
    expect(averageOf({ count: 3, total: 13 })).toBe(4.3);
    expect(averageOf({ count: 2, total: 9 })).toBe(4.5);
    expect(averageOf({ count: 0, total: 0 })).toBeNull();
    expect(averageOf(undefined)).toBeNull();
  });
});
