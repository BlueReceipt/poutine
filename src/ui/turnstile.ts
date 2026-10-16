/**
 * Cloudflare Turnstile, the bot check of Add a place: loaded from Cloudflare only when the form
 * reaches it, shown only when Cloudflare isn't sure (most people never see it). Its token goes
 * with the place; the Worker asks Cloudflare whether it passed.
 */

/** Cloudflare's test key: always passes, for local runs and tests. */
const TEST_SITE_KEY = '1x00000000000000000000AA';

/** The real key per address (public by design: it's in every page that shows the check). */
const SITE_KEYS: Record<string, string> = {};

export function siteKey(hostname: string): string {
  return SITE_KEYS[hostname] ?? TEST_SITE_KEY;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      language: string;
      appearance: 'always' | 'execute' | 'interaction-only';
    },
  ) => string;
  remove: (widget: string) => void;
  reset: (widget: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without its API'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile didn’t load'));
    };
    document.head.append(script);
  });
  return loading;
}
