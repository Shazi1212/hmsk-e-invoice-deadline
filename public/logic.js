/* E-invoice deadline checker: decision logic and calendar (.ics) export.
   No DOM access here, so the same file runs in the browser (window.EInvoiceDeadline)
   and in Node for the tests (module.exports).

   Legal basis (as of October 2026):
   - § 14 Abs. 1 and 2 UStG and § 27 Abs. 38 UStG (Wachstumschancengesetz)
   - BMF-Schreiben of 15 Oct 2024 (BStBl I S. 1320) and of 15 Oct 2025
   - BMF FAQ "E-Rechnung": receiving since 2025-01-01 (a mailbox is enough),
     exemptions § 33 UStDV (<= 250 EUR gross), § 34 UStDV (tickets), § 34a UStDV (Kleinunternehmer),
     B2C and tax-free supplies under § 4 Nr. 8 to 29 UStG, retention 8 years (§ 14b UStG). */
(function (root) {
  'use strict';

  var RECEIVE_DATE = '2025-01-01';
  var DEADLINE_LARGE = '2027-01-01'; // prior-year (2026) total turnover > EUR 800,000
  var DEADLINE_ALL = '2028-01-01';
  var THRESHOLD_EUR = 800000;
  var INVOICE_URL = 'https://hmsk.life/tools/invoice/?utm_source=ics&utm_medium=calendar&utm_campaign=e-invoice-deadline';

  // Answer keys and allowed values. Missing key = not answered yet.
  var QUESTIONS = {
    b2b: ['y', 'n'],          // invoices other businesses established in Germany?
    ku: ['y', 'n'],           // Kleinunternehmer under § 19 UStG?
    to: ['y', 'n', 'u'],      // 2026 total turnover above EUR 800,000? (u = not sure)
    ex: ['y', 'n'],           // are ALL B2B invoices exempt (<= 250 EUR gross, tickets, tax-free § 4 Nr. 8-29)?
  };
  var ORDER = ['b2b', 'ku', 'ex', 'to'];

  function clean(answers) {
    var out = {};
    answers = answers || {};
    ORDER.forEach(function (k) {
      if (QUESTIONS[k].indexOf(answers[k]) !== -1) out[k] = answers[k];
    });
    return out;
  }

  // Which questions matter, given the answers so far.
  function relevant(answers) {
    var a = clean(answers);
    var list = ['b2b'];
    if (a.b2b !== 'y') return list;
    list.push('ku');
    if (a.ku !== 'n') return list;
    list.push('ex');
    if (a.ex !== 'n') return list;
    list.push('to');
    return list;
  }

  /* evaluate(answers) -> {
       complete: bool,             all relevant questions answered
       receive: '2025-01-01',      always: every business in Germany must be able to receive
       issue: 'pending' | 'not-required' | 'mandatory' | 'unsure',
       reason: 'no-b2b' | 'kleinunternehmer' | 'exempt' | 'large' | 'small' | 'unsure' | null,
       deadline: 'YYYY-MM-DD' | null,      issuing deadline (earliest possible one when unsure)
       altDeadline: 'YYYY-MM-DD' | null,   the later deadline when unsure
       paperUntil: 'YYYY-MM-DD' | null,    last day paper/PDF (with consent) is allowed
       ediUntil: '2027-12-31' | null,      EDI with consent allowed through this day
     } */
  function evaluate(answers) {
    var a = clean(answers);
    var need = relevant(a);
    var complete = need.every(function (k) { return a[k] !== undefined; });
    var r = { complete: complete, receive: RECEIVE_DATE, issue: 'pending', reason: null,
      deadline: null, altDeadline: null, paperUntil: null, ediUntil: null };
    if (!complete) return r;

    if (a.b2b === 'n') { r.issue = 'not-required'; r.reason = 'no-b2b'; return r; }
    if (a.ku === 'y') { r.issue = 'not-required'; r.reason = 'kleinunternehmer'; return r; }
    if (a.ex === 'y') { r.issue = 'not-required'; r.reason = 'exempt'; return r; }

    r.ediUntil = '2027-12-31';
    if (a.to === 'y') {
      r.issue = 'mandatory'; r.reason = 'large'; r.deadline = DEADLINE_LARGE; r.paperUntil = '2026-12-31';
    } else if (a.to === 'n') {
      r.issue = 'mandatory'; r.reason = 'small'; r.deadline = DEADLINE_ALL; r.paperUntil = '2027-12-31';
    } else {
      r.issue = 'unsure'; r.reason = 'unsure'; r.deadline = DEADLINE_LARGE; r.altDeadline = DEADLINE_ALL;
      r.paperUntil = '2026-12-31';
    }
    return r;
  }

  // ---------- dates (plain YYYY-MM-DD strings, no time zones) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error('Bad date: ' + s);
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function fmt(o) {
    var dt = new Date(Date.UTC(o.y, o.m - 1, o.d));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }
  function addMonths(s, n) { var o = parseDate(s); return fmt({ y: o.y, m: o.m + n, d: o.d }); }
  function addDays(s, n) { var o = parseDate(s); return fmt({ y: o.y, m: o.m, d: o.d + n }); }
  function todayISO(now) {
    now = now || new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  /* reminderDate(deadline, today) -> { date, late }
     Three months before the deadline. If that day is today or already past, the reminder
     goes to tomorrow instead (late = true). Null when the deadline itself has passed. */
  function reminderDate(deadline, today) {
    if (!deadline) return null;
    today = today || todayISO();
    if (deadline <= today) return null;
    var d = addMonths(deadline, -3);
    if (d > today) return { date: d, late: false };
    return { date: addDays(today, 1), late: true };
  }

  // ---------- URL hash (shareable result) ----------
  function toHash(answers) {
    var a = clean(answers);
    var parts = ORDER.filter(function (k) { return a[k] !== undefined; }).map(function (k) { return k + '=' + a[k]; });
    return parts.length ? '#' + parts.join('&') : '';
  }
  function fromHash(hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv.length === 2) out[kv[0]] = kv[1];
    });
    return clean(out);
  }

  // ---------- iCalendar (RFC 5545) ----------
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  // Fold lines longer than 75 octets (UTF-8), never splitting a character.
  function fold(line) {
    var out = [];
    var cur = '';
    var bytes = 0;
    var limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var code = line.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch += line[++i]; }
      var b = utf8Len(ch);
      if (bytes + b > limit) {
        out.push(cur);
        cur = ' ' + ch;
        bytes = 1 + b;
        limit = 75;
      } else {
        cur += ch;
        bytes += b;
      }
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  function stamp(now) {
    now = now || new Date();
    return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
  }
  function randomId() {
    var c = root.crypto || (typeof require === 'function' ? safeRequireCrypto() : null);
    if (c && c.randomUUID) return c.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function safeRequireCrypto() { try { return require('crypto'); } catch (e) { return null; } }

  /* buildICS({ date, summary, description, url, uid?, now? }) -> string with CRLF line ends.
     One all-day event (DTSTART;VALUE=DATE, DTEND the next day) with a display alarm at 09:00. */
  function buildICS(opts) {
    var date = opts.date.replace(/-/g, '');
    var end = addDays(opts.date, 1).replace(/-/g, '');
    var uid = opts.uid || (randomId() + '@hmsk.life');
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//hmsk.life//E-Invoice Deadline Checker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + stamp(opts.now),
      'DTSTART;VALUE=DATE:' + date,
      'DTEND;VALUE=DATE:' + end,
      'SUMMARY:' + icsEscape(opts.summary),
      'DESCRIPTION:' + icsEscape(opts.description),
      'URL:' + (opts.url || INVOICE_URL),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape(opts.summary),
      'TRIGGER;RELATED=START:PT9H',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  var api = {
    QUESTIONS: QUESTIONS, ORDER: ORDER, RECEIVE_DATE: RECEIVE_DATE, DEADLINE_LARGE: DEADLINE_LARGE,
    DEADLINE_ALL: DEADLINE_ALL, THRESHOLD_EUR: THRESHOLD_EUR, INVOICE_URL: INVOICE_URL,
    clean: clean, relevant: relevant, evaluate: evaluate, reminderDate: reminderDate,
    addMonths: addMonths, addDays: addDays, todayISO: todayISO,
    toHash: toHash, fromHash: fromHash,
    icsEscape: icsEscape, fold: fold, buildICS: buildICS,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EInvoiceDeadline = api;
})(typeof window !== 'undefined' ? window : globalThis);
