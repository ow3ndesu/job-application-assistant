import { randomIds, systemClock } from '@/core/domain';
import { createDataManagement, getRepositories } from '@/storage';

/** Shared service instances for extension UI pages. */
export const repos = getRepositories();
export const dataManagement = createDataManagement(repos);
export const clock = systemClock;
export const ids = randomIds;
