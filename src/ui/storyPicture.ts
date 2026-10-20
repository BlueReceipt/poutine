import { SITE_NAME } from '../domain/links.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import { balancedLines, wrapLines } from '../domain/text.ts';
import { GRAVY } from '../map/pins.ts';
import { drawBowl, fillOf } from './bowlArt.ts';
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

/** How wide each of the five poutine bowls is drawn, and the gap between them. */
const BOWL = 150;
const BOWL_GAP = 12;

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

/** The visitor's photo filling the whole picture, cropped from the middle. */
function cover(context: CanvasRenderingContext2D, photo: ImageBitmap) {
  const { width, height } = context.canvas;
  const scale = Math.max(width / photo.width, height / photo.height);
  const shownWidth = photo.width * scale;
  const shownHeight = photo.height * scale;
  context.drawImage(
    photo,
    (width - shownWidth) / 2,
    (height - shownHeight) / 2,
    shownWidth,
    shownHeight,
  );
}

/** The five bowls of a rating, sad to loaded, filled to the stars given (halves too). */
function bowls(context: CanvasRenderingContext2D, stars: number, middle: number, top: number) {
  const left = middle - (5 * BOWL + 4 * BOWL_GAP) / 2;
  for (let i = 0; i < 5; i += 1)
    drawBowl(context, i + 1, fillOf(stars, i + 1), left + i * (BOWL + BOWL_GAP), top, BOWL);
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
 * The place's own address under the card (poutines.app/labanquise: viewers of a story can type it),
 * as big as fits on one line; a long one breaks after "poutines.app/".
 */
function siteLines(
  context: CanvasRenderingContext2D,
  link: string | undefined,
): { text: string; size: number }[] {
  const fits = (text: string, size: number): boolean => {
    context.font = font(800, size);
    return context.measureText(text).width <= WIDTH - 180;
  };
  const whole = link ? `${SITE_NAME}/${link}` : SITE_NAME;
  for (let size = 92; size >= 56; size -= 4) if (fits(whole, size)) return [{ text: whole, size }];
  const rest = link ?? '';
  let size = 72;
  while (size > 36 && !fits(rest, size)) size -= 4;
  return [
    { text: `${SITE_NAME}/`, size: 72 },
    { text: rest, size },
  ];
}

/**
 * The story with the visitor's photo (Alex, 2026-10-20: "put 5 stars on the picture as a filter"):
 * the photo fills the picture; over its bottom, on a dark fade so they read on any photo, the
 * stars given, the place, its town and its own link; the app's badge at the top left.
 */
function filterPicture(
  context: CanvasRenderingContext2D,
  icon: HTMLImageElement,
  photo: ImageBitmap,
  place: Place,
  stars: number,
  town: string,
  strings: Strings,
) {
  const middle = WIDTH / 2;
  cover(context, photo);
  const name = nameLines(context, place.name, WIDTH - 180);
  const nameHeight = name.lines.length * name.size * 1.15;
  const site = siteLines(context, place.link);
  const siteHeight = site.reduce((height, line) => height + line.size * 1.1, 0);
  // Not rated yet: no row of bowls, only the place and its link.
  const size = stars > 0 ? BOWL : 0;
  // Instagram's and Facebook's own buttons cover about 250 px at the bottom: the words end above.
  const block = (stars > 0 ? size + 40 : 0) + nameHeight + (town ? 64 : 0) + 30 + siteHeight;
  const top = 1660 - block;
  const fade = context.createLinearGradient(0, top - 280, 0, HEIGHT);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.35, 'rgba(0, 0, 0, 0.55)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  context.fillStyle = fade;
  context.fillRect(0, top - 280, WIDTH, HEIGHT - top + 280);

  context.shadowColor = 'rgba(0, 0, 0, 0.5)';
  context.shadowBlur = 18;
  badge(context, icon, 150, 340, 54);
  context.textAlign = 'left';
  context.fillStyle = '#ffffff';
  context.font = font(800, 50);
  context.fillText(strings.appName, 222, 358);
  context.textAlign = 'center';

  if (stars > 0) bowls(context, stars, middle, top);
  let y = stars > 0 ? top + size + 40 : top;
  context.fillStyle = '#ffffff';
  context.font = font(800, name.size);
  for (const line of name.lines) {
    y += name.size;
    context.fillText(line, middle, y);
    y += name.size * 0.15;
  }
  if (town) {
    context.fillStyle = CREAM;
    context.font = font(400, 52);
    y += 64;
    context.fillText(town, middle, y);
  }
  y += 30;
  context.fillStyle = CHEESE;
  for (const line of site) {
    y += line.size;
    context.font = font(800, line.size);
    context.fillText(line.text, middle, y);
    y += line.size * 0.1;
  }
}

/**
 * The story picture of a rating: with the visitor's photo, the photo with the rating laid over it
 * (filterPicture); without, the app's card with the bowls, the place and its town, the address.
 * The photo is only drawn in: canvas keeps none of its data (place, camera), and it never leaves
 * the phone unless the visitor shares the picture.
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
  if (photo) {
    filterPicture(context, icon, photo, place, stars, town, strings);
    return blobOf(context, 'image/jpeg');
  }
  context.fillStyle = GRAVY;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const name = nameLines(context, place.name, 760);
  const nameHeight = name.lines.length * name.size * 1.15;
  const cardHeight = 70 + 52 + 40 + BOWL + 56 + nameHeight + (town ? 80 : 0) + 60;
  const site = siteLines(context, place.link);
  const siteHeight = site.reduce((height, line) => height + line.size * 1.1, 0);
  context.font = font(400, 40);
  const tagline = balancedLines(strings.tagline, 860, (line) => context.measureText(line).width);
  // Instagram's and Facebook's own buttons cover about 250 px at the top and the bottom: the whole
  // picture sits in the middle of what's left.
  const below = cardHeight + 40 + siteHeight + tagline.length * 58 + 15;
  const header = 390;
  const top = Math.max(200, 250 + (1420 - header - below) / 2);
  badge(context, icon, middle, top + 100, 100);
  context.fillStyle = CREAM;
  context.font = font(700, 76);
  context.fillText(strings.appName, middle, top + 300);

  // The card: what was given, the bowls, the place.
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
  bowls(context, stars, middle, y);
  y += BOWL + 56;
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
  y = cardTop + cardHeight + 40;
  context.fillStyle = CREAM;
  for (const line of site) {
    y += line.size;
    context.font = font(800, line.size);
    context.fillText(line.text, middle, y);
    y += line.size * 0.1;
  }
  context.font = font(400, 40);
  for (const line of tagline) {
    y += 58;
    context.fillText(line, middle, y);
  }
  return blobOf(context);
}

/**
 * The picture link previews show (public/share.png, 1200 × 630): the name, the address and what
 * the site is in both languages, since a preview can't know its reader's. Made once in a browser.
 */
export async function linkPreview(english: Strings, french: Strings): Promise<Blob> {
  const names = french.appName;
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

/**
 * The app's home-screen icon (public/icons/, listed in the manifest): the bowl on cream. Maskable
 * fills the square and keeps the bowl inside the middle 80%, which Android may crop to a circle.
 * Made once in a browser, like the link preview.
 */
export async function appIcon(size: number, maskable: boolean): Promise<Blob> {
  const icon = await ready([]);
  const context = canvasOf(size, size);
  context.fillStyle = CREAM;
  context.beginPath();
  if (maskable) context.rect(0, 0, size, size);
  else context.roundRect(0, 0, size, size, size * 0.22);
  context.fill();
  const bowl = size * (maskable ? 0.58 : 0.74);
  context.drawImage(icon, (size - bowl) / 2, (size - bowl) / 2 + size * 0.02, bowl, bowl);
  return blobOf(context);
}
