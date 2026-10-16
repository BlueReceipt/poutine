/**
 * A browser can keep a broken copy of the stylesheet. On 2026-10-16 Alex's Chrome kept one with no
 * type from the minute of a deploy and refused it on every load: unstyled, the map grew without end
 * and pushed every control off the screen. When the page's styles didn't apply, the stylesheet is
 * fetched afresh once (which replaces the kept copy) and the page reloads.
 */
const TRIED = 'poutine.restyled';

/** styles.css sets --ink on the root: missing, the stylesheet didn't apply. */
function stylesApplied(): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() !== '';
}

async function repair(): Promise<void> {
  if (stylesApplied()) {
    try {
      sessionStorage.removeItem(TRIED);
    } catch {
      // Nothing to forget.
    }
    return;
  }
  try {
    // One try per visit: a stylesheet still broken after it isn't asked for again and again.
    if (sessionStorage.getItem(TRIED)) return;
    sessionStorage.setItem(TRIED, '1');
  } catch {
    return;
  }
  const sheets = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  await Promise.all(
    sheets.map((sheet) => fetch(sheet.href, { cache: 'reload' }).catch(() => undefined)),
  );
  window.location.reload();
}

/** Checks once every stylesheet has loaded or failed. */
export function repairStylesWhenLoaded(): void {
  if (document.readyState === 'complete') void repair();
  else
    window.addEventListener('load', () => {
      void repair();
    });
}
