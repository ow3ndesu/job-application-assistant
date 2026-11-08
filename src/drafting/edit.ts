import type { ApplicationDraft, DraftAnswer, JobPosting } from '@/core/schemas';
import { SENSITIVE_LABEL } from './sensitive';

export interface DraftEdits {
  coverLetter?: string;
  /** Answer text by question index. */
  answers?: Record<number, string>;
}

/**
 * Applies user edits. Any changed answer becomes the user's own
 * (`user_written`); a cleared answer returns to needing an answer. Sensitive
 * answers keep their category so the warning stays visible.
 */
export function applyDraftEdits(
  draft: ApplicationDraft,
  edits: DraftEdits,
  now: Date,
): ApplicationDraft {
  let changed = false;
  const coverLetter = edits.coverLetter ?? draft.coverLetter;
  if (coverLetter !== draft.coverLetter) changed = true;

  const answers: DraftAnswer[] = draft.answers.map((a, i) => {
    const text = edits.answers?.[i];
    if (text === undefined || text === a.answer) return a;
    changed = true;
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        ...a,
        answer: '',
        status: a.sensitiveCategory ? 'sensitive' : 'unknown',
        evidence: [],
      };
    }
    return { ...a, answer: text, status: 'user_written', evidence: [] };
  });

  if (!changed) return draft;
  const needsReview = answers.some((a) => !a.answer.trim()) || !coverLetter.trim();
  return {
    ...draft,
    coverLetter,
    answers,
    editedByUser: true,
    status: needsReview ? 'needs_review' : 'draft',
    updatedAt: now.toISOString(),
  };
}

/** Plain-text export for copying into the site's form or saving. */
export function draftToText(
  draft: ApplicationDraft,
  job: Pick<JobPosting, 'title' | 'sourceUrl'>,
): string {
  const lines = [
    `Application: ${job.title}`,
    job.sourceUrl,
    '',
    draft.coverLetter.trim() || '[No application message yet]',
  ];
  if (draft.answers.length) {
    lines.push('', 'Questions');
    draft.answers.forEach((a, i) => {
      lines.push('', `${i + 1}. ${a.question}`);
      if (a.answer.trim()) lines.push(a.answer.trim());
      else if (a.sensitiveCategory)
        lines.push(
          `[Not answered: ${SENSITIVE_LABEL[a.sensitiveCategory]}. Answer yourself if you choose to.]`,
        );
      else lines.push('[Not answered yet]');
    });
  }
  return `${lines.join('\n')}\n`;
}

export function draftFilename(job: Pick<JobPosting, 'title'>): string {
  const slug = job.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `application-${slug || 'draft'}.txt`;
}
