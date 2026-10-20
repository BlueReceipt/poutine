/**
 * The poutine bowls that rate a place, in place of stars (Alex, 2026-10-20: "change the stars for
 * poutine bowls"; option C, "sad to loaded"; "make the bowl closer to this" (a round foil tray); bowl
 * 1 "more like a poop emoji", with no tray, "make the eyes cheese. and the bottom some fries").
 * Each bowl is a list of shapes in its own 50 × 38 box, drawn by the card (`Bowl.tsx`, as SVG) and by
 * the story picture (`drawBowl`, on canvas) alike: bowl 1 Mr. Poo-teen, bowls 2 to 5 a
 * foil tray ever fuller of fries under gravy and curds. A bowl not given is the same drawing in grey.
 */

/** The bowl's own box: x from -1, y from 5, 50 wide, 38 high. */
export const BOX = { x: -1, y: 5, width: 50, height: 38 } as const;

/** A fry's golden shading, from its top side to its bottom side. */
export interface FryPaint {
  top: string;
  middle: string;
  bottom: string;
}

/** A turn (degrees), a move or a scale, applied in order like SVG's `transform`. */
export type Op = ['turn', number] | ['move', number, number] | ['scale', number];

export type Shape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: string | FryPaint;
      stroke?: string;
      line?: number;
    }
  | {
      kind: 'ellipse';
      x: number;
      y: number;
      rx: number;
      ry: number;
      fill: string;
      stroke?: string;
      line?: number;
    }
  | { kind: 'path'; d: string; fill?: string; stroke?: string; line?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; line: number }
  | { kind: 'group'; ops: Op[]; shapes: Shape[] };

interface Palette {
  fry: FryPaint;
  fryEnd: string;
  fryLine: string;
  sauce: string;
  sauceDark: string;
  sauceLight: string;
  pupil: string;
  curd: string;
  curdLine: string;
  curdShade: string;
  inner: string;
  rim: string;
  crimp: string;
  body: string;
  pleatDark: string;
  pleatLight: string;
  bodyLine: string;
  shine: string;
}

export const COLOUR: Palette = {
  fry: { top: '#ffe37e', middle: '#ffcf45', bottom: '#e8a21d' },
  fryEnd: '#fff0b0',
  fryLine: '#a8690f',
  sauce: '#6f4022',
  sauceDark: '#4f2c15',
  sauceLight: '#a06a3f',
  pupil: '#2a1608',
  curd: '#fffbf2',
  curdLine: '#cdbf9b',
  curdShade: '#efe6d0',
  inner: '#c4c9cf',
  rim: '#e8ebee',
  crimp: '#a9b0b8',
  body: '#d3d7dc',
  pleatDark: '#b4bac1',
  pleatLight: '#eef0f3',
  bodyLine: '#7d848c',
  shine: '#fbfcfd',
};

/** A bowl not given yet: the same drawing in greys. */
export const GHOST: Palette = {
  fry: { top: '#efefec', middle: '#e8e8e4', bottom: '#dededa' },
  fryEnd: '#f4f4f1',
  fryLine: '#c4c4be',
  sauce: '#d8d8d3',
  sauceDark: '#cfcfca',
  sauceLight: '#e2e2de',
  pupil: '#c2c2bc',
  curd: '#f3f3f0',
  curdLine: '#c8c8c2',
  curdShade: '#e8e8e4',
  inner: '#dcdcd8',
  rim: '#efefed',
  crimp: '#cdcdc8',
  body: '#e4e4e1',
  pleatDark: '#cfcfca',
  pleatLight: '#f3f3f1',
  bodyLine: '#bdbdb7',
  shine: '#f7f7f5',
};

interface Fry {
  x: number;
  y: number;
  /** Degrees from level. */
  a: number;
  len: number;
  w: number;
}

/** A chunky fry lying at an angle, its cut end lighter. */
function fry(p: Palette, f: Fry): Shape {
  const x = f.x - f.len / 2;
  const y = f.y - f.w / 2;
  return turned(f.a, f.x, f.y, [
    { kind: 'rect', x, y, w: f.len, h: f.w, r: 0.9, fill: p.fry, stroke: p.fryLine, line: 0.55 },
    {
      kind: 'rect',
      x: x + f.len - 2.3,
      y: y + 0.35,
      w: 1.95,
      h: f.w - 0.7,
      r: 0.6,
      fill: p.fryEnd,
    },
  ]);
}

