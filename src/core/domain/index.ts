// Domain types are inferred from the Zod schemas so the runtime validation and
// the static types can never drift apart.
export type {
  Settings,
  TargetSite,
  SearchKeywords,
  ApplicantProfile,
  ProfileState,
  JobPosting,
  JobMatch,
  ApplicationDraft,
  DraftStatus,
} from '../schemas';
export * from './ports';
