import { describe, expect, it } from 'vitest';
import { sampleJob } from '../../../tests/helpers';
import {
  ApplicationDraftSchema,
  defaultSearchKeywords,
  defaultSettings,
  defaultTargetSite,
  DEFAULT_TARGET_SITE_URL,
  JobMatchSchema,
  migrateDraftsV1toV2,
  JobPostingSchema,
  ProfileStateSchema,
  SearchKeywordsSchema,
  SettingsSchema,
  TargetSiteSchema,
} from '.';

const now = new Date('2026-11-08T00:00:00.000Z');

describe('defaults are valid', () => {
  it('settings, keywords, target site', () => {
    expect(SettingsSchema.safeParse(defaultSettings()).success).toBe(true);
    expect(SearchKeywordsSchema.safeParse(defaultSearchKeywords()).success).toBe(true);
    const site = defaultTargetSite(now);
    expect(TargetSiteSchema.safeParse(site).success).toBe(true);
    expect(site.url).toBe(DEFAULT_TARGET_SITE_URL);
    expect(site.enabled).toBe(true);
  });
});

describe('SettingsSchema', () => {
  it('rejects a request delay below the 5 s floor', () => {
    const s = defaultSettings();
    s.scan.requestDelayMs = 1000;
    expect(SettingsSchema.safeParse(s).success).toBe(false);
  });

  it('rejects an unknown provider', () => {
    expect(
      SettingsSchema.safeParse({ ...defaultSettings(), ai: { provider: 'other' } }).success,
    ).toBe(false);
  });
});

describe('TargetSiteSchema', () => {
  const site = defaultTargetSite(now);

  it.each(['javascript:alert(1)', 'http://www.onlinejobs.ph/', 'file:///c:/x', 'not a url'])(
    'rejects url %s',
    (url) => {
      expect(TargetSiteSchema.safeParse({ ...site, url }).success).toBe(false);
    },
  );

  it('trims the label and rejects empty labels', () => {
    expect(TargetSiteSchema.parse({ ...site, label: '  OLJ  ' }).label).toBe('OLJ');
    expect(TargetSiteSchema.safeParse({ ...site, label: '   ' }).success).toBe(false);
  });
});

describe('SearchKeywordsSchema', () => {
  it('rejects case-insensitive duplicates', () => {
    expect(
      SearchKeywordsSchema.safeParse({ include: ['React', 'react'], exclude: [] }).success,
    ).toBe(false);
  });

  it('rejects empty keywords', () => {
    expect(SearchKeywordsSchema.safeParse({ include: ['  '], exclude: [] }).success).toBe(false);
  });
});

describe('JobPostingSchema', () => {
  it('accepts a minimal job with optional fields absent', () => {
    const parsed = JobPostingSchema.parse(sampleJob());
    expect(parsed.company).toBeUndefined();
  });

  it('requires title, http(s) source URL and ISO extractedAt', () => {
    expect(JobPostingSchema.safeParse(sampleJob({ title: ' ' })).success).toBe(false);
    expect(JobPostingSchema.safeParse(sampleJob({ sourceUrl: 'javascript:void 0' })).success).toBe(
      false,
    );
    expect(JobPostingSchema.safeParse(sampleJob({ extractedAt: 'yesterday' })).success).toBe(false);
  });

  it('rejects empty-string optional fields instead of storing fabricated blanks', () => {
    expect(JobPostingSchema.safeParse(sampleJob({ company: '' })).success).toBe(false);
  });
});

describe('JobMatchSchema', () => {
  const match = {
    id: 'm1',
    jobId: 'job-1',
    profileId: 'p1',
    profileVersion: 1,
    score: 70,
    strengths: [{ claim: 'Has VA experience', evidence: ['3 years as a virtual assistant'] }],
    gaps: [],
    uncertainties: [],
    unsupportedClaims: [],
    rationale: 'Estimate based on profile.',
    injectionSuspected: false,
    basedOnSnippet: false,
    jobContentHash: 'abc',
    model: 'claude-opus-5-5',
    evaluatedAt: '2026-11-08T00:00:00.000Z',
  };

  it('accepts a valid match and rejects out-of-range scores', () => {
    expect(JobMatchSchema.safeParse(match).success).toBe(true);
    expect(JobMatchSchema.safeParse({ ...match, score: 101 }).success).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, score: 50.5 }).success).toBe(false);
  });

  it('rejects a strength without evidence (claims must cite the profile)', () => {
    expect(
      JobMatchSchema.safeParse({ ...match, strengths: [{ claim: 'Knows Python', evidence: [] }] })
        .success,
    ).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, strengths: ['plain string'] }).success).toBe(false);
  });
});

describe('ApplicationDraftSchema', () => {
  const draft = {
    id: 'd1',
    jobId: 'job-1',
    profileId: 'p1',
    profileVersion: 2,
    coverLetter: 'Hello, I have 5 years as a VA.',
    coverLetterEvidence: [{ paragraph: 'I have 5 years as a VA.', evidence: ['5 years as a VA'] }],
    removedStatements: [],
    answers: [
      {
        question: 'Expected salary?',
        answer: '',
        status: 'sensitive',
        evidence: [],
        sensitiveCategory: 'compensation',
      },
      { question: 'Tools you use?', answer: 'Zendesk', status: 'answered', evidence: ['Zendesk'] },
    ],
    postInstructions: [],
    injectionSuspected: false,
    editedByUser: false,
    status: 'draft',
    jobContentHash: 'abc',
    model: 'claude-opus-5-5',
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  };

  it('accepts a valid draft and rejects unknown statuses', () => {
    expect(ApplicationDraftSchema.safeParse(draft).success).toBe(true);
    expect(ApplicationDraftSchema.safeParse({ ...draft, status: 'sent' }).success).toBe(false);
  });

  it('cover letter evidence entries must cite at least one quote', () => {
    expect(
      ApplicationDraftSchema.safeParse({
        ...draft,
        coverLetterEvidence: [{ paragraph: 'x', evidence: [] }],
      }).success,
    ).toBe(false);
  });

  it('migrates v1 drafts, keeping v1 answers as user-written text', () => {
    const v2 = migrateDraftsV1toV2({
      d1: {
        id: 'd1',
        jobId: 'j',
        profileId: 'p',
        profileVersion: 1,
        answers: { 'Why us?': 'Because.' },
        evidence: {},
        unknownQuestions: ['Salary?'],
        status: 'draft',
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    }) as Record<string, unknown>;
    const parsed = ApplicationDraftSchema.safeParse(v2.d1);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.answers.map((a) => a.status)).toEqual(['user_written', 'unknown']);
  });
});

describe('ProfileStateSchema', () => {
  it('accepts an empty state and rejects version 0', () => {
    expect(ProfileStateSchema.safeParse({ current: null, history: [] }).success).toBe(true);
    const bad = { id: 'p', version: 0, content: '', updatedAt: '2026-11-08T00:00:00.000Z' };
    expect(ProfileStateSchema.safeParse({ current: bad, history: [] }).success).toBe(false);
  });
});