function turned(a: number, x: number, y: number, shapes: Shape[]): Shape {
  return {
    kind: 'group',
    ops: [
      ['move', x, y],
      ['turn', a],
      ['move', -x, -y],
    ],
    shapes,
  };
}

/** A cheese curd: its shadow of gravy, the curd, the shade along its bottom. */
function curd(p: Palette, x: number, y: number, a: number, w: number, h: number): Shape {
  return turned(a, x, y, [
    { kind: 'rect', x: x - w / 2 + 0.4, y: y - h / 2 + 0.7, w, h, r: 1.8, fill: p.sauceDark },
    {
      kind: 'rect',
      x: x - w / 2,
      y: y - h / 2,
      w,
      h,
      r: 1.8,
      fill: p.curd,
      stroke: p.curdLine,
      line: 0.6,
    },
    {
      kind: 'rect',
      x: x - w / 2 + 0.7,
      y: y + h / 2 - 1.5,
      w: w - 1.4,
      h: 0.9,
      r: 0.45,
      fill: p.curdShade,
    },
  ]);
}

function drip(p: Palette, x: number, from: number, to: number): Shape {
  return {
    kind: 'path',
    d: `M${String(x - 1.25)} ${String(from)} L${String(x - 1.25)} ${String(to)} a1.25 1.25 0 0 0 2.5 0 L${String(x + 1.25)} ${String(from)} Z`,
    fill: p.sauce,
  };
}

const shine = (p: Palette, d: string): Shape => ({
  kind: 'path',
  d,
  stroke: p.sauceLight,
  line: 1.1,
});

/** Crimps across the tray's rim, from the opening to its edge, between two angles (0 to π: the front). */
function crimps(p: Palette, from: number, to: number, count: number): Shape[] {
  const lines: Shape[] = [];
  for (let i = 1; i < count; i += 1) {
    const t = from + ((to - from) * i) / count;
    lines.push({
      kind: 'line',
      x1: 24 + 20.2 * Math.cos(t),
      y1: 27 + 4.2 * Math.sin(t),
      x2: 24 + 22.6 * Math.cos(t),
      y2: 26.5 + 5 * Math.sin(t),
      stroke: p.crimp,
      line: 0.45,
    });
  }
  return lines;
}

/**
 * Bowl 1, "Mr. Poo-teen's poop on fries and cheese curds" (Alex named it, 2026-10-20; the name stays
 * out of what people see: "don't mention poo-teen on the user facing sign"): the gravy in three
 * swirled tiers and a curl, on a bed of fries, curds for eyes, a grin.
 */
