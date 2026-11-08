import type { ApplicantProfile, Clock, IdGenerator, ProfileState } from '@/core/domain';
import { PROFILE_LIMITS } from '@/core/schemas';
import { StorageError } from './errors';
import type { SingletonRepository } from './singleton-repository';

/**
 * Applicant profile with version history. Every content change creates a new
 * version and keeps the previous one (up to `historyLimit`), so an earlier
 * version can always be restored before/after an AI-proposed update.
 */
export class ProfileRepository {
  constructor(
    private readonly state: SingletonRepository<ProfileState>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly historyLimit: number = PROFILE_LIMITS.historyLimit,
  ) {}

  async getCurrent(): Promise<ApplicantProfile | null> {
    return (await this.state.get()).current;
  }

  /** Previous versions, newest first (excludes the current version). */
  async listHistory(): Promise<ApplicantProfile[]> {
    return (await this.state.get()).history;
  }

  /** Saves new content as a new version. Unchanged content is a no-op. */
  async saveContent(content: string): Promise<ApplicantProfile> {
    const next = await this.state.update((s) => this.withNewVersion(s, content));
    return next.current as ApplicantProfile;
  }

  /** Restores an earlier version's content as a new (latest) version. */
  async restore(version: number): Promise<ApplicantProfile> {
    const next = await this.state.update((s) => {
      const target = s.history.find((p) => p.version === version);
      if (!target) {
        throw new StorageError('not_found', 'profile', `Profile version ${version} not found`);
      }
      return this.withNewVersion(s, target.content);
    });
    return next.current as ApplicantProfile;
  }

  /** Deletes the profile and all history. */
  clear(): Promise<void> {
    return this.state.reset();
  }

  recover(): Promise<string | undefined> {
    return this.state.recover();
  }

  private withNewVersion(s: ProfileState, content: string): ProfileState {
    if (s.current?.content === content) return s;
    const latestVersion = Math.max(0, s.current?.version ?? 0, ...s.history.map((p) => p.version));
    const profile: ApplicantProfile = {
      id: s.current?.id ?? this.ids.newId(),
      version: latestVersion + 1,
      content,
      updatedAt: this.clock.now().toISOString(),
    };
    const history = s.current ? [s.current, ...s.history] : s.history;
    return { current: profile, history: history.slice(0, this.historyLimit) };
  }
}
