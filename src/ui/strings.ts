import type { HoursWords } from '../domain/hours.ts';

/** French puts a no-break space before a colon. Built here: never typed as an escape. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Every word on screen, in English and French (same shape). The app's name follows the language
 * (Alex, 2026-10-15): Pootsin in English, Poutine in French, "to get them to stop saying pooteeen".
 */
export interface Strings {
  appName: string;
  /** The map's label for how many places it shows. */
  placeCount: (count: number) => string;
  loading: string;
  mapFailed: string;
  /** Where the places come from, beside the map's own credit. */
  placesCredit: string;
  card: {
    close: string;
    unconfirmed: string;
    near: (town: string) => string;
    hours: string;
    call: string;
    directions: string;
    website: string;
    facebook: string;
    instagram: string;
    menu: string;
    googleMaps: string;
    /** The chooser at a pin shared by places at one address. */
    sharedPin: (count: number) => string;
  };
  search: {
    label: string;
    placeholder: (count: number) => string;
    clear: string;
    none: (query: string) => string;
    /** How many places the search found, for screen readers. */
    found: (count: number) => string;
  };
  nearMe: {
    button: string;
    title: string;
    locating: string;
    denied: string;
    unavailable: string;
    distance: (meters: number) => string;
  };
  hours: HoursWords;
}

export type Language = 'en' | 'fr';

const pad = (minutes: number): string => String(minutes).padStart(2, '0');

/** Metres to the nearest 10 under a kilometre (995 m is "1 km"), then km, one decimal under 10. */
const distanceIn =
  (locale: string, space: string) =>
  (meters: number): string => {
    const tens = Math.round(meters / 10) * 10;
    if (tens < 1000) return `${String(tens)}${space}m`;
    const decimals = meters < 9950 ? 1 : 0;
    return `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: decimals })}${space}km`;
  };

const english: Strings = {
  appName: 'Pootsin',
  placeCount: (count) => `${count.toLocaleString('en-CA')} poutine places`,
  loading: 'Loading the map…',
  mapFailed: 'The map didn’t load. Check your connection and reload the page.',
  placesCredit: 'Places: © OpenStreetMap contributors, Adresses Québec',
  card: {
    close: 'Close',
    unconfirmed: 'Poutine not confirmed yet',
    near: (town) => `near ${town}`,
    hours: 'Hours',
    call: 'Call',
    directions: 'Directions',
    website: 'Website',
    facebook: 'Facebook',
    instagram: 'Instagram',
    menu: 'Menu',
    googleMaps: 'See on Google Maps',
    sharedPin: (count) => `${String(count)} places at this address`,
  },
  search: {
    label: 'Search by name or town',
    placeholder: (count) => `Search ${count.toLocaleString('en-CA')} places`,
    clear: 'Clear the search',
    none: (query) => `Nothing matches “${query}”. Try a town or part of a name.`,
    found: (count) => (count === 1 ? '1 place found' : `${String(count)} places found`),
  },
  nearMe: {
    button: 'Near me',
    title: 'Closest to you',
    locating: 'Finding where you are…',
    denied:
      'Location is off for this site. Allow it in your browser’s site settings to see the places near you.',
    unavailable: 'Your location isn’t available right now. Try again outside or in a moment.',
    distance: distanceIn('en-CA', ' '),
  },
  hours: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    everyDay: 'Every day',
    holidays: 'holidays',
    closed: 'closed',
    open: 'open',
    always: 'Open 24/7',
    time: (hours, minutes) => `${pad(hours)}:${pad(minutes)}`,
    date: (month, day) => `${month} ${String(day)}`,
    colon: ': ',
  },
};

const french: Strings = {
  appName: 'Poutine',
  placeCount: (count) => `${count.toLocaleString('fr-CA')} places à poutine`,
  loading: 'Chargement de la carte…',
  mapFailed: 'La carte n’a pas chargé. Vérifiez votre connexion et rechargez la page.',
  placesCredit: `Lieux${NBSP}: © les contributeurs d’OpenStreetMap, Adresses Québec`,
  card: {
    close: 'Fermer',
    unconfirmed: 'Poutine pas encore confirmée',
    near: (town) => `près de ${town}`,
    hours: 'Heures d’ouverture',
    call: 'Appeler',
    directions: 'Itinéraire',
    website: 'Site web',
    facebook: 'Facebook',
    instagram: 'Instagram',
    menu: 'Menu',
    googleMaps: 'Voir sur Google Maps',
    sharedPin: (count) => `${String(count)} lieux à cette adresse`,
  },
  search: {
    label: 'Chercher par nom ou par ville',
    placeholder: (count) => `Chercher parmi ${count.toLocaleString('fr-CA')} places`,
    clear: 'Effacer la recherche',
    none: (query) =>
      `Rien ne correspond à «${NBSP}${query}${NBSP}». Essayez une ville ou une partie du nom.`,
    found: (count) => (count === 1 ? '1 place trouvée' : `${String(count)} places trouvées`),
  },
  nearMe: {
    button: 'Près de moi',
    title: 'Les plus proches',
    locating: 'Recherche de votre position…',
    denied:
      'La localisation est désactivée pour ce site. Autorisez-la dans les paramètres du navigateur pour voir les places près de vous.',
    unavailable:
      'Votre position n’est pas disponible pour le moment. Réessayez dehors ou dans un instant.',
    distance: distanceIn('fr-CA', NBSP),
  },
  hours: {
    days: ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'],
    months: [
      'janv.',
      'févr.',
      'mars',
      'avr.',
      'mai',
      'juin',
      'juil.',
      'août',
      'sept.',
      'oct.',
      'nov.',
      'déc.',
    ],
    everyDay: 'Tous les jours',
    holidays: 'jours fériés',
    closed: 'fermé',
    open: 'ouvert',
    always: 'Ouvert 24 h sur 24',
    time: (hours, minutes) =>
      minutes === 0 ? `${String(hours)}${NBSP}h` : `${String(hours)}${NBSP}h${NBSP}${pad(minutes)}`,
    date: (month, day) => `${day === 1 ? '1er' : String(day)} ${month}`,
    colon: `${NBSP}: `,
  },
};

/** French when the phone's first language is French, English otherwise. */
export function phoneLanguage(languages: readonly string[]): Language {
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function stringsFor(language: Language): Strings {
  return language === 'fr' ? french : english;
}
