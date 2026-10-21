import { useEffect, useRef } from 'preact/hooks';
import type { Language, Strings } from './strings.ts';

interface Props {
  strings: Strings;
  /** The language chosen here before; null when the app follows the phone. */
  chosen: Language | null;
  onLanguage: (language: Language | null) => void;
  onClose: () => void;
}

/** Where the poutines that aren't go (Alex, 2026-10-20: "IF you dare, share it to r/PoutineCrimes"). */
const POUTINE_CRIMES = 'https://www.reddit.com/r/PoutineCrimes/';
/**
 * Loaded fries sold as poutine: the picture of a menu Alex sent (2026-10-20: "add a hyperlink to the
 * frittenwerk picture i gave you, for not poutine"; "just put a link to the static picture"), its
 * source written on the picture itself; in French the link is on "ou quelque chose d'autre", with no
 * example ("french doesn't need it. only the english side").
 */
const SOLD_AS_POUTINE = '/examples/not-poutine.webp';
/** Alex's rating scale, the five bowls in both languages (2026-10-20). */
const RATING_SCALE = '/examples/rating-scale.webp';

/**
 * The secret menu (Alex, 2026-10-20: "a cheeky settings tab hidden when someone taps the poutine
 * pronounced pootsin area. Where people can select french or english, and eventually we can add
 * other things"): opened by the app's name in the search bar. The language: the phone's, French or
 * English, kept on this phone, every word in the menu's own language ("French secret menu
 * shouldn't have English on its tab"). Then what counts as poutine (fries, sauce brune, curds,
 * nothing less), Alex's rating scale with "Pootsin, not poo-teen" back in English, then poutine's
 * history, two articles ("put what counts as poutine, over the history section").
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
      <h3>{words.counts.title}</h3>
      <ul class="counts">
        {words.counts.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        {words.counts.not}
        {words.counts.notLinked && (
          <>
            <a href={SOLD_AS_POUTINE} target="_blank" rel="noopener noreferrer">
              {words.counts.notLinked}
            </a>
            .
          </>
        )}
      </p>
      {words.counts.example && (
        <p>
          {words.counts.example}{' '}
          <a href={SOLD_AS_POUTINE} target="_blank" rel="noopener noreferrer">
            {words.counts.oneSold}
          </a>{' '}
          {words.counts.afterSold}
        </p>
      )}
      <p>
        {words.counts.dare}{' '}
        <a href={POUTINE_CRIMES} target="_blank" rel="noopener noreferrer">
          r/PoutineCrimes
        </a>
        .
      </p>
      <h3>{words.scale.title}</h3>
      {words.scale.line && <p>{words.scale.line}</p>}
      <a class="scale" href={RATING_SCALE} target="_blank" rel="noopener noreferrer">
        <img src={RATING_SCALE} alt={words.scale.alt} width="1024" height="572" loading="lazy" />
      </a>
      <h3>{words.history}</h3>
      <ul class="articles">
        {words.articles.map((article) => (
          <li key={article.url}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.title}
            </a>
            <span class="where">{article.source}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
