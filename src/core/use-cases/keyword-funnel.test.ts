import { describe, expect, it } from 'vitest';
import { sampleJob } from '../../../tests/helpers';
import { applyKeywordFunnel, keywordMatches } from './keyword-funnel';

describe('keywordMatches', () => {
  it.each([
    ['Virtual Assistant needed', 'virtual assistant', true],
    ['Virtual   assistant', 'virtual assistant', true],
    ['VA/Admin role', 'va', true],
    ['Java developer', 'va', false],
    ['Shopify e-commerce store', 'e-commerce', true],
    ['C++ engineer', 'c++', true],
    ['Senior React dev', 'react', true],
    ['Reactive programming', 'react', false],
    ['', 'anything', false],
  ])('%j ~ %j → %s', (text, keyword, expected) => {
    expect(keywordMatches(text, keyword)).toBe(expected);
  });
});

describe('applyKeywordFunnel', () => {
  const job = sampleJob({
    title: 'Virtual Assistant for Online Store',
    description: 'Answer customer email. Some cold calling may be required.',
    requirements: ['Email Management', 'Shopify'],
    employmentType: 'Full Time',
  });

  it('passes everything when there are no keywords', () => {
    expect(applyKeywordFunnel(job, { include: [], exclude: [] })).toEqual({
      passes: true,
      matchedInclude: [],
      matchedExclude: [],
    });
  });

  it('requires at least one include keyword (title, skills or description)', () => {
    expect(
      applyKeywordFunnel(job, { include: ['bookkeeping', 'shopify'], exclude: [] }),
    ).toMatchObject({
      passes: true,
      matchedInclude: ['shopify'],
    });
    expect(applyKeywordFunnel(job, { include: ['bookkeeping'], exclude: [] }).passes).toBe(false);
  });

  it('exclusions always win', () => {
    expect(
      applyKeywordFunnel(job, { include: ['virtual assistant'], exclude: ['cold calling'] }),
    ).toEqual({
      passes: false,
      matchedInclude: ['virtual assistant'],
      matchedExclude: ['cold calling'],
    });
  });

  it('matches employment type', () => {
    expect(applyKeywordFunnel(job, { include: ['full time'], exclude: [] }).passes).toBe(true);
  });
});
