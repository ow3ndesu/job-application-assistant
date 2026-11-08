/** Injectable time source so domain logic is deterministic under test. */
export interface Clock {
  now(): Date;
}

/** Injectable id source. */
export interface IdGenerator {
  newId(): string;
}

export const systemClock: Clock = { now: () => new Date() };

export const randomIds: IdGenerator = { newId: () => crypto.randomUUID() };
