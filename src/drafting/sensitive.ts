import type { SensitiveCategory } from '@/core/schemas';

/**
 * Questions the extension must never answer for the user. Classified in code
 * (deterministic); sensitive questions are not even sent to the AI provider.
 */
const RULES: [SensitiveCategory, RegExp][] = [
  [
    'legal_attestation',
    /\b(certify|attest|declare|declaration|affirm|i agree|do you agree|consent|terms (and|&) conditions|privacy policy|acknowledge|under penalty|e-?signature|signature|background check|authori[sz]e (us|the company|a check))\b/i,
  ],
  [
    'demographic',
    /\b(gender|sex|race|racial|ethnic|ethnicity|religion|religious|age|how old|date of birth|birth ?date|dob|marital|married|pregnan\w*|sexual orientation|disabilit\w*|veteran|nationality|citizenship|political)\b/i,
  ],
  [
    'work_authorization',
    /\b(work(ing)? (permit|authori[sz]ation|visa)|visa|sponsor(ship)?|authori[sz]ed to work|legally (allowed|able|eligible) to work|right to work|immigration)\b/i,
  ],
  [
    'criminal_history',
    /\b(criminal|convicted|conviction|arrest(ed)?|felony|misdemeanou?r|police (record|clearance)|nbi clearance)\b/i,
  ],
  [
    'health',
    /\b(medical|health condition|illness|medication|vaccinat\w*|mental health|drug test)\b/i,
  ],
  [
    'compensation',
    /\b(salary|wage|compensation|expected (pay|rate)|current (pay|rate)|desired (pay|rate)|hourly rate|monthly rate|rate per hour|asking rate|how much (do|would|will) you (charge|expect|ask))\b/i,
  ],
  [
    'identity_or_financial',
    /\b(ssn|social security|tin|tax (id|identification)|passport|national id|government id|id number|bank (account|details)|paypal|gcash|credit card|password|otp|pin code)\b/i,
  ],
];

export function classifySensitive(question: string): SensitiveCategory | undefined {
  return RULES.find(([, re]) => re.test(question))?.[0];
}

export const SENSITIVE_LABEL: Record<SensitiveCategory, string> = {
  legal_attestation: 'Legal declaration or consent',
  demographic: 'Personal / demographic information',
  work_authorization: 'Work authorization',
  criminal_history: 'Criminal history / clearance',
  health: 'Health information',
  compensation: 'Pay expectations or history',
  identity_or_financial: 'ID or financial details',
};
