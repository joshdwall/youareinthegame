import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readContact, leadRaw, isEmail } from '../functions/_shared/contact.js';

const html = fs.readFileSync(new URL('../worldmap/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../worldmap/worldmap.css', import.meta.url), 'utf8');

test('globe page puts the contact form under the map for every width', () => {
  const countries = html.indexOf('id="visitor-countries"');
  const contact = html.indexOf('id="contact"');
  assert.ok(countries > 0 && contact > countries);
  assert.match(html, /method="post" action="\/api\/contact"/);
  assert.match(html, /name="company_url"/);
  assert.match(html, /data-sitekey="0x4AAAAAAF1aECr019WDOHBg"/);
  assert.match(html, /data-size="flexible"/);
  assert.match(html, /placeholder="Email"/);
  assert.match(html, /placeholder="Message"/);
  assert.doesNotMatch(html, /Send a note|name="name"/);
  assert.match(css, /calc\(4 \* var\(--country-row-height\)\)/);
  assert.match(css, /caret-color: auto/);
});

test('contact fields reject junk and a filled honeypot, and the lead mail stays plain text', () => {
  assert.equal(isEmail('not-an-email'), false);
  const bad = readContact(new FormData());
  assert.equal(bad.code, 'error');
  const honeypot = new FormData();
  honeypot.set('company_url', 'https://spam.example');
  honeypot.set('email', 'a@b.co');
  honeypot.set('message', 'buy now');
  assert.equal(readContact(honeypot).honeypot, true);
  const good = new FormData();
  good.set('name', 'Ada');
  good.set('email', 'ada@example.com');
  good.set('message', 'Hello from the globe');
  const contact = readContact(good);
  assert.equal(contact.code, 'ok');
  const raw = leadRaw({ from: 'hello@youareinthegame.com', to: 'joshdwall@gmail.com', ...contact, brand: 'You are in the game' });
  assert.match(raw, /Reply-To: ada@example.com/);
  assert.match(raw, /Hello from the globe/);
  assert.doesNotMatch(raw, /<script/);
});
