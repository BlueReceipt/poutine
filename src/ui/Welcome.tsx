import { useEffect } from 'preact/hooks';
import type { Strings } from './strings.ts';

/**
 * A first visit's welcome (Alex, 2026-10-19: "a box that can be shut", shown "only if there is no
 * saved info"): his words in a sheet over the bottom of the map; × or Escape closes it for good.
 */
export function Welcome({ strings, onClose }: { strings: Strings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <aside class="card welcome" aria-label={strings.appName}>
      <button type="button" class="close" aria-label={strings.card.close} onClick={onClose}>
        ×
      </button>
      <p>{strings.welcome}</p>
    </aside>
  );
}
