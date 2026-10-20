import type { HoursWords } from '../domain/hours.ts';
import type { PlacedBy, Problem } from '../domain/submission.ts';

/** French puts a no-break space before a colon. Built here: never typed as an escape. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Every word on screen, in English and French (same shape). The app's name follows the language
 * (Alex, 2026-10-15): Pootsin in English, Poutine in French, "to get them to stop saying pooteeen".
 */
export interface Strings {
  appName: string;
  /** What the site is: in link previews and on the story picture. */
  tagline: string;
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
    /** Under the results: Add a place, named as searched. */
    addMissing: (query: string) => string;
  };
  nearMe: {
    button: string;
    title: string;
    locating: string;
    denied: string;
    unavailable: string;
    distance: (meters: number) => string;
  };
  add: AddWords;
  ratings: RatingWords;
  share: ShareWords;
  hours: HoursWords;
}

/** Sharing a rating: a story picture with the place's link, through the phone's share sheet. */
export interface ShareWords {
  button: string;
  making: string;
  /** Under the button: why the link is copied. */
  hint: string;
  /** On the picture, over the stars. */
  gave: string;
  /** Sent with the picture to apps that take words (WhatsApp, Messenger, texts). */
  text: (name: string, stars: number) => string;
  saved: string;
  linkCopied: string;
  /** The link couldn't be copied: it follows, to copy by hand. */
  copyThis: string;
  failed: string;
}

/** What Add a place says when sending fails, by the Worker's code or the form's own check. */
export type AddProblem =
  Problem | 'bot-check' | 'too-many' | 'queue-full' | 'offline' | 'unexpected';

/** What a rating's send can come back with, by the Worker's code or the card's own check. */
export type RatingTrouble =
  | 'stars'
  | 'comment-too-long'
  | 'reviews-off'
  | 'not-a-rating'
  | 'bot-check'
  | 'too-many'
  | 'already-rated'
  | 'offline'
  | 'unexpected';

export interface RatingWords {
  none: string;
  summary: (average: number, count: number) => string;
  yours: string;
  star: (stars: number) => string;
  send: string;
  sending: string;
  thanks: string;
  comment: string;
  reviews: string;
  report: string;
  problems: Record<RatingTrouble, string>;
}

