import { useEffect } from 'preact/hooks';
import { FindVisits } from './KeepVisits.tsx';
import type { Strings } from './strings.ts';

/**
 * A first visit's welcome (Alex, 2026-10-19: "a box that can be shut", shown "only if there is no
 * saved info"): his words in a sheet over the bottom of the map; × or Escape closes it for good. In
 * English a title and a strapline come first (2026-10-20: "Poutines.app / Poutine not poo-teen").
 * It shows only when nothing is saved, as after clearing the history: "Retrouver mes visites"
 * brings back visits kept in a passkey (2026-10-21).
 */
export function Welcome({
  strings,
  onClose,
  onFound,
}: {
  strings: Strings;
  onClose: () => void;
  onFound: (key: string) => void;
}) {
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
      {strings.welcome.title && <h2>{strings.welcome.title}</h2>}
      {strings.welcome.strap && <p class="strap">{strings.welcome.strap}</p>}
      <p>{strings.welcome.text}</p>
      <FindVisits strings={strings} label={strings.keep.find} onFound={onFound} />
    </aside>
  );
}
