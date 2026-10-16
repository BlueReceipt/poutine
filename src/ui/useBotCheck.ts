import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadTurnstile, siteKey } from './turnstile.ts';

export interface BotCheck {
  /** The check's token, waiting up to 15 s for Cloudflare's answer; null if none came. */
  token: () => Promise<string | null>;
  /** A token is spent once sent: a new check for the next try. */
  renew: () => void;
  /** Cloudflare's script didn't load (blocked, offline). */
  failed: boolean;
}

/**
 * Cloudflare Turnstile in the given box while `active`: mostly invisible, shown only when
 * Cloudflare isn't sure. Sending waits for its token rather than failing (Add a place, ratings).
 */
export function useBotCheck(box: RefObject<HTMLElement>, active: boolean): BotCheck {
  const widget = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  const waiting = useRef<((value: string) => void)[]>([]);
  const [failed, setFailed] = useState(false);

  const got = (value: string | null) => {
    current.current = value;
    if (value) for (const resolve of waiting.current.splice(0)) resolve(value);
  };

  useEffect(() => {
    if (!active || !box.current) return;
    let gone = false;
    const container = box.current;
    setFailed(false);
    loadTurnstile()
      .then((turnstile) => {
        if (gone) return;
        widget.current = turnstile.render(container, {
          sitekey: siteKey(window.location.hostname),
          callback: got,
          'expired-callback': () => {
            got(null);
          },
          'error-callback': () => {
            got(null);
          },
          language: document.documentElement.lang,
          appearance: 'interaction-only',
        });
      })
      .catch(() => {
        setFailed(true);
      });
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      got(null);
    };
  }, [active, box]);

  return {
    token: () =>
      current.current
        ? Promise.resolve(current.current)
        : new Promise((resolve) => {
            waiting.current.push(resolve);
            setTimeout(() => {
              resolve(current.current);
            }, 15_000);
          }),
    renew: () => {
      got(null);
      if (widget.current) window.turnstile?.reset(widget.current);
    },
    failed,
  };
}
