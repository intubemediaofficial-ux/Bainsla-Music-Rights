import { isValidIsrc, isValidIswc, isValidUpc, normalizeIsrc, normalizeTitle, validateClaims, type ClaimLike } from './validation.js';

let n = 0;
const c = (p: Partial<ClaimLike>): ClaimLike => ({
  id: `c${++n}`, partyId: `p${n}`, rightType: 'MASTER', sharePercent: 50, territories: ['WW'], startDate: null, endDate: null, status: 'ASSERTED', ...p,
});
const d = (s: string) => new Date(s);

describe('validateClaims', () => {
  it('100% split across parties is fine', () => {
    const [r] = validateClaims([c({ sharePercent: 60 }), c({ sharePercent: 40 })]);
    expect(r.issues).toHaveLength(0);
    expect(r.maxTotal).toBe(100);
    expect(r.worldwideTotal).toBe(100);
  });

  it('flags more than 100% worldwide', () => {
    const [r] = validateClaims([c({ sharePercent: 60 }), c({ sharePercent: 50 })]);
    expect(r.issues[0]).toMatchObject({ kind: 'OVER_100', total: 110, territory: 'WW' });
  });

  it('different right types do not add up', () => {
    const r = validateClaims([c({ sharePercent: 100, rightType: 'MASTER' }), c({ sharePercent: 100, rightType: 'COMPOSITION' })]);
    expect(r.flatMap((x) => x.issues)).toHaveLength(0);
  });

  it('non-overlapping territories do not conflict', () => {
    const [r] = validateClaims([c({ sharePercent: 100, territories: ['IN'] }), c({ sharePercent: 100, territories: ['US', 'GB'] })]);
    expect(r.issues).toHaveLength(0);
  });

  it('worldwide claim conflicts with a territory claim', () => {
    const [r] = validateClaims([c({ sharePercent: 70 }), c({ sharePercent: 40, territories: ['IN'] })]);
    expect(r.issues.map((i) => i.territory)).toEqual(['IN']);
    expect(r.issues[0].total).toBe(110);
  });

  it('non-overlapping date ranges do not conflict', () => {
    const [r] = validateClaims([
      c({ sharePercent: 100, startDate: d('2020-01-01'), endDate: d('2022-12-31') }),
      c({ sharePercent: 100, startDate: d('2023-01-01') }),
    ]);
    expect(r.issues).toHaveLength(0);
  });

  it('overlapping date ranges conflict and report the window', () => {
    const [r] = validateClaims([
      c({ sharePercent: 100, startDate: d('2020-01-01'), endDate: d('2023-06-30') }),
      c({ sharePercent: 100, startDate: d('2023-01-01') }),
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].from?.toISOString()).toBe('2023-01-01T00:00:00.000Z');
    expect(r.issues[0].to?.toISOString().slice(0, 10)).toBe('2023-06-30');
  });

  it('rejected claims are ignored', () => {
    const [r] = validateClaims([c({ sharePercent: 100 }), c({ sharePercent: 100, status: 'REJECTED' })]);
    expect(r.issues).toHaveLength(0);
  });

  it('fractional shares sum exactly', () => {
    const [r] = validateClaims([c({ sharePercent: 33.3333 }), c({ sharePercent: 33.3333 }), c({ sharePercent: 33.3334 })]);
    expect(r.maxTotal).toBe(100);
    expect(r.issues).toHaveLength(0);
  });

  it('same party twice on the same right is flagged', () => {
    const [r] = validateClaims([c({ partyId: 'X', sharePercent: 20 }), c({ partyId: 'X', sharePercent: 30 })]);
    expect(r.issues.some((i) => i.kind === 'DUPLICATE_PARTY')).toBe(true);
  });
});

describe('identifiers', () => {
  it('ISRC', () => {
    expect(normalizeIsrc('in-a1b-24-00001')).toBe('INA1B2400001');
    expect(isValidIsrc('INA1B2400001')).toBe(true);
    expect(isValidIsrc('INA1B24001')).toBe(false);
  });
  it('UPC check digit', () => {
    expect(isValidUpc('036000291452')).toBe(true);
    expect(isValidUpc('036000291453')).toBe(false);
    expect(isValidUpc('4006381333931')).toBe(true);
  });
  it('ISWC', () => {
    expect(isValidIswc('T0345246801')).toBe(true);
    expect(isValidIswc('T034524680')).toBe(false);
  });
  it('title normalisation for duplicate detection', () => {
    expect(normalizeTitle('Mera Gaon (Remix)')).toBe(normalizeTitle('mera  gaon!'));
    expect(normalizeTitle('मेरा गाँव')).toBe('मेरा गाँव');
  });
});
