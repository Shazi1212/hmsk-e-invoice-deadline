/* UI for the e-invoice deadline checker. Logic lives in logic.js, texts in i18n.js. */
(function () {
  'use strict';
  var L = window.EInvoiceDeadline;
  var I = window.EID_I18N;
  var CFG = window.EID_CONFIG || {};
  var SITE = CFG.siteBase || '';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var lang = pickLang();
  var answers = L.fromHash(location.hash);
  var today = L.todayISO();

  function pickLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'de' || q === 'en') return q;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return /^de\b/i.test(nav) ? 'de' : 'en';
  }
  function t(key, vars) {
    var s = I[lang][key];
    if (s === undefined) s = I.en[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmtDate(iso) {
    var p = iso.split('-');
    return new Intl.DateTimeFormat(t('locale'), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])));
  }
  function daysUntil(iso) {
    var a = today.split('-'), b = iso.split('-');
    return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  }
  function chipFor(iso) {
    var n = daysUntil(iso);
    if (n < 0) return '<span class="chip chip--on">' + esc(t('chip_done')) + '</span>';
    if (n === 0) return '<span class="chip chip--on">' + esc(t('chip_today')) + '</span>';
    return '<span class="chip">' + esc(t('chip_next', { n: n })) + '</span>';
  }
  function link(href) { return SITE + href; }
  function resultUrl() {
    return location.origin + location.pathname + (lang === 'de' ? '?lang=de' : '') + L.toHash(answers);
  }

  // ---------- static texts ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('#lnkHome').href = link(t('home_href'));
    $('#lnkImprint').href = link(t('imprint_href'));
    $('#lnkImprint').textContent = t('imprint');
    $('#lnkPrivacy').href = link(t('privacy_href'));
    $('#lnkPrivacy').textContent = t('privacy');
    $('#sourcesList').innerHTML = t('src').map(function (s) {
      return '<li><a href="' + esc(s[1]) + '" rel="noopener" target="_blank">' + esc(s[0]) + '</a><span class="src-url">' + esc(s[1]) + '</span></li>';
    }).join('');
  }

  // ---------- questions ----------
  function syncForm() {
    var rel = L.relevant(answers);
    $$('.q').forEach(function (fs) {
      var k = fs.getAttribute('data-q');
      fs.hidden = rel.indexOf(k) === -1;
      $$('input', fs).forEach(function (inp) { inp.checked = answers[k] === inp.value; });
    });
  }
  function onChange(e) {
    var inp = e.target;
    if (!inp || inp.type !== 'radio') return;
    answers[inp.name] = inp.value;
    // drop answers that no longer matter, so the shared link stays clean
    var rel = L.relevant(answers);
    Object.keys(answers).forEach(function (k) { if (rel.indexOf(k) === -1) delete answers[k]; });
    writeHash();
    syncForm();
    render();
  }
  function writeHash() {
    var h = L.toHash(answers);
    history.replaceState(null, '', location.pathname + location.search + (h || ''));
  }

  // ---------- result ----------
  function render() {
    var r = L.evaluate(answers);
    var body = $('#resultBody');
    var narrow = window.matchMedia('(max-width: 879px)').matches;
    if (!r.complete) {
      body.innerHTML = '<p class="dim">' + esc(t(narrow ? 'pending_m' : 'pending')) + '</p>';
      return;
    }
    var html = [];
    var uses = window.HMSKMoment ? HMSKMoment.use('e-invoice-deadline') : 0; // email is offered from the second use on

    // verdict
    var v;
    if (r.issue === 'not-required') v = t('verdict_receive');
    else if (r.issue === 'unsure') v = t('verdict_unsure', { d: fmtDate(r.deadline), d2: fmtDate(r.altDeadline) });
    else if (daysUntil(r.deadline) <= 0) v = t('verdict_since', { d: fmtDate(r.deadline) });
    else v = t(r.reason === 'large' ? 'verdict_large' : 'verdict_small', { d: fmtDate(r.deadline) });
    html.push('<p class="verdict">' + esc(v) + '</p>');

    // timeline
    var rows = [];
    rows.push(row(r.receive, t('tl_receive'), t('tl_receive_d'), chipFor(r.receive)));
    if (r.issue === 'not-required') {
      rows.push(row(null, t('tl_nosend'), t('nosend_' + r.reason.replace('-', '_')), '<span class="chip">' + esc(t('tl_nosend_v')) + '</span>'));
    } else {
      if (daysUntil(r.paperUntil) >= 0) {
        rows.push(row(null, t('tl_paper'), t('tl_paper_d', { d: fmtDate(r.paperUntil) }), '<span class="chip">' + esc(t('chip_until')) + '</span>'));
      }
      if (r.issue === 'unsure') {
        rows.push(row(r.deadline, t('tl_send_unsure'), t('tl_send_unsure_d'), chipFor(r.deadline), true));
        rows.push(row(r.altDeadline, t('tl_send_unsure2'), '', chipFor(r.altDeadline)));
      } else {
        rows.push(row(r.deadline, t('tl_send'), t(r.reason === 'large' ? 'tl_send_large_d' : 'tl_send_small_d'), chipFor(r.deadline), true));
      }
    }
    html.push('<ol class="tl">' + rows.join('') + '</ol>');

    // to-dos
    var todos = ['todo_receive'];
    if (r.issue !== 'not-required') todos.push('todo_software', 'todo_test');
    if (r.issue === 'unsure') todos.push('todo_turnover');
    if (r.reason === 'kleinunternehmer') todos.push('todo_status');
    todos.push('todo_archive', 'todo_advisor');
    html.push('<h2 class="h2">' + esc(t('todo_title')) + '</h2><ul class="todo">' +
      todos.map(function (k) { return '<li>' + esc(t(k, { d: r.deadline ? fmtDate(r.deadline) : '' })) + '</li>'; }).join('') + '</ul>');

    // reminder
    var rem = L.reminderDate(r.deadline, today);
    var primary = rem ? 'ics' : 'invoice';
    html.push('<h2 class="h2">' + esc(t(rem ? 'rem_title' : 'upd_title')) + '</h2><div class="rem">');
    if (rem) {
      html.push('<button type="button" class="btn btn--main" id="icsBtn">' + esc(t('rem_btn')) + '</button>' +
        '<p class="small">' + esc(t(rem.late ? 'rem_late' : 'rem_desc', { d: fmtDate(rem.date) })) + '</p>');
    }
    if (uses >= 2) html.push('<div id="emBox"></div>');
    html.push('</div>');

    // next step
    html.push('<h2 class="h2">' + esc(t('next_title')) + '</h2><div class="next">' +
      '<a class="btn ' + (primary === 'invoice' ? 'btn--main' : 'btn--line') + '" href="' + esc(link(t('invoice_href'))) + '">' + esc(t('next_invoice')) + ' &rarr;</a>' +
      '<p class="small">' + esc(t('next_invoice_d')) + '</p>' +
      '<a class="btn btn--line" href="' + esc(link(t('checker_href'))) + '">' + esc(t('next_checker')) + ' &rarr;</a>' +
      '<p class="small">' + esc(t('next_checker_d')) + '</p></div>');

    // share + print
    html.push('<div class="tools"><button type="button" class="linkish" id="shareBtn">' + esc(t('share')) + '</button>' +
      '<button type="button" class="linkish" id="printBtn">' + esc(t('print')) + '</button><span class="dim small" id="shareMsg" role="status"></span></div>');

    body.innerHTML = html.join('');
    if (rem) $('#icsBtn').addEventListener('click', function () { downloadICS(r, rem); });
    if (uses >= 2) emailMoment(r, rem);
    $('#shareBtn').addEventListener('click', share);
    $('#printBtn').addEventListener('click', function () { window.print(); });
  }

  // Second use: an email reminder three months before the deadline (only the date and its label are sent),
  // or, without a deadline ahead, an email when the rules change.
  function emailMoment(r, rem) {
    var o = { lang: lang, action: link('/email/subscribe.php'), privacy: link(t('privacy_href')) + '#newsletter',
      source: '/apps/e-invoice-deadline/' };
    if (rem) {
      o.topic = 'e-invoice-reminder'; o.consent = 'own'; o.topicName = t('em_topic');
      o.title = t('rem_mail'); o.intro = t('rem_mail_d');
      o.items = [{ date: r.deadline, label: t('em_label'), kind: 'deadline', text: t('em_item', { d: fmtDate(r.deadline) }) }];
    } else {
      o.topic = 'e-invoice-deadline'; o.consent = 'topic'; o.topicName = t('em_topic_upd');
      o.title = t('upd_mail'); o.intro = t('upd_mail_d');
    }
    HMSKMoment.render($('#emBox'), o);
  }

  function row(date, title, desc, chip, strong) {
    return '<li class="tl__row' + (strong ? ' tl__row--key' : '') + '">' +
      '<span class="tl__date">' + (date ? esc(fmtDate(date)) : '&nbsp;') + '</span>' +
      '<span class="tl__what"><b>' + esc(title) + '</b> ' + chip + (desc ? '<span class="tl__desc">' + esc(desc) + '</span>' : '') + '</span></li>';
  }

  function downloadICS(r, rem) {
    var key = r.reason === 'large' ? 'ics_summary_large' : r.reason === 'small' ? 'ics_summary_small' : 'ics_summary_unsure';
    var desc = (r.issue === 'unsure' ? t('ics_desc_unsure') : '') +
      t('ics_desc', { d: fmtDate(r.deadline), url: L.INVOICE_URL, result: resultUrl() });
    var ics = L.buildICS({ date: rem.date, summary: t(key), description: desc, url: L.INVOICE_URL });
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'e-invoice-reminder-' + rem.date + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function share() {
    var url = resultUrl();
    var msg = $('#shareMsg');
    var done = function () { msg.textContent = t('copied'); setTimeout(function () { msg.textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt(t('share'), url); });
    } else {
      window.prompt(t('share'), url);
    }
  }

  // ---------- wiring ----------
  $('#questions').addEventListener('change', onChange);
  $('#resetBtn').addEventListener('click', function () { answers = {}; writeHash(); syncForm(); render(); });
  $$('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.getAttribute('data-lang');
      var u = new URL(location.href);
      if (lang === 'de') u.searchParams.set('lang', 'de'); else u.searchParams.set('lang', 'en');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      applyLang(); render();
    });
  });
  window.addEventListener('hashchange', function () { answers = L.fromHash(location.hash); syncForm(); render(); });

  applyLang();
  syncForm();
  render();
})();
