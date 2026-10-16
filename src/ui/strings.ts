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
  hours: HoursWords;
}

export type Language = 'en' | 'fr';

const pad = (minutes: number): string => String(minutes).padStart(2, '0');

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
