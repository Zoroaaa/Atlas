import { describe, expect, it } from 'vitest';
import {
  compactJavCode,
  inspectJavCode,
  isClassicJavCodePrefix,
  javCodeLookupVariants,
  normalizeJavCode,
  type JavCodeKind,
} from '@codeseek/shared/utils';

const cases: Array<[string, string, JavCodeKind, boolean]> = [
  ['abp123', 'ABP-123', 'standard', true],
  ['SSNI-1', 'SSNI-1', 'standard', true],
  ['FC2PPV1234567', 'FC2-PPV-1234567', 'multi-segment', true],
  ['FC2-1234567', 'FC2-PPV-1234567', 'multi-segment', true],
  ['092526-001', '092526-001', 'numeric-dash', true],
  ['100126_100', '100126_100', 'numeric-underscore', true],
  ['101526_01', '101526_01', 'numeric-underscore', true],
  ['91CM-109', '91CM-109', 'alnum', true],
  ['MD0250-1', 'MD0250-1', 'alnum', true],
  ['T28-123', 'T28-123', 'alnum', true],
  ['HEYZO-3953', 'HEYZO-3953', 'standard', true],
  ['LAFBD-41', 'LAFBD-41', 'standard', true],
  ['N1234', 'N1234', 'tokyo-hot', true],
  ['三上悠亜', '三上悠亜', 'unknown', false],
  ['1234567', '1234567', 'unknown', false],
];

describe('jav-code', () => {
  it.each(cases)('normalizes/recognizes %s', (input, code, kind, recognized) => {
    expect(normalizeJavCode(input)).toBe(code);
    expect(inspectJavCode(input)).toMatchObject({ code, kind, recognized });
  });

  it('provides lookup variants for short standard codes', () => {
    expect(javCodeLookupVariants('SSNI-1')).toEqual(
      expect.arrayContaining(['SSNI-1', 'SSNI-001'])
    );
  });

  it('provides lookup variants for FC2', () => {
    expect(javCodeLookupVariants('FC2-PPV-1234567')).toEqual(
      expect.arrayContaining(['FC2-PPV-1234567', 'FC2-1234567'])
    );
  });

  it('only compacts classic codes', () => {
    expect(compactJavCode('WAAA-624')).toBe('WAAA624');
    expect(compactJavCode('100126_100')).toBe('100126_100');
  });

  it('supports classic prefixes while typing', () => {
    expect(isClassicJavCodePrefix('ABP')).toBe(true);
    expect(isClassicJavCodePrefix('ABP1')).toBe(true);
    expect(isClassicJavCodePrefix('三上')).toBe(false);
  });
});
