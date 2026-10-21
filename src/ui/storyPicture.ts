import { SITE_NAME } from '../domain/links.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import { balancedLines, wrapLines } from '../domain/text.ts';
import { GRAVY } from '../map/pins.ts';
import { bowlFor, drawBowl } from './bowlArt.ts';
import type { Strings } from './strings.ts';

/**
 * The picture a rating is shared with: story-sized (1080 × 1920, what Instagram and Facebook stories
 * fill), drawn in the browser so nothing leaves the phone until the visitor picks an app. Stories
 * drop the links a web page hands them, so the place's own address is printed at the top (Alex,
 * 2026-10-20: "put the poutines.app/restaurant in the top. and the rating and the name location in
 * the bottom"), in place of the app's old bowl logo ("this needs to be removed everywhere").
 */
const WIDTH = 1080;
const HEIGHT = 1920;

const CREAM = '#fffbea';
const CHEESE = '#f2c230';
const INK = '#000000';
const FAMILY = '"Atkinson Hyperlegible Next", sans-serif';

/**
 * How wide the rating's one bowl is drawn: the bowl given, not the whole scale (Alex, 2026-10-20:
 * "i also added a rating scale. so we don't need to have a whole rating scale on each picture. just
 * the actual ratings").
 */
const BOWL = 230;

/** Where the place's address sits: below the 250 px Instagram's and Facebook's buttons cover. */
const LINK_TOP = 330;

const font = (weight: number, size: number): string =>
  `${String(weight)} ${String(size)}px ${FAMILY}`;

