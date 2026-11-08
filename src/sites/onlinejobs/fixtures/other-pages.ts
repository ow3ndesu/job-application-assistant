/**
 * Small synthetic pages for non-happy paths. Login markers are from the live
 * `/login` page (2026-11-08); the challenge page uses generic, commonly seen
 * markers (not observed on this site).
 */

/** Search page with zero results ("Displaying 0 out of 0"). The real no-results markup was not observed. */
export const LISTING_EMPTY = `<!DOCTYPE html><html><head><title>Online Jobs in the Philippines at OnlineJobs.ph</title></head><body>
<form method="get" action="/jobseekers/jobsearch" id="myform" name="myform"><input name="jobkeyword" value="zzzz"></form>
<div class="results"><p class="fs-12">Displaying 0 out of 0 jobs</p></div></body></html>`;

/** Listing whose card classes changed: the adapter must stop, not guess. */
export const LISTING_CHANGED = `<!DOCTYPE html><html><head><title>Online Jobs in the Philippines at OnlineJobs.ph</title></head><body>
<div class="results"><p>Displaying 2 out of 40 jobs</p>
<a href="/jobseekers/job/new-layout-job-1000010"><article class="job-card-v2"><h2>New Layout Job</h2></article></a>
<a href="/jobseekers/job/another-job-1000011"><article class="job-card-v2"><h2>Another Job</h2></article></a>
</div></body></html>`;

/** Job post whose title element changed. */
export const DETAIL_CHANGED = `<!DOCTYPE html><html><head><title>Something 1000012 - OnlineJobs.ph</title></head><body>
<h1 class="job-heading-v2">Something</h1><div class="desc-v2">Text</div></body></html>`;

/**
 * What `/jobseekers` redirects to when logged out. Like the real page, the form
 * embeds a reCAPTCHA widget; it must be reported as login_required, not blocked.
 */
export const LOGIN_PAGE = `<!DOCTYPE html><html><head><title>Login | OnlineJobs.ph</title></head><body>
<form method="post" action="/authenticate"><input type="email" name="login_email">
<div class="g-recaptcha" data-sitekey="test"></div>
<button type="submit" name="login" value="Login">Login</button></form></body></html>`;

/** A normal listing page that happens to contain a CAPTCHA widget is not a block page. */
export const LISTING_WITH_CAPTCHA_WIDGET_MARKER =
  '<div class="g-recaptcha" data-sitekey="test"></div>';

/** Generic bot-challenge page. */
export const CHALLENGE_PAGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>
<div id="challenge-form">Checking your browser</div></body></html>`;

/** A logged-in area page that is neither a listing nor a job post. */
export const OTHER_PAGE = `<!DOCTYPE html><html><head><title>Dashboard | OnlineJobs.ph</title></head><body><h1>Welcome</h1></body></html>`;
