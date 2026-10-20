import { SITE_NAME } from '../domain/links.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import { balancedLines, wrapLines } from '../domain/text.ts';
import { GRAVY } from '../map/pins.ts';
import type { Strings } from './strings.ts';

/**
 * The picture a rating is shared with: story-sized (1080 × 1920, what Instagram and Facebook stories
 * fill), drawn in the browser so nothing leaves the phone until the visitor picks an app. Stories
 * drop the links a web page hands them, so the site's address is printed on it.
 */
const WIDTH = 1080;
const HEIGHT = 1920;

/** The icon's colors (public/icon.svg): curds, cheese, gravy. */
const CREAM = '#fffbea';
const CHEESE = '#f2c230';
const INK = '#000000';
const FAMILY = '"Atkinson Hyperlegible Next", sans-serif';

/** Ratings.tsx's star, 24 units wide. */
const STAR = new Path2D(
  'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
);

const font = (weight: number, size: number): string =>
  `${String(weight)} ${String(size)}px ${FAMILY}`;

/** The font in every weight drawn (for the letters these texts use), and the icon. */
async function ready(texts: string[]): Promise<HTMLImageElement> {
  const letters = texts.join(' ');
  await Promise.all(
    [400, 700, 800].map((weight) => document.fonts.load(font(weight, 64), letters)),
  );
  const icon = new Image();
  icon.src = '/icon.svg';
  await icon.decode();
  return icon;
}

function canvasOf(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas in this browser.');
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  return context;
}

/** PNG for flat colors; JPEG once a photo is in (a PNG of a photo weighs megabytes). */
function blobOf(context: CanvasRenderingContext2D, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    context.canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The picture could not be made.'));
      },
      type,
      0.9,
    );
  });
}

/** The visitor's photo filling a rounded frame, cropped to it from the middle. */
function framed(
  context: CanvasRenderingContext2D,
  photo: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / photo.width, height / photo.height);
  const shownWidth = photo.width * scale;
  const shownHeight = photo.height * scale;
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 48);
  context.clip();
  context.drawImage(
    photo,
    x + (width - shownWidth) / 2,
    y + (height - shownHeight) / 2,
    shownWidth,
    shownHeight,
  );
  context.restore();
}

function star(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  filled: boolean,
) {
  context.save();
  context.translate(x, y);
  context.scale(size / 24, size / 24);
  context.lineJoin = 'round';
  context.lineWidth = 1.4;
  context.strokeStyle = GRAVY;
  if (filled) {
    context.fillStyle = CHEESE;
    context.fill(STAR);
  }
  context.stroke(STAR);
  context.restore();
}

/** The icon on a cream disc. */
function badge(
  context: CanvasRenderingContext2D,
  icon: HTMLImageElement,
  x: number,
  y: number,
  radius: number,
) {
  context.fillStyle = CREAM;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  const size = radius * 1.5;
  context.drawImage(icon, x - size / 2, y - size / 2 + radius * 0.06, size, size);
}

/** The place's name as big as fits in three lines; past that, the third line ends in "…". */
function nameLines(context: CanvasRenderingContext2D, name: string, width: number) {
  const measure = (line: string) => context.measureText(line).width;
  for (let size = 96; size >= 60; size -= 6) {
    context.font = font(800, size);
    const lines = balancedLines(name, width, measure);
    if (lines.length <= 3 && lines.every((line) => measure(line) <= width)) return { size, lines };
  }
  const size = 60;
  context.font = font(800, size);
  const lines = wrapLines(name, width, measure).slice(0, 3);
  const last = lines.length - 1;
  let end = lines[last] ?? '';
  while (end && measure(`${end}…`) > width) end = end.slice(0, -1).trimEnd();
  lines[last] = `${end}…`;
  return { size, lines };
}

/**
 * The story picture of a rating: the app (or the visitor's photo, with the app's badge on it), the
 * stars given, the place and its town, the address. The photo is only drawn in: canvas keeps none
 * of its data (place, camera), and it never leaves the phone unless the visitor shares the picture.
 */
