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
}

export type Language = 'en' | 'fr';

const english: Strings = {
  appName: 'Pootsin',
  placeCount: (count) => `${count.toLocaleString('en-CA')} poutine places`,
  loading: 'Loading the map…',
  mapFailed: 'The map didn’t load. Check your connection and reload the page.',
  placesCredit: 'Places: © OpenStreetMap contributors, Adresses Québec',
};

const french: Strings = {
  appName: 'Poutine',
  placeCount: (count) => `${count.toLocaleString('fr-CA')} places à poutine`,
  loading: 'Chargement de la carte…',
  mapFailed: 'La carte n’a pas chargé. Vérifiez votre connexion et rechargez la page.',
  placesCredit: 'Lieux : © les contributeurs d’OpenStreetMap, Adresses Québec',
};

/** French when the phone's first language is French, English otherwise. */
export function phoneLanguage(languages: readonly string[]): Language {
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function stringsFor(language: Language): Strings {
  return language === 'fr' ? french : english;
}