/** The font in every weight drawn, for the letters these texts use. */
async function ready(texts: string[]): Promise<void> {
  const letters = texts.join(' ');
  await Promise.all(
    [400, 700, 800].map((weight) => document.fonts.load(font(weight, 64), letters)),
  );
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

/**
 * The rating given: its one bowl, sad to loaded (a half given before whole bowls rounds to the
 * nearer), with "4/5" beside it, the row centred on `middle` from `top`.
 */
function rating(
  context: CanvasRenderingContext2D,
  stars: number,
  strings: Strings,
  middle: number,
  top: number,
  color: string,
) {
  const score = `${strings.ratings.number(stars)}/5`;
  context.font = font(800, 120);
  const scoreWidth = context.measureText(score).width;
  const gap = 36;
  const left = middle - (BOWL + gap + scoreWidth) / 2;
  drawBowl(context, bowlFor(stars), 1, left, top, BOWL);
  context.textAlign = 'left';
  context.fillStyle = color;
  context.fillText(score, left + BOWL + gap, top + BOWL / 2 + 42);
  context.textAlign = 'center';
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

/** The place's own address at the top of a story, lines from `top`; returns where it ends. */
function siteAtTop(
  context: CanvasRenderingContext2D,
  link: string | undefined,
  top: number,
  color: string,
): number {
  let y = top;
  context.fillStyle = color;
  for (const line of siteLines(context, link)) {
    y += line.size;
    context.font = font(800, line.size);
    context.fillText(line.text, WIDTH / 2, y);
    y += line.size * 0.1;
  }
  return y;
}

/**
 * The story with the visitor's photo (Alex, 2026-10-20: "put 5 stars on the picture as a filter"):
 * the photo fills the picture; the place's address at the top, and over its bottom the rating, the
 * place and its town, each on a dark fade so they read on any photo.
 */
function filterPicture(
  context: CanvasRenderingContext2D,
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
  // Not rated yet: no bowl, only the place.
  const rated = stars > 0;
  // Instagram's and Facebook's own buttons cover about 250 px at the bottom: the words end above.
  const block = (rated ? BOWL + 50 : 0) + nameHeight + (town ? 64 : 0);
  const top = 1660 - block;
  const fade = context.createLinearGradient(0, top - 280, 0, HEIGHT);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.35, 'rgba(0, 0, 0, 0.55)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  context.fillStyle = fade;
  context.fillRect(0, top - 280, WIDTH, HEIGHT - top + 280);
  const shade = context.createLinearGradient(0, 0, 0, LINK_TOP + 320);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, LINK_TOP + 320);

  context.shadowColor = 'rgba(0, 0, 0, 0.5)';
  context.shadowBlur = 18;
  siteAtTop(context, place.link, LINK_TOP, CHEESE);
  if (rated) rating(context, stars, strings, middle, top, '#ffffff');
  let y = rated ? top + BOWL + 50 : top;
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
}

/**
 * The story picture of a rating: with the visitor's photo, the photo with the rating laid over it
 * (filterPicture); without, the place's address at the top, then the app's card with the rating,
 * the place and its town, and the tagline. The photo is only drawn in: canvas keeps none of its
 * data (place, camera), and it never leaves the phone unless the visitor shares the picture.
 */
export async function storyPicture(
  place: Place,
  stars: number,
  strings: Strings,
  photo?: ImageBitmap,
): Promise<Blob> {
  const town = townText(place, strings.card.near);
  await ready([
    strings.share.gave,
    place.name,
    town,
    strings.tagline,
    SITE_NAME,
    place.link ?? '',
    '0123456789,./',
  ]);
  const context = canvasOf(WIDTH, HEIGHT);
  const middle = WIDTH / 2;
  if (photo) {
    filterPicture(context, photo, place, stars, town, strings);
    return blobOf(context, 'image/jpeg');
  }
  context.fillStyle = GRAVY;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const linkEnd = siteAtTop(context, place.link, LINK_TOP, CHEESE);

  const name = nameLines(context, place.name, 760);
  const nameHeight = name.lines.length * name.size * 1.15;
  const rated = stars > 0;
  const cardHeight = 70 + 52 + (rated ? 40 + BOWL : 0) + 56 + nameHeight + (town ? 80 : 0) + 60;
  context.font = font(400, 40);
  const tagline = balancedLines(strings.tagline, 860, (line) => context.measureText(line).width);
  // The card and the tagline in the middle of what's left above the 250 px the apps cover.
  const below = cardHeight + tagline.length * 58 + 40;
  const cardTop = Math.max(linkEnd + 80, linkEnd + (1670 - linkEnd - below) / 2);

  context.fillStyle = CREAM;
  context.beginPath();
  context.roundRect(90, cardTop, WIDTH - 180, cardHeight, 48);
  context.fill();

  let y = cardTop + 70 + 42;
  context.fillStyle = GRAVY;
  context.font = font(400, 52);
  context.fillText(strings.share.gave, middle, y);
  if (rated) {
    y += 40;
    rating(context, stars, strings, middle, y, GRAVY);
    y += BOWL;
  }
  y += 56;
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

  y = cardTop + cardHeight + 40;
  context.fillStyle = CREAM;
  context.font = font(400, 40);
  for (const line of tagline) {
    y += 58;
    context.fillText(line, middle, y);
  }
  return blobOf(context);
}

/**
 * The picture link previews show, one per language (Alex, 2026-10-20: "Have one picture for french,
 * one for english"; in English "it reads what i wrote"): public/share.png in French, share-en.png in
 * English, 1200 × 630. The poutine poop of bowl 1 on a cream disc, in English with `previewCaption`
 * under it ("Pronounced Poots-in, not poo-teen"); beside it the welcome's title, `previewStrap` ("Rate
 * it, and share it."; the app's name in French) and the welcome's words. Made once in a browser.
 */
export async function linkPreview(strings: Strings): Promise<Blob> {
  const title = strings.welcome.title || SITE_NAME.charAt(0).toUpperCase() + SITE_NAME.slice(1);
  const strap = strings.previewStrap || strings.appName;
  const caption = strings.previewCaption;
  await ready([title, strap, strings.welcome.text, caption]);
  const context = canvasOf(1200, 630);
  context.fillStyle = GRAVY;
  context.fillRect(0, 0, 1200, 630);
  // With a caption under it, the disc sits higher and a little smaller.
  const disc = caption ? { y: 270, radius: 150 } : { y: 315, radius: 170 };
  const poop = (280 * disc.radius) / 170;
  context.fillStyle = CREAM;
  context.beginPath();
  context.arc(260, disc.y, disc.radius, 0, Math.PI * 2);
  context.fill();
  drawBowl(context, 1, 1, 260 - poop / 2, disc.y - poop * 0.535, poop);
  if (caption) {
    context.fillStyle = CHEESE;
    context.textAlign = 'center';
    context.font = font(800, 36);
    const lines = balancedLines(caption, 420, (line) => context.measureText(line).width);
    let below = disc.y + disc.radius + 62;
    for (const line of lines) {
      context.fillText(line, 260, below);
      below += 46;
    }
  }
  // The welcome beside it, the block centred: title, strapline, then the words in lines.
  context.textAlign = 'left';
  context.fillStyle = CREAM;
  context.font = font(400, 30);
  const words = balancedLines(strings.welcome.text, 640, (line) => context.measureText(line).width);
  const block = 66 + 62 + 56 + (words.length - 1) * 42 + 10;
  let y = (630 - block) / 2 + 66;
  context.font = font(800, 80);
  context.fillText(title, 490, y);
  y += 62;
  context.font = font(700, 44);
  context.fillText(strap, 490, y);
  y += 56;
  context.font = font(400, 30);
  for (const line of words) {
    context.fillText(line, 490, y);
    y += 42;
  }
  return blobOf(context);
}

/**
 * The app's home-screen icon (public/icons/, listed in the manifest): the poutine poop of bowl 1 on
 * cream, as on the link previews, in place of the old bowl logo (Alex, 2026-10-20: "this needs to
 * be removed everywhere"). Maskable fills the square and keeps the poop inside the middle 80%,
 * which Android may crop to a circle. Made once in a browser, like the link preview.
 */
export async function appIcon(size: number, maskable: boolean): Promise<Blob> {
  const context = canvasOf(size, size);
  context.fillStyle = CREAM;
  context.beginPath();
  if (maskable) context.rect(0, 0, size, size);
  else context.roundRect(0, 0, size, size, size * 0.22);
  context.fill();
  const poop = size * (maskable ? 0.62 : 0.8);
  drawBowl(context, 1, 1, (size - poop) / 2, size / 2 - poop * 0.535, poop);
  return blobOf(context);
}
