import type { Repositories } from './repositories';

/** User-facing delete/reset operations, grouped by what the user sees. */
export function createDataManagement(repos: Repositories) {
  return {
    /** Profile and all previous versions. */
    deleteProfile: () => repos.profile.clear(),
    /** Saved jobs, their match results (matches reference jobs) and scan history. */
    deleteJobs: async () => {
      await repos.jobs.clear();
      await repos.matches.clear();
      await repos.scans.clear();
    },
    deleteDrafts: () => repos.drafts.clear(),
    /** Settings, target sites (back to the OnlineJobs.ph default) and keywords. */
    resetSettings: async () => {
      await repos.settings.reset();
      await repos.targetSites.reset();
      await repos.searchKeywords.reset();
    },
    removeApiKey: () => repos.secrets.clearAnthropicApiKey(),
    /** Everything, including the API key and quarantined data. */
    deleteEverything: () => repos.clearAll(),

    async summary() {
      const [profile, history, jobs, matches, drafts, hasKey] = await Promise.all([
        repos.profile.getCurrent(),
        repos.profile.listHistory(),
        repos.jobs.list(),
        repos.matches.list(),
        repos.drafts.list(),
        repos.secrets.hasAnthropicApiKey(),
      ]);
      return {
        profileVersions: (profile ? 1 : 0) + history.length,
        jobs: jobs.items.length + jobs.invalid.length,
        matches: matches.items.length + matches.invalid.length,
        drafts: drafts.items.length + drafts.invalid.length,
        hasApiKey: hasKey,
      };
    },
  };
}

export type DataManagement = ReturnType<typeof createDataManagement>;
