/// <reference types="jest" />
import { stripActiveContent } from '../relay-html';

describe('stripActiveContent — a relayed report keeps its content and loses what would run', () => {
  it('leaves a report without active content exactly as composed', () => {
    const html = '<div class="report"><h1>333 E 46th St &amp; more</h1><p>A bright two bedroom. Contact &quot;us&quot;.</p><img src="https://cdn.example/1.jpg" alt="one"></div>';
    expect(stripActiveContent(html)).toBe(html);
  });

  it('removes script blocks, inline handlers and javascript: addresses, and nothing else', () => {
    const html = '<p onclick="steal()">Hi</p><script>steal()</script><a href="javascript:steal()">x</a><a href="https://mallan.nyc/listing/1">ok</a><img src=\'javascript:steal()\' onerror=steal()>';
    expect(stripActiveContent(html)).toBe('<p>Hi</p><a href="#">x</a><a href="https://mallan.nyc/listing/1">ok</a><img src=\'#\'>');
  });

  it('is text-safe: a word that only looks like a handler inside the text stays', () => {
    const html = '<p>The onboarding note: "online" and "on time" are words, not attributes.</p>';
    expect(stripActiveContent(html)).toBe(html);
  });
});
