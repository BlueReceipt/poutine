import type { CountKind } from '../domain/counts.ts';
import { placeUrl, slugOf } from '../domain/links.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { myFriendStars } from './rater.ts';
import { storyPicture } from './storyPicture.ts';
import type { Strings } from './strings.ts';

/**
 * How a share went: through the share sheet, the picture saved as a download, the link copied
 * (no share sheet), cancelled, or not at all.
 */
export interface Shared {
  how: 'shared' | 'saved' | 'copied' | 'cancelled' | 'failed';
  /** The place's link went to the clipboard, for a story's Link sticker. */
  copied: boolean;
  url: string;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function save(file: File): void {
  const href = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = href;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 10_000);
}

/** A Share tap, counted for the day (only the number: nothing about who). */
function counted(kind: CountKind): void {
  fetch('/api/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
    keepalive: true,
  }).catch(() => undefined);
}

const cancelled = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * A place's link through the share sheet, from any card (for "let's eat here" in a group chat),
 * with the visitor's stars when they rated it. Without a share sheet, the link is copied.
 */
export async function sharePlace(place: Place, strings: Strings): Promise<Shared> {
  counted('share-place');
  const friend = myFriendStars(place.osm);
  const url = placeUrl(place, friend);
  const text = friend
    ? strings.share.text(place.name, friend.stars)
    : strings.share.placeText(place.name);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url });
      return { how: 'shared', copied: false, url };
    } catch (error) {
      if (cancelled(error)) return { how: 'cancelled', copied: false, url };
    }
  }
  const copied = await copy(url);
  return { how: copied ? 'copied' : 'failed', copied, url };
}

/** The story picture as a file to share: a PNG, or a JPEG with the visitor's photo in it. */
export async function storyFile(
  place: Place,
  stars: number,
  strings: Strings,
  photo?: ImageBitmap,
): Promise<File> {
  const picture = await storyPicture(place, stars, strings, photo);
  const name = `${slugOf(place.name) || 'poutine'}.${picture.type === 'image/jpeg' ? 'jpg' : 'png'}`;
  return new File([picture], name, { type: picture.type });
}

/**
 * A rating shared: the place's link with the stars copied (stories drop the links a page hands
 * them; the visitor pastes it in the Link sticker), then the story picture and the link through
 * the phone's share sheet (Instagram and Facebook offer their stories there). A browser that can't
 * share files saves the picture instead. Called from the tap: the share sheet only opens while the
 * tap still counts, so a picture with a photo is made beforehand.
 */
export async function shareStory(
  file: File | Promise<File>,
  place: Place,
  stars: number,
  strings: Strings,
  kind: 'share-story' | 'share-photo' = 'share-story',
): Promise<Shared> {
  counted(kind);
  const url = placeUrl(place, myFriendStars(place.osm));
  const copied = await copy(url);
  let ready: File;
  try {
    ready = await file;
  } catch {
    return { how: 'failed', copied, url };
  }
  if (navigator.canShare?.({ files: [ready] })) {
    try {
      const text =
        stars > 0 ? strings.share.text(place.name, stars) : strings.share.placeText(place.name);
      await navigator.share({ files: [ready], text, url });
      return { how: 'shared', copied, url };
    } catch (error) {
      if (cancelled(error)) return { how: 'cancelled', copied, url };
      // The tap no longer counted, or the app refused it: the picture is saved instead.
    }
  }
  save(ready);
  return { how: 'saved', copied, url };
}

/** The visitor's photo, upright and no wider than the picture needs; null if it can't be read. */
export async function photoOf(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: 1200,
      resizeQuality: 'high',
    });
  } catch {
    return null;
  }
}
