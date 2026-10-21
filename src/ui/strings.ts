import type { ChangedField, ChangeProblem } from '../domain/changes.ts';
import type { HoursWords } from '../domain/hours.ts';
import type { PlaceKind } from '../domain/links.ts';
import type { PlacedBy, Problem } from '../domain/submission.ts';

/** French puts a no-break space before a colon. Built here: never typed as an escape. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Every word on screen, in English and French (same shape). The name is always Poutine (Alex,
 * 2026-10-20, replacing Pootsin in English): in English the search bar adds "pronounced Pootsin",
 * "to get them to stop saying pooteeen".
 */
export interface Strings {
  language: Language;
  appName: string;
  /** Beside the name in the search bar: how to say it (English only). */
  pronounced: string;
  /** What the site is: in link previews and on the story picture. */
  tagline: string;
  /** Under "Poutines.app" on the link preview picture; the app's name where empty (French). */
  previewStrap: string;
  /** Under the poop on the link preview picture (English only: public/share-en.png). */
  previewCaption: string;
  /**
   * The closable box of a first visit (Alex's words, 2026-10-19; English, 2026-10-20): a title and a
   * strapline (English only), then the words.
   */
  welcome: { title: string; strap: string; text: string };
  /** Link previews: what a place is, from its name, and where. */
  preview: {
    kinds: Readonly<Record<PlaceKind, string>>;
    placedIn: (what: string, town: string) => string;
    placedNear: (what: string, town: string) => string;
  };
  /** The map's label for how many places it shows. */
  placeCount: (count: number) => string;
  loading: string;
  mapFailed: string;
  /** Where the places come from, beside the map's own credit. */
  placesCredit: string;
  card: {
    close: string;
    unconfirmed: string;
    /** A vegan poutine on the menu: a line on the card, by a leaf. */
    vegan: string;
    /** A vegan place whose poutine nothing confirms yet. */
    veganPlace: string;
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
    placeholder: string;
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
    /** The sheet's title once places were found: the ring they are in. */
    within: (km: number) => string;
    /** Nothing within the last ring; the closest place follows. */
    none: (km: number) => string;
    closest: string;
    locating: string;
    denied: string;
    unavailable: string;
    distance: (meters: number) => string;
  };
  add: AddWords;
  edit: EditWords;
  admin: AdminWords;
  ratings: RatingWords;
  share: ShareWords;
  /** The places eaten: the pill by Near me and its sheet. */
  tally: {
    label: (count: number) => string;
    title: (count: number) => string;
    motto: string;
  };
  /** The secret menu, behind the app's name in the search bar. */
  settings: {
    /** The name's button, for screen readers. */
    open: string;
    title: string;
    found: string;
    language: string;
    /** Follow the phone's language (Alex, 2026-10-20: "automatic (automatique in french)"). */
    phone: string;
    /** Each language, named in the menu's own language. */
    names: Readonly<Record<Language, string>>;
    /** Poutine's history: articles to read (Alex, 2026-10-20). */
    history: string;
    articles: readonly { title: string; source: string; url: string }[];
    /** What counts as poutine: the three, then what anything less is. */
    counts: {
      title: string;
      items: readonly string[];
      not: string;
      /** French: the end of `not`, linked to the menu of loaded fries sold as poutine; English: none. */
      notLinked: string;
      /**
       * English only (French needn't: Alex, 2026-10-20): what loaded fries look like, the words before
       * the link to a menu of them sold as poutine, the link's words and what follows them. The
       * picture names its own source.
       */
      example: string;
      oneSold: string;
      afterSold: string;
      /** Before the link to r/PoutineCrimes. */
      dare: string;
    };
    /**
     * Alex's rating scale, a picture (Alex, 2026-10-20: "I like having it in the secret menu. but I
     * thought we could use this to bring back the original pootsin not poo-teen. message"): its
     * heading, the line under it (English only), and the picture's words for screen readers.
     */
    scale: { title: string; line: string; alt: string };
    /**
     * The backup link (Alex, 2026-10-21: "lets do the link in the secret menu"): what it's for, to
     * keep it private, copy it or send it to oneself; before any rating, where it will show.
     */
    backup: {
      title: string;
      /** Where the ratings live, and what clearing does. */
      text: string;
      /** The link, alone or after the passkey ("Or keep this link"). */
      link: string;
      orLink: string;
      keep: string;
      copy: string;
      copied: string;
      send: string;
      empty: string;
    };
  };
  /**
   * Visits kept by a passkey (Alex, 2026-10-21: "gardé mes visites meme si je vide lhistorique"):
   * the offer, its outcome, and finding them again; `name` is the passkey's in the password manager.
   */
  keep: {
    save: string;
    saving: string;
    saved: string;
    kept: string;
    failed: string;
    find: string;
    findMenu: string;
    none: string;
    name: string;
  };
  /** A backup link opened: its ratings coming back to this browser. */
  restore: {
    title: string;
    looking: string;
    none: string;
    /** The link's rated places, and this browser's own: join them? */
    ask: (linked: number, here: number) => string;
    join: string;
    cancel: string;
    done: (count: number) => string;
    failed: string;
  };
  hours: HoursWords;
}