export interface AddWords {
  title: string;
  name: string;
  street: string;
  streetHint: string;
  town: string;
  province: string;
  /** Canada's provinces and territories, Québec first. */
  provinces: readonly (readonly [string, string])[];
  find: string;
  here: string;
  finding: string;
  locating: string;
  notFound: string;
  lookupFailed: string;
  byHand: string;
  pinTitle: string;
  pinAt: Record<PlacedBy, string>;
  pinOk: string;
  back: string;
  detailsTitle: string;
  phone: string;
  website: string;
  optional: string;
  servesPoutine: string;
  maybeKnown: string;
  maybeKnownHint: string;
  open: string;
  send: string;
  sending: string;
  privacy: string;
  license: string;
  sentTitle: string;
  sent: (name: string) => string;
  close: string;
  problems: Record<AddProblem, string>;
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
  tagline: 'Québec’s casse-croûtes and potato shacks on a map',
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
    addMissing: (query) => `Can’t find it? Add “${query}”`,
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
  ratings: {
    none: 'No ratings yet',
    summary: (average, count) =>
      `${average.toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} out of 5 · ${count === 1 ? '1 rating' : `${String(count)} ratings`}`,
    yours: 'Your rating',
    star: (stars) => (stars === 1 ? '1 star' : `${String(stars)} stars`),
    send: 'Send my rating',
    sending: 'Sending…',
    thanks: 'Thanks! Your rating counts, and this place is now green on your map.',
    comment: 'A few words',
    reviews: 'What people say',
    report: 'Report',
    problems: {
      stars: 'Choose from 1 to 5 stars.',
      'comment-too-long': 'That’s a bit long: 500 characters at most.',
      'reviews-off': 'Written reviews aren’t open yet: the stars alone are sent.',
      'not-a-rating': 'Something’s off with the rating. Reload the page and try again.',
      'bot-check': 'The bot check didn’t pass. Try again.',
      'too-many': 'That’s a lot of ratings for one hour! Try again a bit later.',
      'already-rated': 'Someone on your connection already rated this place today.',
      offline: 'It couldn’t be sent. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
    },
  },
  share: {
    button: 'Share my rating',
    making: 'Making the picture…',
    hint: 'Sharing also copies the link, for a story’s Link sticker.',
    gave: 'I gave',
    text: (name, stars) =>
      `I gave ${name} ${stars === 1 ? '1 star' : `${String(stars)} stars`} on Pootsin.`,
    saved: 'The picture is in your downloads.',
    linkCopied: 'The link is copied.',
    copyThis: 'In a story, add this link with the Link sticker:',
    failed: 'This browser can’t share the picture.',
  },
  add: {
    title: 'Add a place',
    name: 'Name',
    street: 'Civic number and street',
    streetHint: 'Like 4755 Ste-Catherine',
    town: 'Town',
    province: 'Province',
    provinces: [
      ['QC', 'Québec'],
      ['ON', 'Ontario'],
      ['NB', 'New Brunswick'],
      ['NS', 'Nova Scotia'],
      ['PE', 'Prince Edward Island'],
      ['NL', 'Newfoundland and Labrador'],
      ['MB', 'Manitoba'],
      ['SK', 'Saskatchewan'],
      ['AB', 'Alberta'],
      ['BC', 'British Columbia'],
      ['YT', 'Yukon'],
      ['NT', 'Northwest Territories'],
      ['NU', 'Nunavut'],
    ],
    find: 'Find it on the map',
    here: 'I’m here',
    finding: 'Looking for the address…',
    locating: 'Finding where you are…',
    notFound:
      'That address wasn’t found. Use I’m here if you’re at the place, or put the pin yourself.',
    lookupFailed: 'The address lookup didn’t answer. Try again, or put the pin yourself.',
    byHand: 'Put the pin myself',
    pinTitle: 'Put the pin on the place',
    pinAt: {
      address: 'The pin is at the address. If it’s off, move the map under it.',
      street: 'The street was found, not the number. Move the map to put the pin on the place.',
      me: 'The pin is where you are. If the place is elsewhere, move the map under it.',
      hand: 'Move the map to put the pin on the place.',
    },
    pinOk: 'This is the spot',
    back: 'Back',
    detailsTitle: 'A few more details',
    phone: 'Phone',
    website: 'Website or Facebook',
    optional: 'optional',
    servesPoutine: 'They serve poutine',
    maybeKnown: 'Is it one of these?',
    maybeKnownHint: 'If it isn’t, send it anyway.',
    open: 'Open',
    send: 'Send',
    sending: 'Sending…',
    privacy:
      'No account, no name. To stop spam, a scrambled form of your connection’s address is kept for 30 days.',
    license: 'Places you add join the open list of places (ODbL), like the rest.',
    sentTitle: 'Thanks!',
    sent: (name) => `${name} will show on the map once it’s been checked.`,
    close: 'Close',
    problems: {
      name: 'Give the place’s name.',
      town: 'Give the town.',
      position: 'Put the pin on the place, in Québec or close by.',
      phone: 'A phone number has 10 digits. Check it, or leave it empty.',
      website: 'That doesn’t look like a web address. Check it, or leave it empty.',
      poutine: 'Tick the box if they serve poutine: this map is only for places that do.',
      'too-long': 'One of the fields is too long (120 characters at most).',
      'not-a-place': 'Something’s off with the form. Reload the page and try again.',
      'bot-check': 'The bot check didn’t pass. Try again.',
      'too-many': 'That’s a lot of places for one hour! Try again a bit later.',
      'queue-full': 'Lots of places are waiting to be checked. Try again in a few days.',
      offline: 'It couldn’t be sent. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
    },
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
  tagline: 'Les casse-croûtes et cantines du Québec sur une carte',
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
    addMissing: (query) => `Pas dans la liste${NBSP}? Ajouter «${NBSP}${query}${NBSP}»`,
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
  ratings: {
    none: 'Pas encore de note',
    summary: (average, count) =>
      `${average.toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sur 5 · ${count === 1 ? '1 note' : `${String(count)} notes`}`,
    yours: 'Votre note',
    star: (stars) => (stars === 1 ? '1 étoile' : `${String(stars)} étoiles`),
    send: 'Envoyer ma note',
    sending: 'Envoi…',
    thanks: `Merci${NBSP}! Votre note compte, et cette place est maintenant verte sur votre carte.`,
    comment: 'Quelques mots',
    reviews: 'Ce qu’on en dit',
    report: 'Signaler',
    problems: {
      stars: 'Choisissez de 1 à 5 étoiles.',
      'comment-too-long': `C’est un peu long${NBSP}: 500 caractères au plus.`,
      'reviews-off': `Les commentaires ne sont pas encore ouverts${NBSP}: seules les étoiles sont envoyées.`,
      'not-a-rating': 'Quelque chose cloche dans la note. Rechargez la page et réessayez.',
      'bot-check': 'La vérification anti-robot a échoué. Réessayez.',
      'too-many': `Ça fait beaucoup de notes en une heure${NBSP}! Réessayez un peu plus tard.`,
      'already-rated': 'Quelqu’un sur votre connexion a déjà noté cette place aujourd’hui.',
      offline: 'L’envoi n’a pas fonctionné. Vérifiez votre connexion et réessayez.',
      unexpected: 'Un problème de notre côté. Réessayez dans un moment.',
    },
  },
  share: {
    button: 'Partager ma note',
    making: 'Création de l’image…',
    hint: 'Partager copie aussi le lien, pour l’autocollant Lien d’une story.',
    gave: 'J’ai donné',
    text: (name, stars) =>
      `J’ai donné ${stars === 1 ? '1 étoile' : `${String(stars)} étoiles`} à ${name} sur Poutine.`,
    saved: 'L’image est dans vos téléchargements.',
    linkCopied: 'Le lien est copié.',
    copyThis: `Dans une story, ajoutez ce lien avec l’autocollant Lien${NBSP}:`,
    failed: 'Ce navigateur ne peut pas partager l’image.',
  },
  add: {
    title: 'Ajouter une place',
    name: 'Nom',
    street: 'Numéro civique et rue',
    streetHint: 'Par exemple 4755 Ste-Catherine',
    town: 'Ville',
    province: 'Province',
    provinces: [
      ['QC', 'Québec'],
      ['ON', 'Ontario'],
      ['NB', 'Nouveau-Brunswick'],
      ['NS', 'Nouvelle-Écosse'],
      ['PE', 'Île-du-Prince-Édouard'],
      ['NL', 'Terre-Neuve-et-Labrador'],
      ['MB', 'Manitoba'],
      ['SK', 'Saskatchewan'],
      ['AB', 'Alberta'],
      ['BC', 'Colombie-Britannique'],
      ['YT', 'Yukon'],
      ['NT', 'Territoires du Nord-Ouest'],
      ['NU', 'Nunavut'],
    ],
    find: 'Trouver sur la carte',
    here: 'Je suis ici',
    finding: 'Recherche de l’adresse…',
    locating: 'Recherche de votre position…',
    notFound:
      'Adresse introuvable. Choisissez Je suis ici si vous êtes sur place, ou placez l’épingle vous-même.',
    lookupFailed:
      'La recherche d’adresse n’a pas répondu. Réessayez, ou placez l’épingle vous-même.',
    byHand: 'Placer l’épingle moi-même',
    pinTitle: 'Placez l’épingle sur la place',
    pinAt: {
      address: 'L’épingle est à l’adresse. Si elle est à côté, déplacez la carte dessous.',
      street:
        'La rue a été trouvée, pas le numéro. Déplacez la carte pour mettre l’épingle sur la place.',
      me: 'L’épingle est là où vous êtes. Si la place est ailleurs, déplacez la carte dessous.',
      hand: 'Déplacez la carte pour mettre l’épingle sur la place.',
    },
    pinOk: 'C’est ici',
    back: 'Retour',
    detailsTitle: 'Quelques détails de plus',
    phone: 'Téléphone',
    website: 'Site web ou Facebook',
    optional: 'facultatif',
    servesPoutine: 'On y sert de la poutine',
    maybeKnown: `Est-ce l’une de celles-ci${NBSP}?`,
    maybeKnownHint: 'Si ce n’en est pas une, envoyez-la quand même.',
    open: 'Ouvrir',
    send: 'Envoyer',
    sending: 'Envoi…',
    privacy:
      'Ni compte ni nom. Pour bloquer le pourriel, une forme brouillée de l’adresse de votre connexion est gardée 30 jours.',
    license: 'Les places ajoutées rejoignent la liste ouverte des places (ODbL), comme les autres.',
    sentTitle: `Merci${NBSP}!`,
    sent: (name) => `${name} apparaîtra sur la carte une fois vérifiée.`,
    close: 'Fermer',
    problems: {
      name: 'Donnez le nom de la place.',
      town: 'Donnez la ville.',
      position: 'Placez l’épingle sur la place, au Québec ou tout près.',
      phone: 'Un numéro de téléphone a 10 chiffres. Vérifiez-le, ou laissez-le vide.',
      website: 'Cela ne ressemble pas à une adresse web. Vérifiez-la, ou laissez-la vide.',
      poutine: `Cochez la case si on y sert de la poutine${NBSP}: la carte ne montre que ces places.`,
      'too-long': 'Un des champs est trop long (120 caractères au plus).',
      'not-a-place': 'Quelque chose cloche dans le formulaire. Rechargez la page et réessayez.',
      'bot-check': 'La vérification anti-robot a échoué. Réessayez.',
      'too-many': `Ça fait beaucoup de places en une heure${NBSP}! Réessayez un peu plus tard.`,
      'queue-full': 'Beaucoup de places attendent d’être vérifiées. Réessayez dans quelques jours.',
      offline: 'L’envoi n’a pas fonctionné. Vérifiez votre connexion et réessayez.',
      unexpected: 'Un problème de notre côté. Réessayez dans un moment.',
    },
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
