import { isChain, normalizePostcode, whyListed } from './osmPlaces.ts';
import { fold } from './text.ts';

// Leads from the Registraire des entreprises du Québec's open data (CC BY-NC-SA 4.0), for Alex to
// look over (2026-10-20: "i like option 1"): restaurants named or described like a casse-croûte.
// Leads only: nothing from the register goes in the list, which is ODbL and free for anyone to
// reuse, businesses included; a lead joins the map once Alex, a visitor or the place's own site
// confirms it.

/** One establishment of the register (Etablissements.csv), as read. */
export interface Establishment {
  neq: string;
  /** NOM_ETAB: the establishment's own name. */
  name: string;
  /** LIGN1_ADR to LIGN4_ADR. */
  lines: readonly [string, string, string, string];
  /** COD_ACT_ECON and DESC_ACT_ECON_ETAB, then the second activity. */
  activities: readonly { code: string; text: string }[];
}

/** Named like a casse-croûte, or only described as one by its activity. */
export type LeadTier = 'named' | 'described';

/** The register's restaurant activities: restaurants with or without an alcohol permit, take-out. */
const RESTAURANT = new Set(['9210', '9211', '9212', '9213']);

/** Folded words that say casse-croûte, in a name or an activity's words. */
const SNACK =
  /casse ?croute|cantine|patate|pataterie|poutin|friterie|roulotte|snack|bar laitier|\bfrites?\b|chip ?stand|hot ?dog|restauration rapide|fast ?food/;

/** An activity's words that say casse-croûte: "restauration rapide" alone is any fast food. */
const SNACK_ACTIVITY =
  /casse ?croute|cantine|patate|pataterie|poutin|friterie|roulotte|snack|bar laitier|\bfrites?\b|chip ?stand|hot ?dog/;

/** A numbered company's name ("9123-4567 Québec inc.", "171674 Canada inc."): says nothing. */
const NUMBERED = /^\d{4} \d{4} quebec\b|^\d+ canada\b/;

/** Food services that run institutions' cafeterias, and cafeterias themselves. */
const INSTITUTION = /\b(?:sodexo|aramark|compass|chartwells|cafeteria)\b/;

/** A restaurant, with or without an alcohol permit, or take-out, by its first or second activity. */
export function isRestaurant(establishment: Establishment): boolean {
  return establishment.activities.some((activity) => RESTAURANT.has(activity.code));
}

/**
 * The name a lead goes by: the establishment's own, or for a numbered company one of its other
 * names in force (Nom.csv), the one that says casse-croûte first.
 */
export function leadName(establishment: Establishment, otherNames: readonly string[]): string {
  const own = establishment.name.trim();
  if (own && !NUMBERED.test(fold(own))) return own;
  return otherNames.find((name) => SNACK.test(fold(name))) ?? otherNames[0] ?? own;
}

/**
 * Whether an establishment is a lead, and how strong: a restaurant (or take-out) named like a
 * casse-croûte, or one whose activity says so and whose name names no other food (the map's own
 * rule: no pizza, sushi, souvlaki…). Chains and institutions' cafeterias are left out.
 */
export function leadTier(establishment: Establishment, name: string): LeadTier | null {
  if (!isRestaurant(establishment)) return null;
  const folded = fold(name);
  if (isChain({ name }) || INSTITUTION.test(folded)) return null;
  if (SNACK.test(folded)) return 'named';
  const said = fold(establishment.activities.map((activity) => activity.text).join(' '));
  if (!SNACK_ACTIVITY.test(said)) return null;
  return whyListed({ name, amenity: 'fast_food' }) === null ? null : 'described';
}

/** "Blainville (Québec)", "MONT-TREMBLANT QC", "Gaspé, Québec" → the town alone. */
function townOf(line: string): string {
  return line
    .replace(/\s*\((?:qu[eé]bec|qc)\)\s*$/i, '')
    .replace(/[\s,]+(?:qu[eé]bec|qc)\s*$/i, '')
    .trim();
}

/**
 * A register address's street (a post-office box left out: "3035, CHEMIN PRINCIPAL C.P. 405"),
 * town and postal code, from its four lines.
 */
export function registerAddress(lines: readonly [string, string, string, string]): {
  street: string;
  town: string;
  postalCode: string;
} {
  const [first, second, third, fourth] = lines;
  const street = first
    .replace(/[\s,]*(?:c\.?\s?p\.?|case postale|b\.?\s?p\.?)\s*\d+.*$/i, '')
    .replace(/,\s*$/, '')
    .trim();
  const postal = [fourth, third, second].find((line) =>
    /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(line.trim()),
  );
  const town = townOf(second) || townOf(third);
  return { street, town, postalCode: postal ? normalizePostcode(postal) : '' };
}
