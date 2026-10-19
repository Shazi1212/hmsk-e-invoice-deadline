'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/logic.js');

// Every combination of answers, including unanswered (undefined) for each question.
function* allAnswers() {
  const opts = (k) => [undefined, ...L.QUESTIONS[k]];
  for (const b2b of opts('b2b')) for (const ku of opts('ku')) for (const ex of opts('ex')) for (const to of opts('to')) {
    const a = {};
    if (b2b) a.b2b = b2b; if (ku) a.ku = ku; if (ex) a.ex = ex; if (to) a.to = to;
    yield a;
  }
}

function expected(a) {
  if (a.b2b === undefined) return { complete: false };
  if (a.b2b === 'n') return { complete: true, issue: 'not-required', reason: 'no-b2b', deadline: null };
  if (a.ku === undefined) return { complete: false };
  if (a.ku === 'y') return { complete: true, issue: 'not-required', reason: 'kleinunternehmer', deadline: null };
  if (a.ex === undefined) return { complete: false };
  if (a.ex === 'y') return { complete: true, issue: 'not-required', reason: 'exempt', deadline: null };
  if (a.to === undefined) return { complete: false };
  if (a.to === 'y') return { complete: true, issue: 'mandatory', reason: 'large', deadline: '2027-01-01', paperUntil: '2026-12-31' };
  if (a.to === 'n') return { complete: true, issue: 'mandatory', reason: 'small', deadline: '2028-01-01', paperUntil: '2027-12-31' };
  return { complete: true, issue: 'unsure', reason: 'unsure', deadline: '2027-01-01', altDeadline: '2028-01-01' };
}

test('every combination of answers gives the expected result', () => {
  let n = 0;
  for (const a of allAnswers()) {
    n++;
    const r = L.evaluate(a);
    const e = expected(a);
    assert.equal(r.receive, '2025-01-01', 'receiving applies to everyone');
    assert.equal(r.complete, e.complete, JSON.stringify(a));
    if (!e.complete) { assert.equal(r.issue, 'pending'); assert.equal(r.deadline, null); continue; }
    for (const k of Object.keys(e)) assert.equal(r[k], e[k], k + ' for ' + JSON.stringify(a));
    if (r.issue === 'mandatory' || r.issue === 'unsure') assert.equal(r.ediUntil, '2027-12-31');
    else assert.equal(r.ediUntil, null);
  }
  assert.equal(n, 3 * 3 * 3 * 4);
});

test('relevant questions follow the answers', () => {
  assert.deepEqual(L.relevant({}), ['b2b']);
  assert.deepEqual(L.relevant({ b2b: 'n', ku: 'n', ex: 'n', to: 'y' }), ['b2b']);
  assert.deepEqual(L.relevant({ b2b: 'y' }), ['b2b', 'ku']);
  assert.deepEqual(L.relevant({ b2b: 'y', ku: 'y' }), ['b2b', 'ku']);
  assert.deepEqual(L.relevant({ b2b: 'y', ku: 'n' }), ['b2b', 'ku', 'ex']);
  assert.deepEqual(L.relevant({ b2b: 'y', ku: 'n', ex: 'n' }), ['b2b', 'ku', 'ex', 'to']);
});

test('answers to irrelevant questions do not change the result', () => {
  const base = L.evaluate({ b2b: 'y', ku: 'y' });
  assert.deepEqual(L.evaluate({ b2b: 'y', ku: 'y', to: 'y', ex: 'n' }), base);
});

test('invalid values are ignored', () => {
  assert.deepEqual(L.clean({ b2b: 'maybe', ku: 'n', x: 'y' }), { ku: 'n' });
  assert.equal(L.evaluate({ b2b: 'yes' }).complete, false);
});

test('hash round trip for every combination', () => {
  for (const a of allAnswers()) {
    const h = L.toHash(a);
    assert.deepEqual(L.fromHash(h), L.clean(a));
    if (Object.keys(a).length) assert.match(h, /^#[a-z0-9=&]+$/);
  }
  assert.deepEqual(L.fromHash('#b2b=y&ku=n&ex=n&to=u'), { b2b: 'y', ku: 'n', ex: 'n', to: 'u' });
  assert.deepEqual(L.fromHash('#<script>=1&to=zz'), {});
});

test('reminder is three months before the deadline', () => {
  assert.deepEqual(L.reminderDate('2027-01-01', '2026-01-15'), { date: '2026-10-01', late: false });
  assert.deepEqual(L.reminderDate('2028-01-01', '2026-10-19'), { date: '2027-10-01', late: false });
});

test('reminder moves to tomorrow when three months before has passed', () => {
  assert.deepEqual(L.reminderDate('2027-01-01', '2026-10-19'), { date: '2026-10-20', late: true });
  assert.deepEqual(L.reminderDate('2027-01-01', '2026-10-01'), { date: '2026-10-02', late: true });
  assert.deepEqual(L.reminderDate('2027-01-01', '2026-12-31'), { date: '2027-01-01', late: true });
  assert.equal(L.reminderDate('2027-01-01', '2027-01-01'), null);
  assert.equal(L.reminderDate(null, '2026-01-01'), null);
});

test('date helpers handle month and year ends', () => {
  assert.equal(L.addMonths('2028-01-01', -3), '2027-10-01');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.addDays('2028-02-28', 1), '2028-02-29');
});

