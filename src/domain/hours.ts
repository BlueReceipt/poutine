/** The words opening hours are written with, from strings.ts. */
export interface HoursWords {
  /** Monday to Sunday. */
  days: readonly [string, string, string, string, string, string, string];
  /** January to December. */
  months: readonly string[];
  everyDay: string;
  holidays: string;
  closed: string;
  open: string;
  always: string;
  /** "11:00" in the language's way: 11:00, 11 h. */
  time: (hours: number, minutes: number) => string;
  /** A month and its day: "Apr 27", "27 avr.". */
  date: (month: string, day: number) => string;
  /** Between a season and its days: ": ", or " : " with a no-break space in French. */
  colon: string;
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Token =
  | { kind: 'day'; index: number }
  | { kind: 'holiday' }
  | { kind: 'month'; index: number }
  | { kind: 'number'; value: number }
  | { kind: 'time'; hours: number; minutes: number }
  | { kind: 'word'; value: 'off' | 'on' | 'always' }
  | { kind: 'mark'; value: '-' | ',' | ';' | ':' | '+' };

const TOKEN =
  /\s*(24\/7|Mo|Tu|We|Th|Fr|Sa|Su|PH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|off|closed|on|open|\d{1,2}:\d{2}|\d{1,2}|[-,;:+])\s*/y;

function tokens(raw: string): Token[] | null {
  const found: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < raw.length) {
    const match = TOKEN.exec(raw);
    const text = match?.[1];
    if (!text) return null;
    if (DAYS.includes(text)) found.push({ kind: 'day', index: DAYS.indexOf(text) });
    else if (MONTHS.includes(text)) found.push({ kind: 'month', index: MONTHS.indexOf(text) });
    else if (text === 'PH') found.push({ kind: 'holiday' });
    else if (text === '24/7') found.push({ kind: 'word', value: 'always' });
    else if (text === 'off' || text === 'closed') found.push({ kind: 'word', value: 'off' });
    else if (text === 'on' || text === 'open') found.push({ kind: 'word', value: 'on' });
    else if (text.includes(':') && text.length > 1) {
      const [hours = 0, minutes = 0] = text.split(':').map(Number);
      found.push({ kind: 'time', hours, minutes });
    } else if (/^\d+$/.test(text)) found.push({ kind: 'number', value: Number(text) });
    else found.push({ kind: 'mark', value: text as '-' | ',' | ';' | ':' | '+' });
  }
  return found;
}

/** Rules end at ";", or at a comma between a time and the next days ("…20:00, Fr 11:00-21:00"). */
function rules(all: Token[]): Token[][] {
  const split: Token[][] = [[]];
  all.forEach((token, i) => {
    const before = all[i - 1];
    const after = all[i + 1];
    const endsRule =
      (token.kind === 'mark' && token.value === ';') ||
      (token.kind === 'mark' &&
        token.value === ',' &&
        (before?.kind === 'time' || before?.kind === 'word') &&
        (after?.kind === 'day' || after?.kind === 'month' || after?.kind === 'holiday'));
    if (endsRule) split.push([]);
    else split[split.length - 1]?.push(token);
  });
  return split.filter((rule) => rule.length > 0);
}

/** "Every day" at the start of a line, "every day" after a season. */
function everyDay(words: HoursWords, before: readonly string[]): string {
  return before.length === 0
    ? words.everyDay
    : words.everyDay.charAt(0).toLowerCase() + words.everyDay.slice(1);
}

function line(rule: Token[], words: HoursWords): string | null {
  const parts: string[] = [];
  let hasDays = false;
  let hasTimes = false;
  for (let i = 0; i < rule.length; i += 1) {
    const token = rule[i];
    const dash = rule[i + 1]?.kind === 'mark' && (rule[i + 1] as { value: string }).value === '-';
    const next = rule[i + 2];
    if (!token) continue;
    switch (token.kind) {
      case 'day': {
        hasDays = true;
        if (dash && next?.kind === 'day') {
          parts.push(
            token.index === 0 && next.index === 6
              ? everyDay(words, parts)
              : `${words.days[token.index] ?? ''}–${words.days[next.index] ?? ''}`,
          );
          i += 2;
        } else parts.push(words.days[token.index] ?? '');
        break;
      }
      case 'holiday':
        hasDays = true;
        parts.push(words.holidays);
        break;
      case 'month': {
        // A month, maybe its day, maybe a range to another: "May-Oct", "Apr 27-Sep 10".
        const day = rule[i + 1]?.kind === 'number' ? (rule[i + 1] as { value: number }) : null;
        const start = day ? words.date(words.months[token.index] ?? '', day.value) : null;
        if (day) i += 1;
        let text = start ?? words.months[token.index] ?? '';
        const rangeDash =
          rule[i + 1]?.kind === 'mark' && (rule[i + 1] as { value: string }).value === '-';
        const end = rule[i + 2];
        if (rangeDash && end?.kind === 'month') {
          const endDay = rule[i + 3]?.kind === 'number' ? (rule[i + 3] as { value: number }) : null;
          const endText = endDay
            ? words.date(words.months[end.index] ?? '', endDay.value)
            : (words.months[end.index] ?? '');
          text = `${text}–${endText}`;
          i += endDay ? 3 : 2;
        }
        parts.push(text);
        break;
      }
      case 'time': {
        hasTimes = true;
        const from = words.time(token.hours, token.minutes);
        if (dash && next?.kind === 'time') {
          parts.push(`${from}–${words.time(next.hours, next.minutes)}`);
          i += 2;
        } else if (dash) {
          parts.push(`${from}–`);
          i += 1;
        } else parts.push(from);
        break;
      }
      case 'word':
        if (token.value === 'always') parts.push(words.always);
        else parts.push(token.value === 'off' ? words.closed : words.open);
        hasTimes = true;
        break;
      case 'mark':
        if (token.value === ',') parts.push(',');
        else if (token.value === ':') parts.push(words.colon);
        else if (token.value === '+') parts.push('+');
        else return null;
        break;
      case 'number':
        return null;
    }
  }
  if (!hasDays && hasTimes && !parts.includes(words.always)) parts.unshift(words.everyDay);
  return parts
    .join(' ')
    .replace(/ ,/g, ',')
    .replace(/ \+/g, '+')
    .replace(new RegExp(` ${escape(words.colon)} `, 'g'), words.colon);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * OpenStreetMap's opening_hours ("Mo-Fr 11:00-21:00; Sa,Su 10:00-21:00") as lines to read, in the
 * language of the words given; null when it holds something these rules don't know (then the card
 * shows it as tagged).
 */
export function readableHours(raw: string, words: HoursWords): string[] | null {
  const found = tokens(raw.trim());
  if (!found || found.length === 0) return null;
  const lines: string[] = [];
  for (const rule of rules(found)) {
    const text = line(rule, words);
    if (text === null) return null;
    lines.push(text);
  }
  return lines;
}
