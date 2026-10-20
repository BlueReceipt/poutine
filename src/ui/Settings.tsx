import { useEffect, useRef } from 'preact/hooks';
import type { Language, Strings } from './strings.ts';

interface Props {
  strings: Strings;
  /** The language chosen here before; null when the app follows the phone. */
  chosen: Language | null;
  onLanguage: (language: Language | null) => void;
  onClose: () => void;
}

/**
 * The secret menu (Alex, 2026-10-20: "a cheeky settings tab hidden when someone taps the poutine
 * pronounced pootsin area. Where people can select french or english, and eventually we can add
 * other things"): opened by the app's name in the search bar. The language: the phone's, French or
 * English, kept on this phone.
 */
export function Settings({ strings, chosen, onLanguage, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const words = strings.settings;

  useEffect(() => {
    heading.current?.focus();
  }, []);
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
    <section class="card settings" role="dialog" aria-labelledby="settings-title">
      <button type="button" class="close" aria-label={strings.card.close} onClick={onClose}>
        ×
      </button>
      <h2 id="settings-title" ref={heading} tabIndex={-1}>
        {words.title}
      </h2>
      <p class="hint">{words.found}</p>
      <h3 id="settings-language">{words.language}</h3>
      <div class="choice-row" role="radiogroup" aria-labelledby="settings-language">
        {([null, 'fr', 'en'] as const).map((language) => (
          <button
            key={language ?? 'phone'}
            type="button"
            role="radio"
            class="choice"
            aria-checked={chosen === language}
            onClick={() => {
              onLanguage(language);
            }}
          >
            {language ? words.names[language] : words.phone}
          </button>
        ))}
      </div>
    </section>
  );
}