function mrPooTeen(p: Palette): Shape[] {
  const tier = (d: string): Shape => ({
    kind: 'path',
    d,
    fill: p.sauce,
    stroke: p.sauceDark,
    line: 0.6,
  });
  const eye = (x: number, a: number): Shape =>
    turned(a, x, 19.8, [
      {
        kind: 'rect',
        x: x - 2.7,
        y: 17.5,
        w: 5.4,
        h: 4.6,
        r: 1.9,
        fill: p.curd,
        stroke: p.curdLine,
        line: 0.6,
      },
      { kind: 'rect', x: x - 2, y: 20.7, w: 4, h: 0.9, r: 0.45, fill: p.curdShade },
    ]);
  return [
    {
      kind: 'group',
      ops: [
        ['move', 24, 30],
        ['scale', 1.18],
        ['move', -24, -24.4],
      ],
      shapes: [
        fry(p, { x: 10.6, y: 27.6, a: -24, len: 7, w: 3.7 }),
        fry(p, { x: 37.4, y: 27.6, a: 26, len: 7, w: 3.7 }),
        fry(p, { x: 15.5, y: 29.4, a: -5, len: 10, w: 3.9 }),
        fry(p, { x: 32.5, y: 29.4, a: 7, len: 10, w: 3.9 }),
        tier(
          'M12.5 28.8 C11 26.5 12.5 22.5 16.5 22 C19 20.8 29 20.8 31.5 22 C35.5 22.5 37 26.5 35.5 28.8 Z',
        ),
        shine(p, 'M15 25.6 Q17.6 22.8 21.6 22.5'),
        tier(
          'M15.5 23.6 C14.2 21 16 17.6 19.4 17.2 C21.5 16.2 27 16.2 28.8 17.2 C32 17.6 33.8 21 32.5 23.6 Z',
        ),
        shine(p, 'M17.6 20.4 Q19.6 18 22.6 17.7'),
        tier(
          'M18.8 18.4 C17.8 16.2 19.6 13.6 22 13.4 C23.5 12.6 25.6 12.8 26.6 13.4 C28.8 13.8 30.2 16.2 29.2 18.4 Z',
        ),
        tier('M22.4 13.8 C22.4 11.4 24.6 10.6 25.6 8.4 C26.8 10.4 27.4 12.6 26.4 14 Z'),
        shine(p, 'M20.6 16 Q21.6 14.4 23.2 14.1'),
        eye(20.8, -8),
        eye(27.2, 9),
        { kind: 'ellipse', x: 21.3, y: 20.2, rx: 1.05, ry: 1.05, fill: p.pupil },
        { kind: 'ellipse', x: 27.7, y: 20.2, rx: 1.05, ry: 1.05, fill: p.pupil },
        {
          kind: 'path',
          d: 'M19.2 24.4 Q24 25.6 28.8 24.4 Q28 28 24 28.1 Q20 28 19.2 24.4 Z',
          fill: p.pupil,
        },
        {
          kind: 'path',
          d: 'M19.9 24.75 Q24 25.7 28.1 24.75 L27.9 25.6 Q24 26.4 20.1 25.6 Z',
          fill: p.curd,
        },
        fry(p, { x: 23.6, y: 30.6, a: 3, len: 11, w: 4 }),
        fry(p, { x: 14.2, y: 31, a: -12, len: 7.5, w: 3.7 }),
        fry(p, { x: 33.6, y: 31, a: 12, len: 7.5, w: 3.7 }),
      ],
    },
  ];
}

// Fries lying in a low pile, their ends poking out around the gravy; the first `fries` of them go
// in, so a fuller bowl has more.
const FRIES: Fry[] = [
  { x: 9.5, y: 25.6, a: -16, len: 8.5, w: 4.3 },
  { x: 38.5, y: 25.6, a: 14, len: 8.5, w: 4.3 },
  { x: 20, y: 16.2, a: -12, len: 7.5, w: 4.1 },
  { x: 8, y: 22.2, a: 26, len: 7, w: 4 },
  { x: 40, y: 22, a: -28, len: 7, w: 4 },
  { x: 12.8, y: 19.2, a: -40, len: 7.5, w: 4 },
  { x: 35.4, y: 18.6, a: 40, len: 7.5, w: 4 },
  { x: 28.6, y: 15.6, a: 16, len: 7.5, w: 4.1 },
  { x: 24.2, y: 14.6, a: 72, len: 6.5, w: 4 },
];
/** In a full bowl, one fry lies on the gravy. */
const ON_TOP: Fry = { x: 29.5, y: 21.4, a: -18, len: 7.5, w: 3.9 };
/** Curds on the gravy: where, turned how much, how big. */
const CURDS: [number, number, number, number, number][] = [
  [23, 18.6, -10, 5.6, 4.4],
  [16, 21.4, 14, 5.2, 4.2],
  [31, 18.4, -9, 5.4, 4.2],
  [12.5, 24.8, 22, 4.8, 3.9],
  [22, 23.4, -4, 5.0, 4.0],
  [35.5, 23.6, 16, 4.8, 3.9],
  [27, 25.6, 6, 4.6, 3.8],
  [17.5, 26, -14, 4.6, 3.8],
];
/** Bowls 2 to 5: how many fries, how big the pile, how many curds. */
const FULLER: Record<number, { fries: number; pile: number; curds: number }> = {
  2: { fries: 4, pile: 0.45, curds: 2 },
  3: { fries: 6, pile: 0.65, curds: 3 },
  4: { fries: 8, pile: 0.85, curds: 5 },
  5: { fries: 9, pile: 1, curds: 8 },
};
// Foil is crinkled: each pleat a little off in place, lean and weight.
const JITTER = [
  0.3, -0.4, 0.1, 0.5, -0.2, -0.5, 0.2, 0.4, -0.3, 0, 0.5, -0.4, 0.2, -0.1, 0.4, -0.5, 0.1, 0.3,
  -0.2, 0.5,
];
const jitter = (i: number): number => JITTER[i % JITTER.length] ?? 0;

