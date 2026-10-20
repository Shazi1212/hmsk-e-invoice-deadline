# E-Invoice Deadline Checker

Businesses in Germany have to receive e-invoices since 2025 and send them from 2027 or 2028, and most don't know which date applies to them: this checker tells you in four questions.

**Use it free:** https://hmsk.life/tools/e-invoice-deadline/

## What it does

- Asks up to four questions (B2B in Germany? Kleinunternehmer? only small or exempt invoices? total turnover in 2026 above €800,000?) and updates the result as you answer.
- Shows your timeline: receiving since 1 January 2025, sending from 1 January 2027 or 1 January 2028, or "not required, but you must still be able to receive".
- Lists what to do (formats, archiving for 8 years, software check, tax advisor) with links to the BMF FAQ, the BMF letters and the law texts.
- Creates a calendar reminder (.ics, RFC 5545) three months before your deadline, in the browser. Nothing is sent to a server.
- English and German (`?lang=de`), answers in the URL hash so a result can be shared, print-friendly.

## Quick start

It is a static page with no build step and no dependencies.

```sh
python3 -m http.server 8080 --directory public   # then open http://localhost:8080
```

Or copy the `public/` folder to any web server. Site links (tool page, imprint, invoice tool, email signup) point to
`https://hmsk.life`; change `siteBase` in `public/config.js` for your own copy.

## Tests

The decision logic and the .ics generation live in `public/logic.js` (no DOM) and are tested with Node's built-in test runner (Node 18+):

```sh
node --test tests/
```

The tests cover every combination of answers, the reminder date (including "three months before has already passed"),
the shareable hash, and .ics validity (CRLF, 75-octet line folding without splitting UTF-8 characters, UID, DTSTAMP,
all-day DTSTART, VALARM).

## Legal basis

§ 14 UStG and § 27 Abs. 38 UStG (as amended by the Wachstumschancengesetz), § 33, § 34, § 34a UStDV, § 14b UStG,
the BMF letters of 15 October 2024 and 15 October 2025 and the
[BMF FAQ on e-invoicing](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html). State: October 2026.

Not tax advice.

## License

MIT, see [LICENSE](LICENSE). Fonts: Martian Mono and Geist (SIL Open Font License).
