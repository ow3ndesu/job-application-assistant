/**
 * OnlineJobs.ph selectors. Evidence: public, logged-out pages inspected on
 * 2026-11-08 (`/jobseekers/jobsearch`, `/jobseekers/job/<slug>-<id>`, and the
 * `/login` page that `/jobseekers` redirects to when logged out). Logged-in
 * markup has NOT been inspected; see PROGRESS.md.
 */
export const OLJ = {
  hosts: ['www.onlinejobs.ph', 'onlinejobs.ph'],
  origin: 'https://www.onlinejobs.ph',

  paths: {
    /** `/jobseekers/job/<slug>-<numericId>` */
    detail: /^\/jobseekers\/job\/([a-z0-9-]*?-?(\d+))\/?$/i,
    /** `/jobseekers/jobsearch`, `/jobseekers/jobsearch/30` (offset pages), `/jobseekers/search/c/<category>` */
    listing: /^\/jobseekers\/(jobsearch(\/\d+)?|search(\/.*)?)\/?$/i,
    search: '/jobseekers/jobsearch',
  },

  /** Search form field name (from `form#myform`). */
  searchKeywordParam: 'jobkeyword',

  /**
   * Listing selectors target the DOM as Chrome builds it, which is what the
   * extension captures. The server sends each card as an `a` wrapping
   * `div.jobpost-cat-box`, with more `a` links nested inside. Nested anchors are
   * invalid, so Chrome restructures each card to (verified 2026-11-08):
   *   div.jobpost-cat-box
   *     a[href=job]           title (h4 + type badge), posted date, pay (dd)
   *     div.desc              a[href=job] (text) + a[target=_blank] ("See More")
   *     div.job-tag           a.badge tags
   */
  listing: {
    card: '.jobpost-cat-box',
    jobLink: 'a[href*="/jobseekers/job/"]',
    title: 'h4',
    titleBadge: 'h4 .badge',
    posted: 'p[data-temp] em',
    compensation: 'dl dd.col',
    description: '.desc',
    /** The "See More" link. The description text itself is also inside an `a`, so only this one is removed. */
    descriptionMore: 'a[target="_blank"]',
    tags: '.job-tag a.badge',
    /** "Displaying 30 out of 276 jobs" */
    countText: /Displaying\s+(\d+)\s+out of\s+(\d+)\s+jobs/i,
    searchForm: 'form#myform',
  },

  detail: {
    title: 'h1.job__title',
    factBlocks: '.job-post dd',
    factLabel: 'h3',
    factValue: 'p',
    description: '#job-description',
    skills: 'a.card-worker-topskill',
  },

  /**
   * Observed: login page title "Login | OnlineJobs.ph" and a `button[name="login"]`.
   * The login form also embeds a reCAPTCHA widget, so login is checked before
   * challenge detection, and a CAPTCHA widget alone never means "blocked".
   */
  login: { titlePrefix: /^login\b/i, marker: '[name="login"]' },

  /**
   * Heuristic, NOT observed on this site: full-page bot-challenge interstitials.
   * If matched we stop and ask the user to resolve it themselves. Nothing is
   * bypassed, and CAPTCHA widgets are never interacted with.
   */
  challenge: {
    titles: [/^just a moment/i, /attention required/i, /^access denied/i],
    markers: '#challenge-form, #cf-challenge-running, .cf-browser-verification',
  },

  /** Values the site shows when a field is not provided. */
  emptyValues: new Set(['n/a', 'na', '-', '--', 'none', 'tbd']),
} as const;