/** Bowls 2 to 5: a round foil tray, the fries under the gravy and curds sitting in it. */
function tray(p: Palette, nth: number): Shape[] {
  const { fries, pile, curds } = FULLER[nth] ?? { fries: 9, pile: 1, curds: 8 };
  const k = 0.55 + 0.45 * pile;
  const food: Shape[] = FRIES.slice(0, fries).map((f) => fry(p, f));
  food.push(
    {
      kind: 'path',
      d: 'M10.2 27.6 C8.6 24 11 20.6 14 20 C15.6 17 19.6 15.6 23 16.2 C26.2 15 30.6 15.8 32.6 17.8 C36.2 18 39.6 21.6 38.6 25 C38.2 27.2 36.4 28.4 34 28.4 L12.2 28.6 C11.2 28.5 10.5 28.1 10.2 27.6 Z',
      fill: p.sauce,
    },
    drip(p, 13.4, 27.5, 30.4),
    drip(p, 30.6, 27.8, 30),
    drip(p, 22, 28, 29.6),
    drip(p, 37.2, 25.5, 27.6),
    shine(p, 'M15 21.2 Q19 17.4 24.5 17.6'),
    { kind: 'ellipse', x: 33.6, y: 20.8, rx: 1.1, ry: 0.7, fill: p.sauceLight },
    { kind: 'ellipse', x: 19.4, y: 25.6, rx: 0.9, ry: 0.6, fill: p.sauceLight },
  );
  if (fries >= 8) food.push(fry(p, ON_TOP));
  for (const [x, y, a, w, h] of CURDS.slice(0, curds)) food.push(curd(p, x, y, a, w, h));

  const pleats: Shape[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const x = 4.2 + (i * 39.6) / 18 + jitter(i) * 0.5;
    const t = (x - 24) / 21.8;
    const xb = 24 + (x - 24) * 0.8 + jitter(i + 7) * 0.6;
    pleats.push({
      kind: 'line',
      x1: x,
      y1: 28.6 + 4.9 * Math.sqrt(Math.max(0, 1 - t * t)),
      x2: xb,
      y2: 37.6 + 4.2 * (1 - ((xb - 24) / 17.4) ** 2) * 0.55,
      stroke: i % 2 ? p.pleatLight : p.pleatDark,
      line: (i % 2 ? 0.65 : 0.4) + Math.abs(jitter(i + 3)) * 0.4,
    });
  }
  return [
    // The rim and the inside, behind the food.
    {
      kind: 'ellipse',
      x: 24,
      y: 26.5,
      rx: 23,
      ry: 5.2,
      fill: p.rim,
      stroke: p.bodyLine,
      line: 0.7,
    },
    ...crimps(p, Math.PI, 2 * Math.PI, 12),
    { kind: 'ellipse', x: 24, y: 27, rx: 20.2, ry: 4.2, fill: p.inner, stroke: p.crimp, line: 0.6 },
    // The food, sitting low in the tray, smaller in a sadder bowl.
    {
      kind: 'group',
      ops: [
        ['move', 24, 32.6],
        ['scale', k],
        ['move', -24, -29],
      ],
      shapes: food,
    },
    // The wall in front, slanting in to a flat bottom, pleated like foil.
    {
      kind: 'path',
      d: 'M2.2 28 A21.8 4.9 0 0 0 45.8 28 L41.4 37.6 Q24 42.4 6.6 37.6 Z',
      fill: p.body,
      stroke: p.bodyLine,
      line: 0.8,
    },
    ...pleats,
    { kind: 'path', d: 'M9.6 31.6 L12.4 39', stroke: p.shine, line: 1.3 },
    // The rim's front over the food: a flat crimped band.
    {
      kind: 'path',
      d: 'M1 26.5 A23 5.2 0 0 0 47 26.5 L44.2 27 A20.2 4.2 0 0 1 3.8 27 Z',
      fill: p.rim,
      stroke: p.bodyLine,
      line: 0.7,
    },
    ...crimps(p, 0, Math.PI, 18),
    { kind: 'path', d: 'M5 29.6 A20 4.3 0 0 0 20 31.6', stroke: p.shine, line: 0.8 },
  ];
}