const ratedPlaces = (count: number): string =>
  count === 1 ? '1 rated place' : `${String(count)} rated places`;
const placesNotees = (count: number): string =>
  count === 1 ? '1 place notée' : `${String(count)} places notées`;

/** Sharing a rating: a story picture with the place's link, through the phone's share sheet. */
export interface ShareWords {
  /** On every card: the place's link through the share sheet. */
  place: string;
  /** Sent with a place's link when its sharer hasn't rated it. */
  placeText: (name: string) => string;
  /** The link was copied instead (no share sheet in this browser). */
  copied: string;
  /** On the card a friend's link opened, and in its preview. */
  friend: (stars: number) => string;
  /** Under the stars once rated (Alex, 2026-10-20): the invitation, then the photo button. */
  invite: string;
  addPhoto: string;
  changePhoto: string;
  /** In the share step, for chats: the place's link alone. */
  linkOnly: string;
  /** The photo never leaves the phone: it's only drawn into the picture shared. */
  photoNote: string;
  photoFailed: string;
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
  /** Asked with a rating where nothing confirms poutine yet. */
  summary: (average: number, count: number) => string;
  yours: string;
  star: (stars: number) => string;
  /** Stars as a number, the language's way: 4.5, 4,5. */
  number: (stars: number) => string;
  send: string;
  sending: string;
  /** A double tap on a star took the rating back. */
  cleared: string;
  /** Under the stars once rated: how to take the rating back. */
  clearHint: string;
  /** Once sent: the how-manyth place this phone rated, its bowl on the map now. */
  thanks: (count: number) => string;
  comment: string;
  reviews: string;
  report: string;
  problems: Record<RatingTrouble, string>;
}

/** The approval page (/admin), Alex's alone. */
/**
 * Add more info and Claim this spot (Alex, 2026-10-20): the form over a place's card, opened by a
 * long press on its pin or the card's link.
 */
export interface EditWords {
  /** The card's link to the form. */
  open: string;
  title: string;
  intro: string;
  name: string;
  street: string;
  town: string;
  postcode: string;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  hours: string;
  hoursHint: string;
  vegan: string;
  closed: string;
  claim: string;
  claimHint: string;
  contact: string;
  send: string;
  sending: string;
  back: string;
  sentTitle: string;
  sent: string;
  close: string;
  problems: Record<
    | ChangeProblem
    | 'bot-check'
    | 'too-many'
    | 'queue-full'
    | 'no-such-place'
    | 'offline'
    | 'unexpected',
    string
  >;
  privacy: string;
  license: string;
}

