import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkForNewPlace } from '../../src/domain/shortLinks.ts';
import { formOf, type NewPlace } from '../../src/domain/submission.ts';
import { signedInAlex } from '../../worker/access.ts';
import { newPlaceMail, spotMail } from '../../worker/mailText.ts';

const sent: NewPlace = {
  name: 'Cantine Trempette',
  housenumber: '12',
  street: 'Rue Principale',
  city: 'Saint-Rémi',
  province: 'QC',
  postcode: 'J0L 2L0',
  lat: 45.26,
  lon: -73.61,
  placedBy: 'address',
  phone: '+14505550123',
  website: 'https://www.facebook.com/cantinetrempette',
};

describe('a new place’s short link', () => {
  const known = [
    { osm: 'node/1', name: 'La Banquise', city: 'Montréal', link: 'labanquise' },
    { osm: 'node/2', name: 'Chez Poutini', city: 'Québec', link: 'chezpoutini' },
  ];
  const given = { 'node/1': 'labanquise', 'node/2': 'chezpoutini' };

  it('is its name when no other place has it', () => {
    expect(
      linkForNewPlace(
        { osm: 'added/7', name: 'Cantine Trempette', city: 'Saint-Rémi' },
        known,
        given,
      ),
    ).toBe('cantinetrempette');
  });

  it('takes its town when another place has the name, and never takes a given link', () => {
    expect(
      linkForNewPlace({ osm: 'added/8', name: 'Chez Poutini', city: 'Laval' }, known, given),
    ).toBe('chezpoutinilaval');
    expect(Object.values(given)).not.toContain('chezpoutinilaval');
  });
});

describe('the form a fix starts from', () => {
  it('puts the civic number and street back on one line, the box ticked', () => {
    expect(formOf(sent)).toMatchObject({
      name: 'Cantine Trempette',
      street: '12 Rue Principale',
      servesPoutine: true,
      placedBy: 'address',
    });
  });
});

describe('the new-place email', () => {
  const raw = newPlaceMail(7, sent, 'alex@example.test', new Date('2026-10-20T03:00:00Z'));
  const [headers = '', body = ''] = raw.split('\r\n\r\n');
  const text = Buffer.from(body.replaceAll('\r\n', ''), 'base64').toString('utf8');

  it('is from the site to Alex, its subject naming the place, accents and all', () => {
    expect(headers).toContain('From: Poutine <places@poutines.app>');
    expect(headers).toContain('To: <alex@example.test>');
    const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(headers)?.[1] ?? '';
    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe(
      'New place waiting: Cantine Trempette (Saint-Rémi)',
    );
    expect(headers).toMatch(/Message-ID: <[0-9a-f-]+@poutines\.app>/);
  });

  it('says what came in and links to the approval page, with nothing that approves', () => {
    expect(text).toContain('#7');
    expect(text).toContain('12 Rue Principale, Saint-Rémi, QC');
    expect(text).toContain('https://poutines.app/admin');
    expect(text).not.toMatch(/approve\?|api\/admin|decision/);
  });
});

describe('the email for a place two visitors listed', () => {
  const raw = spotMail(7, 9, sent, 'alex@example.test', new Date('2026-10-22T03:00:00Z'));
  const [headers = '', body = ''] = raw.split('\r\n\r\n');
  const text = Buffer.from(body.replaceAll('\r\n', ''), 'base64').toString('utf8');

  it('says it is on the map already, from both sends, and where to remove it', () => {
    const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(headers)?.[1] ?? '';
    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe(
      'Listed by two visitors: Cantine Trempette (Saint-Rémi)',
    );
    expect(text).toContain('#7 and #9');
    expect(text).toContain('on the map now');
    expect(text).toContain('12 Rue Principale, Saint-Rémi, QC');
    expect(text).toContain('remove it here: https://poutines.app/admin');
    expect(text).not.toMatch(/api\/admin|decision/);
  });
});

describe('the approval page’s sign-in check', () => {
  const settings = {
    ACCESS_CERTS_URL: 'https://team.example/cdn-cgi/access/certs',
    ACCESS_AUD: 'aud-1',
  };
  const base64url = (bytes: Uint8Array | string): string =>
    Buffer.from(bytes)
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');

  async function tokens(kid: string = crypto.randomUUID()) {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [{ kid, kty: jwk.kty, n: jwk.n, e: jwk.e }] })),
    );
    const sign = async (claims: Record<string, unknown>, signedWith = kid) => {
      const head = base64url(JSON.stringify({ alg: 'RS256', kid: signedWith }));
      const body = base64url(JSON.stringify(claims));
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
    };
    return sign;
  }
  const asking = (token: string) =>
    new Request('https://poutines.app/api/admin/waiting', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });
  const later = Math.floor(Date.now() / 1000) + 3600;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets in a token Access signed for this application, still good', async () => {
    const sign = await tokens();
    expect(await signedInAlex(asking(await sign({ aud: ['aud-1'], exp: later })), settings)).toBe(
      true,
    );
  });

  it('takes a token signed with a new key at once (Access rotates its keys)', async () => {
    const before = await tokens('rotate-before');
    expect(await signedInAlex(asking(await before({ aud: ['aud-1'], exp: later })), settings)).toBe(
      true,
    );
    const after = await tokens('rotate-after');
    expect(await signedInAlex(asking(await after({ aud: ['aud-1'], exp: later })), settings)).toBe(
      true,
    );
  });

  it('keeps out another application’s token, an old one, a changed one, none, and all without settings', async () => {
    const sign = await tokens();
    const good = await sign({ aud: ['aud-1'], exp: later });
    expect(await signedInAlex(asking(await sign({ aud: ['aud-2'], exp: later })), settings)).toBe(
      false,
    );
    expect(await signedInAlex(asking(await sign({ aud: 'aud-1', exp: 1000 })), settings)).toBe(
      false,
    );
    const [head, , signature] = good.split('.');
    const changed = `${head ?? ''}.${base64url(JSON.stringify({ aud: ['aud-1'], exp: later, email: 'x' }))}.${signature ?? ''}`;
    expect(await signedInAlex(asking(changed), settings)).toBe(false);
    expect(
      await signedInAlex(asking(await sign({ aud: ['aud-1'], exp: later }, 'k2')), settings),
    ).toBe(false);
    expect(await signedInAlex(new Request('https://poutines.app/admin'), settings)).toBe(false);
    expect(await signedInAlex(asking(good), { ACCESS_CERTS_URL: '', ACCESS_AUD: '' })).toBe(false);
  });
});
