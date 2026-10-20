import { placeUrl, slugOf } from '../domain/links.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { storyPicture } from './storyPicture.ts';
import type { Strings } from './strings.ts';

/** How a share went: through the share sheet, saved as a download, cancelled, or not at all. */
export interface Shared {
  how: 'shared' | 'saved' | 'cancelled' | 'failed';
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

/**
 * A rating shared: the place's link copied (stories drop the links a page hands them; the visitor
 * pastes it in the Link sticker), then the story picture and the link through the phone's share
 * sheet (Instagram and Facebook offer their stories there). A browser that can't share files saves
 * the picture instead. Called from the tap: the share sheet only opens while the tap still counts.
 */
export async function shareRating(place: Place, stars: number, strings: Strings): Promise<Shared> {
  const url = placeUrl(place);
  const copied = await copy(url);
  let file: File;
  try {
    const picture = await storyPicture(place, stars, strings);
    file = new File([picture], `${slugOf(place.name) || 'poutine'}.png`, { type: 'image/png' });
  } catch {
    return { how: 'failed', copied, url };
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: strings.share.text(place.name, stars), url });
      return { how: 'shared', copied, url };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return { how: 'cancelled', copied, url };
      // The tap no longer counted, or the app refused it: the picture is saved instead.
    }
  }
  save(file);
  return { how: 'saved', copied, url };
}