const drawings = new Map<string, Shape[]>();

/** The nth bowl (1 to 5) in colour or in grey. */
export function bowlShapes(nth: number, palette: Palette): Shape[] {
  const key = `${String(nth)}${palette === COLOUR ? 'c' : 'g'}`;
  let shapes = drawings.get(key);
  if (!shapes) {
    shapes = nth === 1 ? mrPooTeen(palette) : tray(palette, nth);
    drawings.set(key, shapes);
  }
  return shapes;
}

/** How much of the nth bowl (1 to 5) a rating fills: 0, a half or 1. */
export const fillOf = (stars: number, nth: number): number =>
  Math.max(0, Math.min(1, stars - (nth - 1)));

/** The bowl that stands for an average: the nearest whole one, 1 to 5. */
export const bowlFor = (average: number): number => Math.max(1, Math.min(5, Math.round(average)));

function paintOn(context: CanvasRenderingContext2D, shape: Shape): void {
  if (shape.kind === 'group') {
    context.save();
    for (const op of shape.ops) {
      if (op[0] === 'move') context.translate(op[1], op[2]);
      else if (op[0] === 'turn') context.rotate((op[1] * Math.PI) / 180);
      else context.scale(op[1], op[1]);
    }
    for (const inner of shape.shapes) paintOn(context, inner);
    context.restore();
    return;
  }
  const path = shape.kind === 'path' ? new Path2D(shape.d) : new Path2D();
  let fill: string | CanvasGradient | undefined;
  if (shape.kind === 'rect') {
    path.roundRect(shape.x, shape.y, shape.w, shape.h, shape.r);
    if (typeof shape.fill === 'string') fill = shape.fill;
    else {
      const gradient = context.createLinearGradient(0, shape.y, 0, shape.y + shape.h);
      gradient.addColorStop(0, shape.fill.top);
      gradient.addColorStop(0.55, shape.fill.middle);
      gradient.addColorStop(1, shape.fill.bottom);
      fill = gradient;
    }
  } else if (shape.kind === 'ellipse') {
    path.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
    fill = shape.fill;
  } else if (shape.kind === 'line') {
    path.moveTo(shape.x1, shape.y1);
    path.lineTo(shape.x2, shape.y2);
  } else fill = shape.fill;
  if (fill) {
    context.fillStyle = fill;
    context.fill(path);
  }
  if (shape.stroke && shape.line) {
    context.strokeStyle = shape.stroke;
    context.lineWidth = shape.line;
    context.stroke(path);
  }
}

/**
 * The nth bowl on a canvas, in a square of `size` at (x, y), filled to `fill` from the left: the grey
 * bowl, then the coloured one clipped over it (a half bowl for a half star).
 */
export function drawBowl(
  context: CanvasRenderingContext2D,
  nth: number,
  fill: number,
  x: number,
  y: number,
  size: number,
): void {
  const scale = size / BOX.width;
  context.save();
  context.shadowColor = 'transparent';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.translate(x, y + (size - BOX.height * scale) / 2);
  context.scale(scale, scale);
  context.translate(-BOX.x, -BOX.y);
  if (fill < 1) for (const shape of bowlShapes(nth, GHOST)) paintOn(context, shape);
  if (fill > 0) {
    context.beginPath();
    context.rect(BOX.x, BOX.y, BOX.width * fill, BOX.height);
    context.clip();
    for (const shape of bowlShapes(nth, COLOUR)) paintOn(context, shape);
  }
  context.restore();
}