// ---------- ICS ----------
const now = new Date(Date.UTC(2026, 9, 19, 8, 5, 3));
const ics = L.buildICS({
  date: '2027-10-01',
  summary: 'E-Rechnung: Versandpflicht ab 1. Januar 2028, jetzt vorbereiten',
  description: 'From 1 January 2028 you must send e-invoices (XRechnung or ZUGFeRD) to businesses in Germany; check your software, archive 8 years.\nFree invoice tool with XRechnung export: ' + L.INVOICE_URL,
  uid: 'test-uid@hmsk.life',
  now,
});

test('ICS uses CRLF only and ends with CRLF', () => {
  assert.ok(ics.endsWith('\r\n'));
  assert.equal(ics.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF');
  assert.equal(ics.replace(/\r\n/g, '').includes('\r'), false, 'no bare CR');
});

test('ICS lines are at most 75 octets and unfold to the original', () => {
  const lines = ics.split('\r\n').slice(0, -1);
  for (const l of lines) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, 'too long: ' + l);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:E-Rechnung: Versandpflicht ab 1. Januar 2028\\, jetzt vorbereiten'));
  assert.ok(unfolded.includes('\\nFree invoice tool with XRechnung export: ' + L.INVOICE_URL));
  assert.ok(unfolded.includes('(XRechnung or ZUGFeRD) to businesses in Germany\\; check'));
});

test('ICS has the required structure and properties', () => {
  const u = ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
  assert.equal(u[0], 'BEGIN:VCALENDAR');
  assert.equal(u[u.length - 1], 'END:VCALENDAR');
  const has = (p) => u.some((l) => l === p || l.startsWith(p));
  ['VERSION:2.0', 'PRODID:', 'BEGIN:VEVENT', 'END:VEVENT', 'BEGIN:VALARM', 'END:VALARM', 'ACTION:DISPLAY', 'TRIGGER'].forEach((p) => assert.ok(has(p), p));
  assert.ok(u.includes('UID:test-uid@hmsk.life'));
  assert.ok(u.includes('DTSTAMP:20261019T080503Z'));
  assert.ok(u.includes('DTSTART;VALUE=DATE:20271001'));
  assert.ok(u.includes('DTEND;VALUE=DATE:20271002'));
  assert.ok(u.includes('URL:' + L.INVOICE_URL));
  // VALARM nested inside VEVENT, and the alarm has its required DESCRIPTION
  const ev = u.indexOf('BEGIN:VEVENT'), al = u.indexOf('BEGIN:VALARM'), alEnd = u.indexOf('END:VALARM'), evEnd = u.indexOf('END:VEVENT');
  assert.ok(ev < al && al < alEnd && alEnd < evEnd);
  assert.ok(u.slice(al, alEnd).some((l) => l.startsWith('DESCRIPTION:')));
  // exactly one of each component
  assert.equal(u.filter((l) => l === 'BEGIN:VEVENT').length, 1);
});

test('ICS UID is generated and unique when not given', () => {
  const a = L.buildICS({ date: '2026-10-20', summary: 's', description: 'd' });
  const b = L.buildICS({ date: '2026-10-20', summary: 's', description: 'd' });
  const uid = (s) => /UID:(.+)\r\n/.exec(s)[1];
  assert.match(uid(a), /@hmsk\.life$/);
  assert.notEqual(uid(a), uid(b));
  assert.match(a, /DTSTAMP:\d{8}T\d{6}Z\r\n/);
});

test('folding never splits a multi-byte character', () => {
  const long = 'DESCRIPTION:' + 'Ü'.repeat(100) + '€'.repeat(40) + '😀'.repeat(20);
  const folded = L.fold(long);
  const parts = folded.split('\r\n');
  for (const p of parts) {
    assert.ok(Buffer.byteLength(p, 'utf8') <= 75);
    assert.equal(Buffer.from(p, 'utf8').toString('utf8'), p);
    assert.ok(!/[\uD800-\uDBFF]$/.test(p), 'lone high surrogate at end');
  }
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(L.fold('SHORT:line'), 'SHORT:line');
});

test('text escaping per RFC 5545', () => {
  assert.equal(L.icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});
