import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';

/** Where a proposed profile fact came from. Every source is something the user wrote or confirmed. */
export const ProposalSourceSchema = z.object({
  kind: z.enum(['user_note', 'draft_answer', 'confirmed_claim']),
  /** Human-readable origin, e.g. 'Your answer to "Which CRM?" (Shopify VA)'. */
  label: z.string().trim().min(1).max(300),
  /** The user's own words (or the claim text they confirmed as true). */
  quote: z.string().trim().min(1).max(2_000),
  /** When the user wrote or confirmed it. */
  at: IsoDateTimeSchema,
  /** Candidate key it was created from, so used/dismissed candidates aren't offered again. */
  ref: z.string().max(2_500).optional(),
});

export type ProposalSource = z.infer<typeof ProposalSourceSchema>;

export const ProfileProposalSchema = z.object({
  id: IdSchema,
  /** Markdown heading to add under (without "#"), e.g. "Skills". */
  section: z.string().trim().min(1).max(80),
  /** One line to add as a bullet. Editable by the user before accepting. */
  text: z.string().trim().min(1).max(1_000),
  /** `ai` = phrased by the AI from the user's words; `user` = the user's own wording. */
  phrasedBy: z.enum(['ai', 'user']),
  sources: z.array(ProposalSourceSchema).min(1).max(10),
  status: z.enum(['pending', 'accepted', 'rejected', 'applied']),
  createdAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.optional(),
  /** Profile version created when this proposal was applied. */
  appliedToVersion: z.number().int().min(1).optional(),
});

export type ProfileProposal = z.infer<typeof ProfileProposalSchema>;
