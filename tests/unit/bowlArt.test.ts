import { describe, expect, it } from 'vitest';
import { bowlFor, bowlShapes, COLOUR, fillOf, GHOST, type Shape } from '../../src/ui/bowlArt.ts';

/** Every shape in a drawing, groups opened. */
const flat = (shapes: Shape[]): Shape[] =>
  shapes.flatMap((shape) => (shape.kind === 'group' ? flat(shape.shapes) : [shape]));
const curdsIn = (nth: number): number =>
  flat(bowlShapes(nth, COLOUR)).filter(
    (shape) => shape.kind === 'rect' && shape.fill === COLOUR.curd,
  ).length;

describe('the poutine bowls', () => {
  it('fills each bowl from a rating, halves too', () => {
    expect([1, 2, 3, 4, 5].map((nth) => fillOf(3.5, nth))).toEqual([1, 1, 1, 0.5, 0]);
    expect([1, 2, 3, 4, 5].map((nth) => fillOf(0, nth))).toEqual([0, 0, 0, 0, 0]);
  });

  it('stands an average for the nearest whole bowl', () => {
    expect([0.5, 1.2, 2.5, 4.4, 4.6, 5].map(bowlFor)).toEqual([1, 1, 3, 4, 5, 5]);
  });

  it('bowl 1 is the swirl with no tray; 2 to 5 get fuller', () => {
    expect(
      flat(bowlShapes(1, COLOUR)).some(
        (shape) => shape.kind === 'ellipse' && shape.fill === COLOUR.rim,
      ),
    ).toBe(false);
    expect(
      flat(bowlShapes(2, COLOUR)).some(
        (shape) => shape.kind === 'ellipse' && shape.fill === COLOUR.rim,
      ),
    ).toBe(true);
    expect([2, 3, 4, 5].map(curdsIn)).toEqual([2, 3, 5, 8]);
  });

  it('draws the grey bowl with the same shapes', () => {
    for (const nth of [1, 2, 3, 4, 5])
      expect(flat(bowlShapes(nth, GHOST)).length).toBe(flat(bowlShapes(nth, COLOUR)).length);
  });
});
