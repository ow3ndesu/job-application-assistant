// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { parseHtml, snapshotPage } from './capture';

describe('snapshotPage (runs in the job page)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('strips scripts, styles, frames and inline handlers, keeping job text', () => {
    document.body.innerHTML = `
      <button type="button" onclick="window.history.back()">Back</button>
      <h1 class="job__title" onmouseover="steal()">English Teacher</h1>
      <script>window.evil = 1</script>
      <style>.x{}</style>
      <object data="x.swf"></object><embed src="x.swf">
      <a href="javascript:alert(1)">bad link</a>
      <a href="/jobseekers/job/x-1">good link</a>
      <img src="/a.png" onerror="steal()">`;
    const { html, url } = snapshotPage();
    expect(url).toBe(location.href);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/<script|<style|<object|<embed/i);
    expect(html).not.toContain('javascript:');
    expect(html).toContain('English Teacher');
    expect(html).toContain('href="/jobseekers/job/x-1"');
  });

  it('does not modify the live page', () => {
    document.body.innerHTML = '<button onclick="go()">Go</button><script>1</script>';
    snapshotPage();
    expect(document.querySelector('button')?.getAttribute('onclick')).toBe('go()');
    expect(document.querySelector('script')).not.toBeNull();
  });

  it('the sanitized HTML parses into an inert document', () => {
    document.body.innerHTML = '<p id="job-description">Text</p>';
    const doc = parseHtml(snapshotPage().html);
    expect(doc.querySelector('#job-description')?.textContent).toBe('Text');
  });
});
