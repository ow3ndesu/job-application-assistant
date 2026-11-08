import type { Clock } from '@/core/domain';
import type { Settings } from '@/core/schemas';
import { draftId } from '@/core/schemas';
import { draftApplication as defaultDraftApplication } from '@/drafting/draft-application';
import { matchJob as defaultMatchJob } from '@/matching/match-job';
import type { AIProvider } from '@/providers/ai/types';
import { aiError } from '@/providers/ai/types';
import type { Repositories } from '@/storage';
import { BackgroundRequestSchema, type BackgroundError, type BackgroundResponse } from './protocol';

export interface HandlerDeps {
  repos: Pick<Repositories, 'settings' | 'secrets' | 'jobs' | 'matches' | 'profile' | 'drafts'>;
  createProvider: (settings: Settings, apiKey: string) => AIProvider;
  /** Origin prefix of this extension's own pages, e.g. chrome-extension://<id>/ */
  extensionOrigin: string;
  clock: Clock;
  matchJob?: typeof defaultMatchJob;
  draftApplication?: typeof defaultDraftApplication;
  timeoutMs?: number;
  /** Overall limit for a match request (includes SDK retries). */
  matchTimeoutMs?: number;
}

export interface SenderInfo {
  id?: string | undefined;
  url?: string | undefined;
}

const fail = (
  kind: BackgroundError['kind'],
  message: string,
  detail?: string,
): BackgroundResponse => ({
  ok: false,
  error: { kind, message, ...(detail ? { detail } : {}) },
});

/**
 * Handles messages from extension UI pages. Rejects anything from content
 * scripts or other extensions: AI calls use the user's key and must only be
 * triggered from the extension's own pages.
 */
export function createBackgroundHandler(deps: HandlerDeps) {
  const matchJob = deps.matchJob ?? defaultMatchJob;
  const draftApplication = deps.draftApplication ?? defaultDraftApplication;
  /** One evaluation per job at a time. */
  const inFlight = new Set<string>();

  return async function handle(
    message: unknown,
    sender: SenderInfo,
    ownId: string,
  ): Promise<BackgroundResponse> {
    if (sender.id !== ownId || !sender.url?.startsWith(deps.extensionOrigin)) {
      return fail('unauthorized_sender', 'Request not allowed.');
    }
    const parsed = BackgroundRequestSchema.safeParse(message);
    if (!parsed.success) return fail('bad_message', 'Unknown request.');

    try {
      const request = parsed.data;
      switch (request.type) {
        case 'ai/validate-key': {
          const apiKey = await deps.repos.secrets.getAnthropicApiKeyForProvider();
          if (!apiKey) return { ok: false, error: aiError('missing_key') };
          const provider = deps.createProvider(await deps.repos.settings.get(), apiKey);
          const result = await provider.validateCredentials(
            AbortSignal.timeout(deps.timeoutMs ?? 30_000),
          );
          return result.ok
            ? { ok: true, model: result.value.model }
            : fail(result.error.kind, result.error.message, result.error.detail);
        }

        case 'ai/match-job': {
          const profile = await deps.repos.profile.getCurrent();
          if (!profile || !profile.content.trim()) {
            return fail(
              'no_profile',
              'Add your applicant profile in Settings before checking fit.',
            );
          }
          const job = await deps.repos.jobs.get(request.jobId);
          if (!job) return fail('job_not_found', 'That job is no longer saved.');
          const apiKey = await deps.repos.secrets.getAnthropicApiKeyForProvider();
          if (!apiKey) return { ok: false, error: aiError('missing_key') };
          if (inFlight.has(job.id)) return fail('busy', 'This job is already being checked.');

          inFlight.add(job.id);
          try {
            const provider = deps.createProvider(await deps.repos.settings.get(), apiKey);
            const result = await matchJob(
              provider,
              job,
              profile,
              deps.clock,
              AbortSignal.timeout(deps.matchTimeoutMs ?? 300_000),
            );
            if (!result.ok)
              return fail(result.error.kind, result.error.message, result.error.detail);
            const saved = await deps.repos.matches.upsert(result.value);
            return { ok: true, match: saved };
          } finally {
            inFlight.delete(job.id);
          }
        }

        case 'ai/draft-application': {
          const profile = await deps.repos.profile.getCurrent();
          if (!profile || !profile.content.trim()) {
            return fail('no_profile', 'Add your applicant profile in Settings before drafting.');
          }
          const job = await deps.repos.jobs.get(request.jobId);
          if (!job) return fail('job_not_found', 'That job is no longer saved.');
          const apiKey = await deps.repos.secrets.getAnthropicApiKeyForProvider();
          if (!apiKey) return { ok: false, error: aiError('missing_key') };
          const existing = await deps.repos.drafts.get(draftId(job.id, profile.version));
          if (existing?.editedByUser && !request.replaceEdited) {
            return fail(
              'draft_edited',
              'You edited this draft. Confirm to replace it with a new one.',
            );
          }
          const key = `draft:${job.id}`;
          if (inFlight.has(key))
            return fail('busy', 'A draft for this job is already being written.');

          inFlight.add(key);
          try {
            const provider = deps.createProvider(await deps.repos.settings.get(), apiKey);
            const result = await draftApplication(
              provider,
              job,
              profile,
              request.questions,
              deps.clock,
              AbortSignal.timeout(deps.matchTimeoutMs ?? 300_000),
            );
            if (!result.ok)
              return fail(result.error.kind, result.error.message, result.error.detail);
            const saved = await deps.repos.drafts.upsert(result.value);
            return { ok: true, draft: saved };
          } finally {
            inFlight.delete(key);
          }
        }
      }
    } catch {
      return fail('internal', 'Something went wrong. Try reloading the extension.');
    }
  };
}