export interface AdminWords {
  title: string;
  loading: string;
  none: string;
  notSignedIn: string;
  failed: string;
  sent: (when: string) => string;
  lookAlikes: (count: number) => string;
  noLookAlike: string;
  pinBy: Record<PlacedBy, string>;
  moveHint: string;
  postcode: string;
  approve: string;
  fix: string;
  saveApprove: string;
  reject: string;
  rejectSure: string;
  back: string;
  approved: (name: string) => string;
  rejected: (name: string) => string;
  notWaiting: string;
  unexpected: string;
  /** The changes and claims waiting (Add more info). */
  changesTitle: string;
  change: string;
  claim: string;
  closedSaid: string;
  before: string;
  after: string;
  fields: Record<ChangedField['field'], string>;
  yes: string;
  no: string;
  ownerContact: string;
  placePhone: string;
  confirmHint: string;
  changeApproved: (name: string) => string;
  changeRejected: (name: string) => string;
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

/** Stars, half ones included: "4.5 stars", "1 star"; "4,5 étoiles", "1,5 étoile" (singular below 2). */
const starNumber =
  (locale: string) =>
  (stars: number): string =>
    stars.toLocaleString(locale, { maximumFractionDigits: 1 });
const englishStars = (stars: number): string =>
  stars === 1 ? '1 star' : `${starNumber('en-CA')(stars)} stars`;
const frenchStars = (stars: number): string =>
  `${starNumber('fr-CA')(stars)} ${stars < 2 ? 'étoile' : 'étoiles'}`;

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
  language: 'en',
  appName: 'Poutine',
  pronounced: 'pronounced Pootsin',
  previewStrap: 'Rate it, and share it.',
  previewCaption: 'Pronounced Poots-in, not poo-teen',
  preview: {
    kinds: {
      'casse-croute': 'Casse-croûte',
      cantine: 'Cantine',
      friterie: 'Friterie',
      'bar-laitier': 'Dairy bar',
      patates: 'Potato shack',
      poutine: 'Poutine',
    },
    placedIn: (what, town) => `${what} in ${town}`,
    placedNear: (what, town) => `${what} near ${town}`,
  },
  tagline:
    'Poots-in, not poo-teen: mapping Canada’s poutine expansion from its humble beginnings in central Québec.',
  welcome: {
    title: 'Poutines.app',
    strap: 'Poots in, not poo-teen',
    text: 'Mapping Canada’s poutine expansion from its humble beginnings in central Québec. This map is for independent spots and small local chains.',
  },
  placeCount: (count) => `${count.toLocaleString('en-CA')} poutine places`,
  loading: 'Loading the map…',
  mapFailed: 'The map didn’t load. Check your connection and reload the page.',
  placesCredit: 'Places: © OpenStreetMap contributors, Adresses Québec',
  card: {
    close: 'Close',
    unconfirmed: 'Poutine not confirmed yet',
    vegan: 'Vegan poutine on the menu',
    veganPlace: 'Everything here is vegan',
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
    placeholder: 'Find your next poutine',
    clear: 'Clear the search',
    none: (query) => `Nothing matches “${query}”. Try a town or part of a name.`,
    found: (count) => (count === 1 ? '1 place found' : `${String(count)} places found`),
    addMissing: (query) => `Can’t find it? Add “${query}”`,
  },
  nearMe: {
    button: 'Nearby',
    title: 'Nearby',
    within: (km) => `Within ${String(km)} km`,
    none: (km) => `Nothing within ${String(km)} km`,
    closest: 'The closest:',
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
    star: englishStars,
    number: starNumber('en-CA'),
    send: 'Send my rating',
    sending: 'Sending…',
    thanks: (count) => `Thanks! Place #${String(count)}, your bowl is on the map now.`,
    cleared: 'Rating removed.',
    clearHint: 'Double-tap a poutine to remove your rating.',
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
  tally: {
    label: (count) =>
      `${count === 1 ? '1 place eaten' : `${String(count)} places eaten`}. Gotta eat ’em all!`,
    title: (count) => (count === 1 ? '1 place eaten' : `${String(count)} places eaten`),
    motto: 'Gotta eat ’em all!',
  },
  settings: {
    open: 'Poutine, secret menu',
    title: 'Secret menu',
    found: 'You found it. Tap the name again any time.',
    language: 'Language',
    phone: 'Automatic',
    names: { fr: 'French', en: 'English' },
    history: 'Poutine’s history',
    articles: [
      {
        title: 'How the Québécois came to love poutine',
        source: 'BBC Travel, 2013',
        url: 'https://www.bbc.co.uk/travel/article/20130531-how-the-quebecois-came-to-love-poutine',
      },
      {
        title: 'Why only Québec can claim poutine',
        source: 'BBC Travel, 2021',
        url: 'https://www.bbc.com/travel/article/20210505-why-only-quebec-can-claim-poutine',
      },
    ],
    counts: {
      title: 'What counts as poutine',
      items: [
        'Potato fries (red potatoes, for that roadside feel).',
        'Sauce brune: Québec’s take on sauce espagnole, one of the French mother sauces. IT IS NOT A GRAVY. Sauces can vary: shoutout to Italian poutine, chicken BBQ poutine or seafood poutine.',
        'Cheese curds: typically cheddar, never melted or shredded. They need to squeak as you eat them, for that true fresh quality.',
      ],
      not: 'Missing even one element of the holy trinity? It’s not poutine. Call it disco fries, loaded fries, or “POO-teen” if you must, but that ain’t it, chef.',
      notLinked: '',
      example:
        'Burying fries under shawarma chicken and garlic-mayo zigzags, currywurst, or pulled pork and slaw—finished with melted shredded cheese instead of a single fresh curd—just gives you loaded fries. Delicious? Probably. Poutine? Absolutely not. Case in point: this',
      oneSold: 'German menu boldly advertising “poutines”',
      afterSold: 'with zero curds in sight.',
      dare: 'Spot an imposter in the wild? Report the offense to',
    },
    scale: {
      title: 'Rating scale',
      line: 'Pootsin, not poo-teen.',
      alt: 'Rating scale. 1 out of 5, Mr. Poo Teen: very bad. 2, poor: barely a poutine. 3, average: does the job. 4, good: solid and tasty. 5, the golden pouts: the ultimate perfection!',
    },
    backup: {
      title: 'Keep your visits',
      text: 'Your ratings live in this browser: clearing its history erases them here.',
      link: 'Keep this link, in your notes or sent to yourself. Opened in any browser, it brings back your bowls, your count, and the ratings you can change.',
      orLink:
        'Or keep this link, in your notes or sent to yourself. Opened in any browser, it brings back your bowls, your count, and the ratings you can change.',
      keep: 'Keep it to yourself: anyone with it can change your ratings.',
      copy: 'Copy the link',
      copied: 'Copied!',
      send: 'Send it to myself',
      empty: 'Rate a place, and the link that brings your ratings back shows up here.',
    },
  },
  keep: {
    save: 'Keep my visits even if I clear my history',
    saving: 'One moment…',
    saved: 'Kept: your visits will come back even if you clear your history.',
    kept: 'Your visits are kept in your phone.',
    failed: 'Your visits couldn’t be kept this time.',
    find: 'Rated places before? Get my visits back',
    findMenu: 'Get my visits back',
    none: 'No visits kept on this phone.',
    name: 'My visits',
  },
  restore: {
    title: 'Your ratings',
    looking: 'Looking for your ratings…',
    none: 'No ratings found.',
    ask: (linked, here) =>
      `This link brings back ${ratedPlaces(linked)}. This browser has ${ratedPlaces(here)} of its own: join them to the link’s?`,
    join: 'Join them',
    cancel: 'Not now',
    done: (count) => `Your ratings are back: ${ratedPlaces(count)}.`,
    failed: 'Your ratings couldn’t be brought back. Open the link again in a moment.',
  },
  share: {
    place: 'Share',
    placeText: (name) => `${name} on Poutines.app. Poots-in, not poo-teen.`,
    copied: 'Link copied.',
    friend: (stars) => `A friend gave this place ${englishStars(stars)}. What would you give it?`,
    invite: 'Don’t be shy, show us the goods!',
    addPhoto: 'Add my photo',
    changePhoto: 'Change photo',
    linkOnly: 'Just send the link',
    photoNote: 'Your photo stays on your phone: it’s only drawn into the picture you share.',
    photoFailed: 'That photo couldn’t be opened. Try another one.',
    hint: 'Sharing also copies the link, for a story’s Link sticker.',
    gave: 'I gave',
    text: (name, stars) => `I gave ${name} ${englishStars(stars)} on Poutine.`,
    saved: 'The picture is in your downloads.',
    linkCopied: 'The link is copied.',
    copyThis: 'In a story, add this link with the Link sticker:',
    failed: 'This browser can’t share the picture.',
  },
  admin: {
    title: 'Places waiting',
    loading: 'Loading…',
    none: 'Nothing waiting.',
    notSignedIn: 'You’re not signed in. Open poutines.app/admin again to sign in.',
    failed: 'The list didn’t load. Reload the page.',
    sent: (when) => `Sent ${when}`,
    lookAlikes: (count) =>
      count === 1 ? '1 look-alike nearby' : `${String(count)} look-alikes nearby`,
    noLookAlike: 'No look-alike nearby.',
    pinBy: {
      address: 'Pin at the address',
      street: 'Pin on the street (number not found)',
      me: 'Pin where the sender stood',
      hand: 'Pin placed by hand',
    },
    moveHint: 'Tap the map to move the pin.',
    postcode: 'Postal code',
    approve: 'Approve',
    fix: 'Fix',
    saveApprove: 'Save and approve',
    reject: 'Reject',
    rejectSure: 'Tap again to reject',
    back: 'Back',
    approved: (name) => `${name} is approved: it shows on the map within a minute.`,
    rejected: (name) => `${name} is rejected.`,
    notWaiting: 'Already decided, maybe in another tab. The list is loaded again.',
    unexpected: 'Something went wrong. Try again in a moment.',
    changesTitle: 'Changes and claims waiting',
    change: 'Change',
    claim: 'Claim',
    closedSaid: 'Closed for good, the sender says.',
    before: 'Now',
    after: 'Proposed',
    fields: {
      name: 'Name',
      address: 'Address',
      city: 'Town',
      postcode: 'Postal code',
      phone: 'Phone',
      website: 'Website',
      facebook: 'Facebook',
      instagram: 'Instagram',
      hours: 'Hours',
      vegan: 'Vegan poutine',
    },
    yes: 'Yes',
    no: 'No',
    ownerContact: 'How to reach the owner',
    placePhone: 'The place’s own phone',
    confirmHint:
      'Call the place’s own number, or ask something only the owner would know, before you approve a claim.',
    changeApproved: (name) =>
      `The change to ${name} is approved: it shows on the map within a minute.`,
    changeRejected: (name) => `The change to ${name} is rejected.`,
  },
  edit: {
    open: 'Add info or claim this spot',
    title: 'Add more info',
    intro: 'Fix what’s wrong, add what’s missing. Every change is checked before it shows.',
    name: 'Name',
    street: 'Address',
    town: 'Town',
    postcode: 'Postal code',
    phone: 'Phone',
    website: 'Website',
    facebook: 'Facebook',
    instagram: 'Instagram',
    hours: 'Hours',
    hoursHint: 'In your own words: “Mon–Fri 11 am–8 pm, closed Sunday”.',
    vegan: 'Vegan poutine on the menu',
    closed: 'Closed for good',
    claim: 'It’s my business',
    claimHint:
      'Leave a phone number or an email: we’ll contact you to confirm it’s yours. It’s never shown, and it’s erased once that’s done.',
    contact: 'Your phone or email',
    send: 'Send',
    sending: 'Sending…',
    back: 'Back',
    sentTitle: 'Thanks!',
    sent: 'It shows on the map once it’s been checked.',
    close: 'Close',
    problems: {
      name: 'The place needs a name.',
      phone: 'That phone number doesn’t look right.',
      website: 'That website address doesn’t look right.',
      facebook: 'That Facebook page doesn’t look right.',
      instagram: 'That Instagram account doesn’t look right.',
      contact: 'To claim the spot, leave a phone number or an email.',
      nothing: 'Nothing changed yet: fix a detail, or tick a box.',
      'too-long': 'One of the fields is too long.',
      'not-a-change': 'The change couldn’t be read. Reload the page and try again.',
      'bot-check': 'The anti-spam check didn’t pass. Try again in a moment.',
      'too-many': 'Too many sent from here in the last hour. Try again later.',
      'queue-full': 'Lots waiting already. Try again in a few days.',
      'no-such-place': 'This place isn’t on the map anymore.',
      offline: 'Not sent: no connection. Try again in a moment.',
      unexpected: 'Something went wrong. Try again in a moment.',
    },
    privacy:
      'No account. To stop spam, a scrambled form of your connection’s address is kept for 30 days.',
    license: 'What you send joins the open list of places (ODbL), like the rest.',
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
  language: 'fr',
  appName: 'Poutine',
  pronounced: '',
  previewStrap: '',
  previewCaption: '',
  preview: {
    kinds: {
      'casse-croute': 'Casse-croûte',
      cantine: 'Cantine',
      friterie: 'Friterie',
      'bar-laitier': 'Bar laitier',
      patates: 'Cantine',
      poutine: 'Poutine',
    },
    placedIn: (what, town) => `${what} à ${town}`,
    placedNear: (what, town) => `${what} près de ${town}`,
  },
  tagline: 'Les casse-croûtes et cantines du Québec sur une carte',
  welcome: {
    title: '',
    strap: '',
    text: `Poutines.app te permet de trouver ta prochaine poutine. Note-la pis partage ta photo${NBSP}! Fini les chaînes${NBSP}!`,
  },
  placeCount: (count) => `${count.toLocaleString('fr-CA')} places à poutine`,
  loading: 'Chargement de la carte…',
  mapFailed: 'La carte n’a pas chargé. Vérifiez votre connexion et rechargez la page.',
  placesCredit: `Lieux${NBSP}: © les contributeurs d’OpenStreetMap, Adresses Québec`,
  card: {
    close: 'Fermer',
    unconfirmed: 'Poutine pas encore confirmée',
    vegan: 'Poutine végane au menu',
    veganPlace: 'Tout est végane ici',
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
    placeholder: 'Cherche ta prochaine',
    clear: 'Effacer la recherche',
    none: (query) =>
      `Rien ne correspond à «${NBSP}${query}${NBSP}». Essayez une ville ou une partie du nom.`,
    found: (count) => (count === 1 ? '1 place trouvée' : `${String(count)} places trouvées`),
    addMissing: (query) => `Pas dans la liste${NBSP}? Ajouter «${NBSP}${query}${NBSP}»`,
  },
  nearMe: {
    button: 'À côté',
    title: 'À côté',
    within: (km) => `À ${String(km)}${NBSP}km ou moins`,
    none: (km) => `Rien à moins de ${String(km)}${NBSP}km`,
    closest: `La plus proche${NBSP}:`,
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
    star: frenchStars,
    number: starNumber('fr-CA'),
    send: 'Envoyer ma note',
    sending: 'Envoi…',
    thanks: (count) =>
      `Merci${NBSP}! ${count === 1 ? '1re' : `${String(count)}e`} place, votre bol est maintenant sur la carte.`,
    cleared: 'Note retirée.',
    clearHint: 'Touchez deux fois sur une poutine pour retirer votre note.',
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
  tally: {
    label: (count) =>
      `${count === 1 ? '1 place mangée' : `${String(count)} places mangées`}. Mange-les toutes${NBSP}!`,
    title: (count) => (count === 1 ? '1 place mangée' : `${String(count)} places mangées`),
    motto: `Mange-les toutes${NBSP}!`,
  },
  settings: {
    open: 'Poutine, menu secret',
    title: 'Menu secret',
    found: 'Vous l’avez trouvé. Touchez le nom quand vous voulez.',
    language: 'Langue',
    phone: 'Automatique',
    names: { fr: 'Français', en: 'Anglais' },
    history: 'L’histoire de la poutine',
    articles: [
      {
        title: 'Comment les Québécois ont appris à aimer la poutine',
        source: 'BBC Travel, en anglais, 2013',
        url: 'https://www.bbc.co.uk/travel/article/20130531-how-the-quebecois-came-to-love-poutine',
      },
      {
        title: 'Pourquoi seul le Québec peut revendiquer la poutine',
        source: 'BBC Travel, en anglais, 2021',
        url: 'https://www.bbc.com/travel/article/20210505-why-only-quebec-can-claim-poutine',
      },
    ],
    counts: {
      title: 'Ce qui fait une poutine',
      items: [
        'Des frites (des patates rouges, pour le goût du casse-croûte sur le bord du chemin).',
        `De la sauce brune, la version québécoise de la sauce espagnole (une des sauces mères françaises). Shoutout au${NBSP}: sauce italienne, BBQ, fruits-de-mer.`,
        `Du fromage en grains frais, ou «${NBSP}squeek squeek${NBSP}».`,
      ],
      not: `Si t’as pas au moins ça, t’as pas une poutine${NBSP}: t’as des frites loadées, `,
      notLinked: 'ou quelque chose d’autre',
      example: '',
      oneSold: '',
      afterSold: '',
      dare: `T’es pas sûr${NBSP}? Va voir sur`,
    },
    scale: {
      title: 'Échelle d’évaluation',
      line: '',
      alt: `Échelle d’évaluation. 1 sur 5, Mr. Poo Teen${NBSP}: le pire du pire. 2, décevant${NBSP}: presque rien dedans. 3, correct${NBSP}: fait la job, sans plus. 4, bon${NBSP}: solide et savoureux. 5, la pouts d’or${NBSP}: la perfection suprême${NBSP}!`,
    },
    backup: {
      title: 'Garder vos visites',
      text: `Vos notes vivent dans ce navigateur${NBSP}: vider son historique les efface d’ici.`,
      link: 'Gardez ce lien, dans vos notes ou envoyé à vous-même. Ouvert dans n’importe quel navigateur, il ramène vos bols, votre compteur et les notes que vous pouvez changer.',
      orLink:
        'Ou gardez ce lien, dans vos notes ou envoyé à vous-même. Ouvert dans n’importe quel navigateur, il ramène vos bols, votre compteur et les notes que vous pouvez changer.',
      keep: `Gardez-le pour vous${NBSP}: avec lui, n’importe qui peut changer vos notes.`,
      copy: 'Copier le lien',
      copied: `Copié${NBSP}!`,
      send: 'Me l’envoyer',
      empty: 'Notez une place, et le lien qui ramène vos notes apparaîtra ici.',
    },
  },
  keep: {
    save: 'Garder mes visites même si je vide l’historique',
    saving: 'Un instant…',
    saved: `C’est gardé${NBSP}: vos visites reviendront même si vous videz l’historique.`,
    kept: 'Vos visites sont gardées dans votre téléphone.',
    failed: 'Vos visites n’ont pas pu être gardées cette fois.',
    find: `Déjà noté des places${NBSP}? Retrouver mes visites`,
    findMenu: 'Retrouver mes visites',
    none: 'Aucune visite gardée sur ce téléphone.',
    name: 'Mes visites',
  },
  restore: {
    title: 'Vos notes',
    looking: 'Recherche de vos notes…',
    none: 'Aucune note trouvée.',
    ask: (linked, here) =>
      `Ce lien ramène ${placesNotees(linked)}. Ce navigateur a ${placesNotees(here)} de son côté${NBSP}: les joindre à celles du lien${NBSP}?`,
    join: 'Les joindre',
    cancel: 'Pas maintenant',
    done: (count) => `Vos notes sont revenues${NBSP}: ${placesNotees(count)}.`,
    failed: `Impossible de ramener vos notes pour l’instant. Rouvrez le lien dans un moment.`,
  },
  share: {
    place: 'Partager',
    placeText: (name) => `${name}, sur Poutine`,
    copied: 'Lien copié.',
    friend: (stars) =>
      `Quelqu’un t’envoie sa note${NBSP}: ${frenchStars(stars)}. Et toi, tu lui donnes combien${NBSP}?`,
    invite: `Awaye, montre ta pouts${NBSP}!`,
    addPhoto: 'Ajouter ma photo',
    changePhoto: 'Changer de photo',
    linkOnly: 'Envoyer juste le lien',
    photoNote: `Votre photo reste sur votre téléphone${NBSP}: elle est seulement dessinée dans l’image partagée.`,
    photoFailed: 'Cette photo n’a pas pu être ouverte. Essayez-en une autre.',
    hint: 'Partager copie aussi le lien, pour l’autocollant Lien d’une story.',
    gave: 'J’ai donné',
    text: (name, stars) => `J’ai donné ${frenchStars(stars)} à ${name} sur Poutine.`,
    saved: 'L’image est dans vos téléchargements.',
    linkCopied: 'Le lien est copié.',
    copyThis: `Dans une story, ajoutez ce lien avec l’autocollant Lien${NBSP}:`,
    failed: 'Ce navigateur ne peut pas partager l’image.',
  },
  admin: {
    title: 'Places en attente',
    loading: 'Chargement…',
    none: 'Rien en attente.',
    notSignedIn: `Vous n’êtes pas connecté. Rouvrez poutines.app/admin pour vous connecter.`,
    failed: 'La liste n’a pas chargé. Rechargez la page.',
    sent: (when) => `Envoyée le ${when}`,
    lookAlikes: (count) =>
      count === 1 ? '1 place semblable tout près' : `${String(count)} places semblables tout près`,
    noLookAlike: 'Aucune place semblable tout près.',
    pinBy: {
      address: 'Épingle à l’adresse',
      street: 'Épingle sur la rue (numéro introuvable)',
      me: 'Épingle là où était la personne',
      hand: 'Épingle placée à la main',
    },
    moveHint: 'Touchez la carte pour déplacer l’épingle.',
    postcode: 'Code postal',
    approve: 'Approuver',
    fix: 'Corriger',
    saveApprove: 'Enregistrer et approuver',
    reject: 'Refuser',
    rejectSure: 'Touchez encore pour refuser',
    back: 'Retour',
    approved: (name) =>
      `${name} est approuvée${NBSP}: elle apparaît sur la carte d’ici une minute.`,
    rejected: (name) => `${name} est refusée.`,
    notWaiting: 'Déjà décidée, peut-être dans un autre onglet. La liste est rechargée.',
    unexpected: 'Un problème est survenu. Réessayez dans un moment.',
    changesTitle: 'Changements et réclamations en attente',
    change: 'Changement',
    claim: 'Réclamation',
    closedSaid: `Fermé pour de bon, dit la personne.`,
    before: 'Maintenant',
    after: 'Proposé',
    fields: {
      name: 'Nom',
      address: 'Adresse',
      city: 'Ville',
      postcode: 'Code postal',
      phone: 'Téléphone',
      website: 'Site Web',
      facebook: 'Facebook',
      instagram: 'Instagram',
      hours: 'Heures',
      vegan: 'Poutine végane',
    },
    yes: 'Oui',
    no: 'Non',
    ownerContact: 'Pour joindre le propriétaire',
    placePhone: 'Le téléphone du commerce',
    confirmHint:
      'Appelez le numéro du commerce, ou demandez ce que seul le propriétaire saurait, avant d’approuver une réclamation.',
    changeApproved: (name) =>
      `Le changement à ${name} est approuvé${NBSP}: il apparaît sur la carte d’ici une minute.`,
    changeRejected: (name) => `Le changement à ${name} est refusé.`,
  },
  edit: {
    open: 'Ajouter de l’info ou réclamer ce commerce',
    title: 'Ajouter de l’info',
    intro:
      'Corrigez ce qui cloche, ajoutez ce qui manque. Chaque changement est vérifié avant d’apparaître.',
    name: 'Nom',
    street: 'Adresse',
    town: 'Ville',
    postcode: 'Code postal',
    phone: 'Téléphone',
    website: 'Site Web',
    facebook: 'Facebook',
    instagram: 'Instagram',
    hours: 'Heures',
    hoursHint: `Dans vos mots${NBSP}: «${NBSP}lun-ven 11 h-20 h, fermé le dimanche${NBSP}».`,
    vegan: 'Poutine végane au menu',
    closed: 'Fermé pour de bon',
    claim: 'C’est mon commerce',
    claimHint: `Laissez un numéro ou un courriel${NBSP}: on vous contactera pour confirmer que c’est le vôtre. Il n’est jamais affiché, et il est effacé une fois que c’est réglé.`,
    contact: 'Votre téléphone ou courriel',
    send: 'Envoyer',
    sending: 'Envoi…',
    back: 'Retour',
    sentTitle: `Merci${NBSP}!`,
    sent: 'Ça apparaîtra sur la carte une fois vérifié.',
    close: 'Fermer',
    problems: {
      name: 'La place a besoin d’un nom.',
      phone: 'Ce numéro de téléphone ne semble pas bon.',
      website: 'Cette adresse Web ne semble pas bonne.',
      facebook: 'Cette page Facebook ne semble pas bonne.',
      instagram: 'Ce compte Instagram ne semble pas bon.',
      contact: 'Pour réclamer le commerce, laissez un numéro ou un courriel.',
      nothing: `Rien n’a changé${NBSP}: corrigez un détail ou cochez une case.`,
      'too-long': 'Un des champs est trop long.',
      'not-a-change': 'Le changement n’a pas pu être lu. Rechargez la page et réessayez.',
      'bot-check': 'La vérification anti-pourriel n’a pas passé. Réessayez dans un moment.',
      'too-many': 'Trop d’envois d’ici dans la dernière heure. Réessayez plus tard.',
      'queue-full': 'Beaucoup en attente déjà. Réessayez dans quelques jours.',
      'no-such-place': 'Cette place n’est plus sur la carte.',
      offline: `Pas envoyé${NBSP}: pas de connexion. Réessayez dans un moment.`,
      unexpected: 'Un problème est survenu. Réessayez dans un moment.',
    },
    privacy:
      'Pas de compte. Pour bloquer le pourriel, une forme brouillée de l’adresse de votre connexion est gardée 30 jours.',
    license: 'Ce que vous envoyez rejoint la liste ouverte des places (ODbL), comme le reste.',
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

/**
 * French when the phone's first language is any French (fr, fr-CA, fr-FR, fr-BE, fr_CA...), English
 * for every other (Alex, 2026-10-20: "anyone who's phone isn't french should be routed to the
 * english side. any variant of french should be on the french side").
 */
export function phoneLanguage(languages: readonly string[]): Language {
  return /^fr(?:[-_]|$)/i.test(languages[0]?.trim() ?? '') ? 'fr' : 'en';
}

export function stringsFor(language: Language): Strings {
  return language === 'fr' ? french : english;
}