export async function storyPicture(
  place: Place,
  stars: number,
  strings: Strings,
  photo?: ImageBitmap,
): Promise<Blob> {
  const town = townText(place, strings.card.near);
  const icon = await ready([
    strings.appName,
    strings.share.gave,
    place.name,
    town,
    strings.tagline,
  ]);
  const context = canvasOf(WIDTH, HEIGHT);
  const middle = WIDTH / 2;
  context.fillStyle = GRAVY;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const name = nameLines(context, place.name, 760);
  const nameHeight = name.lines.length * name.size * 1.15;
  const cardHeight = 70 + 52 + 40 + 120 + 56 + nameHeight + (town ? 80 : 0) + 60;
  context.font = font(400, 40);
  const tagline = balancedLines(strings.tagline, 860, (line) => context.measureText(line).width);
  // Instagram's and Facebook's own buttons cover about 250 px at the top and the bottom: the whole
  // picture sits in the middle of what's left. A photo takes what the card leaves, within limits.
  const below = cardHeight + 130 + tagline.length * 58 + 15;
  const photoHeight = Math.min(640, Math.max(380, 1420 - 40 - below));
  const header = photo ? photoHeight + 40 : 390;
  const top = Math.max(200, 250 + (1420 - header - below) / 2);
  if (photo) {
    framed(context, photo, 90, top, WIDTH - 180, photoHeight);
    badge(context, icon, 90 + 96, top + 96, 64);
  } else {
    badge(context, icon, middle, top + 100, 100);
    context.fillStyle = CREAM;
    context.font = font(700, 76);
    context.fillText(strings.appName, middle, top + 300);
  }

  // The card: what was given, the stars, the place.
  const cardTop = top + header;
  context.fillStyle = CREAM;
  context.beginPath();
  context.roundRect(90, cardTop, WIDTH - 180, cardHeight, 48);
  context.fill();

  let y = cardTop + 70 + 42;
  context.fillStyle = GRAVY;
  context.font = font(400, 52);
  context.fillText(strings.share.gave, middle, y);
  y += 40;
  const size = 120;
  const gap = 24;
  const left = middle - (5 * size + 4 * gap) / 2;
  for (let i = 0; i < 5; i += 1) star(context, left + i * (size + gap), y, size, i < stars);
  y += size + 56;
  context.fillStyle = INK;
  context.font = font(800, name.size);
  for (const line of name.lines) {
    y += name.size;
    context.fillText(line, middle, y);
    y += name.size * 0.15;
  }
  if (town) {
    context.fillStyle = GRAVY;
    context.font = font(400, 52);
    context.fillText(town, middle, y + 70);
  }

  // The address to type, under the card.
  y = cardTop + cardHeight + 130;
  context.fillStyle = CREAM;
  context.font = font(800, 92);
  context.fillText(SITE_NAME, middle, y);
  context.font = font(400, 40);
  for (const line of tagline) {
    y += 58;
    context.fillText(line, middle, y);
  }
  return blobOf(context, photo ? 'image/jpeg' : 'image/png');
}

/**
 * The picture link previews show (public/share.png, 1200 × 630): both names, the address and what
 * the site is in both languages, since a preview can't know its reader's. Made once in a browser.
 */
export async function linkPreview(english: Strings, french: Strings): Promise<Blob> {
  const names = `${french.appName} · ${english.appName}`;
  const icon = await ready([names, SITE_NAME, english.tagline, french.tagline]);
  const context = canvasOf(1200, 630);
  context.fillStyle = GRAVY;
  context.fillRect(0, 0, 1200, 630);
  badge(context, icon, 260, 315, 170);
  context.textAlign = 'left';
  context.fillStyle = CREAM;
  context.font = font(800, 84);
  context.fillText(SITE_NAME, 490, 250);
  context.font = font(700, 48);
  context.fillText(names, 490, 330);
  context.font = font(400, 30);
  const measure = (line: string) => context.measureText(line).width;
  let y = 400;
  for (const tagline of [french.tagline, english.tagline])
    for (const line of balancedLines(tagline, 640, measure)) {
      context.fillText(line, 490, y);
      y += 42;
    }
  return blobOf(context);
}
