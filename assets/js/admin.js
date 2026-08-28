/* ============================================================
   admin.js — content manager for the portfolio.
   Edits data/content.json entirely in the browser, then either
   downloads it or commits it to GitHub via the Contents API.
   ============================================================ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var K_PASS  = 'pf:passhash';
  var K_DRAFT = 'pf:draft';
  var K_GH    = 'pf:github';
  var DATA_URL = '../data/content.json';

  var model = null;    /* working copy   */
  var clean = null;    /* last published */
  var tab = 'profile';

  /* ---------- tiny utils ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o == null) ? undefined : o[k];
    }, obj);
  }
  function set(obj, path, val) {
    var ks = path.split('.'), last = ks.pop();
    var t = ks.reduce(function (o, k) {
      if (o[k] == null) o[k] = {};
      return o[k];
    }, obj);
    t[last] = val;
  }

  function toast(msg, kind) {
    var d = document.createElement('div');
    if (kind === 'err') d.className = 'err';
    d.textContent = msg;
    $('#toast').appendChild(d);
    setTimeout(function () { d.remove(); }, kind === 'err' ? 6500 : 3200);
  }

  async function sha256(txt) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /* unicode-safe base64 */
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /* ============================================================
     GATE
     ============================================================ */
  var gate = $('#gate'), shell = $('#shell');

  (function initGate() {
    var stored = localStorage.getItem(K_PASS);
    if (!stored) {
      $('#gate .gate-box h1').textContent = 'Set a passcode';
      $('#gate .gate-box p').textContent =
        'First run. Choose a passcode for this browser — at least 8 characters.';
      $('#unlock').textContent = 'Set passcode';
    }
    if (sessionStorage.getItem('pf:unlocked') === '1' && stored) start();
  })();

  $('#unlock').addEventListener('click', submitPass);
  $('#pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPass(); });

  async function submitPass() {
    var v = $('#pass').value;
    var stored = localStorage.getItem(K_PASS);
    if (!stored) {
      if (v.length < 8) { toast('Use at least 8 characters.', 'err'); return; }
      localStorage.setItem(K_PASS, await sha256(v));
      sessionStorage.setItem('pf:unlocked', '1');
      toast('Passcode set.');
      start();
      return;
    }
    if (await sha256(v) === stored) {
      sessionStorage.setItem('pf:unlocked', '1');
      start();
    } else {
      $('#pass').value = '';
      toast('Wrong passcode.', 'err');
    }
  }

  $('#lockBtn').addEventListener('click', function () {
    sessionStorage.removeItem('pf:unlocked');
    location.reload();
  });

  /* ============================================================
     START
     ============================================================ */
  async function start() {
    gate.classList.add('hide');
    shell.classList.remove('hide');
    try {
      var r = await fetch(DATA_URL + '?v=' + Date.now());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      clean = await r.json();
    } catch (e) {
      toast('Could not load content.json: ' + e.message, 'err');
      return;
    }
    var draft = localStorage.getItem(K_DRAFT);
    if (draft) {
      try { model = JSON.parse(draft); toast('Restored your unsaved draft.'); }
      catch (e) { model = clone(clean); }
    } else {
      model = clone(clean);
    }
    buildTabs();
    renderPane();
    markDirty();
  }

  /* ============================================================
     TABS
     ============================================================ */
  var TABS = [
    { id: 'profile',  label: 'Profile' },
    { id: 'hero',     label: 'Hero' },
    { id: 'socials',  label: 'Social links', count: function () { return (model.socials || []).length; } },
    { id: 'works',    label: 'Works',        count: function () { return (model.works || []).length; } },
    { id: 'services', label: 'Services',     count: function () { return (model.services || []).length; } },
    { id: 'resume',   label: 'Resume',       count: function () {
        return (model.experience || []).length + (model.certifications || []).length +
               (model.education || []).length; } },
    { id: 'skills',   label: 'Skills',       count: function () {
        return (model.skills.featured || []).length +
               (model.skills.groups || []).reduce(function (n, g) { return n + (g.items || []).length; }, 0); } },
    { id: 'contact',  label: 'Contact' },
    { id: 'publish',  label: 'Publish' }
  ];

  function buildTabs() {
    $('#tabs').innerHTML = TABS.map(function (t) {
      var n = t.count ? '<span class="n">' + t.count() + '</span>' : '';
      return '<button class="tab' + (t.id === tab ? ' on' : '') + '" data-tab="' + t.id + '">' +
             esc(t.label) + n + '</button>';
    }).join('');
  }
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    tab = b.dataset.tab;
    buildTabs();
    renderPane();
  });

  /* ============================================================
     FIELD BUILDERS
     ============================================================ */
  function txt(path, label, opts) {
    opts = opts || {};
    var v = get(model, path);
    return '<div class="f"><label for="' + esc(path) + '">' + esc(label) +
      (opts.req ? ' <span class="req">*</span>' : '') + '</label>' +
      '<input id="' + esc(path) + '" data-path="' + esc(path) + '" type="' + (opts.type || 'text') +
      '" value="' + esc(v == null ? '' : v) + '"' +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>' +
      (opts.hint ? '<p class="hint">' + esc(opts.hint) + '</p>' : '') + '</div>';
  }
  function area(path, label, opts) {
    opts = opts || {};
    var v = get(model, path);
    return '<div class="f"><label for="' + esc(path) + '">' + esc(label) + '</label>' +
      '<textarea id="' + esc(path) + '" data-path="' + esc(path) + '"' +
      (opts.rows ? ' rows="' + opts.rows + '"' : '') + '>' + esc(v == null ? '' : v) + '</textarea>' +
      (opts.hint ? '<p class="hint">' + esc(opts.hint) + '</p>' : '') + '</div>';
  }
  function sel(path, label, options) {
    var v = get(model, path);
    return '<div class="f"><label for="' + esc(path) + '">' + esc(label) + '</label>' +
      '<select id="' + esc(path) + '" data-path="' + esc(path) + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></div>';
  }
  function chk(path, label) {
    var v = !!get(model, path);
    return '<label class="check"><input type="checkbox" data-path="' + esc(path) + '"' +
      (v ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }
  function num(path, label, opts) {
    opts = opts || {};
    var v = get(model, path);
    return '<div class="f"><label for="' + esc(path) + '">' + esc(label) + '</label>' +
      '<input id="' + esc(path) + '" data-path="' + esc(path) + '" type="number" ' +
      'min="' + (opts.min != null ? opts.min : 0) + '" max="' + (opts.max != null ? opts.max : 100) +
      '" value="' + esc(v == null ? '' : v) + '">' +
      (opts.hint ? '<p class="hint">' + esc(opts.hint) + '</p>' : '') + '</div>';
  }
  /* editor for an array of plain strings */
  function tags(path, label, ph) {
    var arr = get(model, path) || [];
    return '<div class="f"><label>' + esc(label) + '</label>' +
      '<div class="tagedit" data-tags="' + esc(path) + '">' +
        arr.map(function (t, i) {
          return '<span class="tag">' + esc(t) +
            '<button type="button" data-tagdel="' + esc(path) + '" data-i="' + i + '" aria-label="Remove">×</button></span>';
        }).join('') +
      '</div>' +
      '<div class="f-row"><input type="text" data-tagadd="' + esc(path) + '" placeholder="' +
        esc(ph || 'Type and press Enter') + '">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-tagbtn="' + esc(path) + '">Add</button></div></div>';
  }

  /* generic collapsible list of objects.
     cfg.fixed = true -> reorder only, no add/delete (used for nav, whose
     ids must keep matching the section ids in index.html). */
  function list(path, cfg) {
    var arr = get(model, path) || [];
    if (!arr.length) {
      return '<div class="empty">' + esc(cfg.empty || 'Nothing here yet.') + '</div>' +
             (cfg.fixed ? '' : addBar(path, cfg));
    }
    return '<div class="list">' + arr.map(function (it, i) {
      var p = path + '.' + i;
      return '<div class="item' + (it.visible === false ? ' off' : '') + '" data-item="' + p + '">' +
        '<div class="item-head">' +
          '<span class="caret">▸</span>' +
          '<span class="ttl">' + esc(cfg.title(it, i) || 'Untitled') + '</span>' +
          (cfg.meta ? '<span class="meta">' + esc(cfg.meta(it)) + '</span>' : '') +
          '<span class="acts">' +
            '<button class="iconbtn" type="button" data-move="' + p + '" data-dir="-1" ' +
              (i === 0 ? 'disabled' : '') + ' aria-label="Move up">↑</button>' +
            '<button class="iconbtn" type="button" data-move="' + p + '" data-dir="1" ' +
              (i === arr.length - 1 ? 'disabled' : '') + ' aria-label="Move down">↓</button>' +
            (cfg.fixed ? '' :
              '<button class="iconbtn del" type="button" data-del="' + p + '" aria-label="Delete">✕</button>') +
          '</span>' +
        '</div>' +
        '<div class="item-body">' + cfg.body(p, it, i) + '</div>' +
      '</div>';
    }).join('') + '</div>' + (cfg.fixed ? '' : addBar(path, cfg));
  }
  function addBar(path, cfg) {
    return '<div class="addbar"><button class="btn btn-ghost btn-sm" type="button" ' +
      'data-add="' + esc(path) + '">+ ' + esc(cfg.addLabel || 'Add') + '</button></div>';
  }
  function head(t) {
    return '<div class="subhead"><h3>' + esc(t) + '</h3><div class="line"></div></div>';
  }

  /* ============================================================
     PANES
     ============================================================ */
  var ICONS = Icons.iconOptions;
  var SOCIALS = Icons.socialOptions;

  var PANES = {
    profile: function () {
      return '<div class="grid">' +
          txt('profile.name', 'Full name', { req: true }) +
          txt('profile.initial', 'Avatar initial', { hint: 'Shown while the photo loads.' }) +
        '</div>' +
        txt('profile.avatar', 'Photo URL', { hint: 'A URL, or a path like img/me.jpg' }) +
        '<div class="grid">' +
          txt('profile.location', 'Location') +
          txt('profile.timezone', 'Time zone', { hint: 'IANA name, e.g. Asia/Dhaka' }) +
        '</div>' +
        '<div class="grid">' +
          txt('profile.email', 'Email', { type: 'email' }) +
          txt('profile.phone', 'Phone (display)') +
          txt('profile.phoneRaw', 'Phone (dial)', { hint: 'Digits only, e.g. +8801405090089' }) +
        '</div>' +
        txt('profile.cvUrl', 'CV file', { hint: 'Path to the PDF in your repo.' }) +
        tags('profile.typedRoles', 'Rotating job titles', 'e.g. Network Engineer') +
        head('Availability') +
        chk('profile.available', 'Show the availability badge') +
        txt('profile.availableText', 'Badge text') +
        head('Menu labels') +
        '<div class="note">Rename or reorder the menu. The section each item points to is ' +
        'fixed, so those cannot be added or removed here.</div>' +
        list('nav', {
          fixed: true,
          title: function (n) { return n.label; },
          meta: function (n) { return '#' + n.id; },
          body: function (p, n) {
            return txt(p + '.label', 'Menu label',
              { hint: 'Links to the "' + n.id + '" section.' });
          }
        }) +
        head('Site & SEO') +
        txt('site.title', 'Browser title') +
        area('site.description', 'Meta description', { hint: 'Keep under ~160 characters.' }) +
        txt('site.url', 'Canonical URL') +
        txt('footer.text', 'Footer', { hint: 'Use {year} for the current year.' });
    },

    hero: function () {
      return txt('hero.greeting', 'Greeting') +
        area('hero.headline', 'Headline', { hint: 'Wrap words in {curly braces} to colour them.' }) +
        area('hero.intro', 'Intro paragraph', { rows: 4 }) +
        '<div class="grid">' +
          txt('hero.primaryCta.label', 'Primary button') +
          txt('hero.primaryCta.href', 'Primary link') +
          txt('hero.secondaryCta.label', 'Secondary button') +
          txt('hero.secondaryCta.href', 'Secondary link') +
        '</div>' +
        head('Status panel') +
        txt('hero.statusLabel', 'Panel label') +
        list('hero.stats', {
          addLabel: 'Add statistic',
          empty: 'No statistics yet.',
          title: function (s) { return (s.value || 0) + (s.suffix || '') + ' — ' + (s.label || ''); },
          body: function (p) {
            return '<div class="grid">' + num(p + '.value', 'Number', { max: 1000000 }) +
              txt(p + '.suffix', 'Suffix', { ph: '+ or %' }) + '</div>' +
              txt(p + '.label', 'Label');
          }
        }, { value: 0, suffix: '', label: '' });
    },

    socials: function () {
      return '<div class="note">Icons are matched from the platform you pick. ' +
        'Uncheck <em>Show</em> to hide a link without deleting it.</div>' +
        list('socials', {
          addLabel: 'Add social link',
          empty: 'No social links yet.',
          title: function (s) { return s.label || s.platform; },
          meta: function (s) { return s.visible === false ? 'hidden' : ''; },
          body: function (p) {
            return '<div class="grid">' + sel(p + '.platform', 'Platform', SOCIALS) +
              txt(p + '.label', 'Label', { hint: 'Used for the tooltip and screen readers.' }) + '</div>' +
              txt(p + '.url', 'URL', { ph: 'https://…' }) +
              chk(p + '.visible', 'Show on the site');
          }
        });
    },

    works: function () {
      var cats = (model.workCategories || []).map(function (c) { return c.id; });
      return head('Filter categories') +
        list('workCategories', {
          addLabel: 'Add category',
          empty: 'No categories.',
          title: function (c) { return c.label + '  ·  ' + c.id; },
          body: function (p) {
            return '<div class="grid">' + txt(p + '.id', 'ID', { hint: 'Lowercase, no spaces. Keep "all" first.' }) +
              txt(p + '.label', 'Label') + '</div>';
          }
        }) +
        head('Projects') +
        list('works', {
          addLabel: 'Add project',
          empty: 'No projects yet.',
          title: function (w) { return w.title; },
          meta: function (w) { return w.visible === false ? 'hidden' : w.category; },
          body: function (p, w) {
            return txt(p + '.title', 'Title', { req: true }) +
              '<div class="grid">' +
                sel(p + '.category', 'Category', cats.length ? cats : ['all']) +
                txt(p + '.tag', 'Badge', { hint: 'Small label on the card image.' }) +
                sel(p + '.icon', 'Icon', ICONS) +
              '</div>' +
              area(p + '.summary', 'Description', { rows: 4 }) +
              area(p + '.value', 'Value delivered', { hint: 'Shown in the highlighted callout.' }) +
              tags(p + '.chips', 'Technology chips', 'e.g. Proxmox VE') +
              head('Links') +
              list(p + '.links', {
                addLabel: 'Add link',
                empty: 'No links.',
                title: function (l) { return l.label || l.url; },
                body: function (lp) {
                  return '<div class="grid">' + txt(lp + '.label', 'Label') +
                    txt(lp + '.url', 'URL') + '</div>';
                }
              }) +
              chk(p + '.visible', 'Show on the site');
          }
        });
    },

    services: function () {
      return list('services', {
        addLabel: 'Add service',
        empty: 'No services yet.',
        title: function (s) { return s.title; },
        meta: function (s) { return s.visible === false ? 'hidden' : ''; },
        body: function (p) {
          return txt(p + '.title', 'Title', { req: true }) +
            sel(p + '.icon', 'Icon', ICONS) +
            area(p + '.description', 'Description', { rows: 4 }) +
            chk(p + '.visible', 'Show on the site');
        }
      });
    },

    resume: function () {
      return head('Experience') +
        list('experience', {
          addLabel: 'Add role',
          empty: 'No roles yet.',
          title: function (e) { return e.role; },
          meta: function (e) { return e.period; },
          body: function (p) {
            return '<div class="grid">' + txt(p + '.period', 'Period', { ph: '2024 — Present' }) +
              txt(p + '.role', 'Job title') + '</div>' +
              txt(p + '.org', 'Organisation') +
              area(p + '.description', 'What you did', { rows: 5 }) +
              chk(p + '.visible', 'Show on the site');
          }
        }) +
        head('Certifications') +
        list('certifications', {
          addLabel: 'Add certification',
          empty: 'No certifications yet.',
          title: function (c) { return c.title; },
          meta: function (c) { return c.inProgress ? 'in progress' : c.issuer; },
          body: function (p) {
            return '<div class="grid">' + txt(p + '.issuer', 'Badge text', { ph: 'Cisco' }) +
              txt(p + '.org', 'Issuing body') + '</div>' +
              txt(p + '.title', 'Certification name', { req: true }) +
              area(p + '.description', 'Description') +
              txt(p + '.image', 'Certificate image', { hint: 'e.g. certs/ccna.jpg — leave blank to hide the button.' }) +
              chk(p + '.inProgress', 'Mark as in progress (amber badge)') +
              chk(p + '.visible', 'Show on the site');
          }
        }) +
        head('Education') +
        list('education', {
          addLabel: 'Add qualification',
          empty: 'No education yet.',
          title: function (e) { return e.degree; },
          meta: function (e) { return e.period; },
          body: function (p) {
            return '<div class="grid">' + txt(p + '.period', 'Year') +
              txt(p + '.degree', 'Qualification') + '</div>' +
              txt(p + '.institution', 'Institution') +
              area(p + '.detail', 'Result or detail') +
              chk(p + '.visible', 'Show on the site');
          }
        });
    },

    skills: function () {
      return head('Featured skills (ring gauges)') +
        list('skills.featured', {
          addLabel: 'Add featured skill',
          empty: 'No featured skills.',
          title: function (f) { return f.name; },
          meta: function (f) { return f.percent + '%'; },
          body: function (p) {
            return '<div class="grid">' + txt(p + '.name', 'Skill') +
              num(p + '.percent', 'Percent (0–100)') + '</div>' +
              txt(p + '.note', 'Caption') +
              chk(p + '.visible', 'Show on the site');
          }
        }) +
        head('Skill groups (bars)') +
        list('skills.groups', {
          addLabel: 'Add group',
          empty: 'No groups.',
          title: function (g) { return g.title; },
          meta: function (g) { return (g.items || []).length + ' items'; },
          body: function (p) {
            return txt(p + '.title', 'Group title') +
              chk(p + '.visible', 'Show on the site') +
              list(p + '.items', {
                addLabel: 'Add skill',
                empty: 'No skills in this group.',
                title: function (it) { return it.name; },
                meta: function (it) { return it.level; },
                body: function (ip) {
                  return '<div class="grid">' + txt(ip + '.name', 'Skill') +
                    txt(ip + '.level', 'Label', { hint: 'Shown on the right, e.g. 85% or Native.' }) +
                    num(ip + '.percent', 'Bar fill (0–100)') + '</div>';
                }
              });
          }
        }) +
        head('Soft skills & knowledge') +
        txt('skills.knowledgeTitle', 'Heading') +
        tags('skills.knowledge', 'Items', 'e.g. Backup & disaster recovery');
    },

    contact: function () {
      return '<div class="note">Contact cards are built automatically from the phone, email ' +
        'and location on the <b>Profile</b> tab.</div>' +
        area('contact.heading', 'Form heading', { hint: 'Wrap words in {curly braces} to colour them.' }) +
        area('contact.formNote', 'Note under the form') +
        head('Form delivery') +
        txt('contact.formspreeId', 'Formspree form ID', {
          hint: 'Optional. Leave blank and the form opens the visitor\'s email app instead. ' +
                'With an ID from formspree.io, messages are sent straight to your inbox.'
        });
    },

    publish: function () { return publishPane(); }
  };

  /* defaults used when adding a new row */
  var TEMPLATES = {
    'socials':            function () { return { id: uid('so'), platform: 'website', label: 'Website', url: '', visible: true }; },
    'works':              function () { return { id: uid('w'), visible: true, category: 'infra', tag: '', icon: 'server', title: 'New project', summary: '', value: '', chips: [], links: [] }; },
    'workCategories':     function () { return { id: 'new', label: 'New' }; },
    'services':           function () { return { id: uid('sv'), visible: true, icon: 'gear', title: 'New service', description: '' }; },
    'experience':         function () { return { id: uid('e'), visible: true, period: '', role: 'New role', org: '', description: '' }; },
    'certifications':     function () { return { id: uid('c'), visible: true, issuer: '', title: 'New certification', org: '', description: '', image: '', inProgress: false }; },
    'education':          function () { return { id: uid('ed'), visible: true, period: '', degree: 'New qualification', institution: '', detail: '' }; },
    'hero.stats':         function () { return { id: uid('s'), value: 0, suffix: '', label: 'New stat' }; },
    'skills.featured':    function () { return { id: uid('f'), visible: true, name: 'New skill', note: '', percent: 70 }; },
    'skills.groups':      function () { return { id: uid('g'), visible: true, title: 'New group', items: [] }; }
  };
  function template(path) {
    if (TEMPLATES[path]) return TEMPLATES[path]();
    if (/^works\.\d+\.links$/.test(path)) return { label: 'Link', url: '' };
    if (/^skills\.groups\.\d+\.items$/.test(path)) return { id: uid('i'), name: 'New skill', level: '70%', percent: 70 };
    return {};
  }

  function renderPane() {
    $('#paneTitle').textContent = (TABS.filter(function (t) { return t.id === tab; })[0] || {}).label || '';
    $('#pane').innerHTML = PANES[tab]();
  }

  /* ============================================================
     EVENT DELEGATION
     ============================================================ */
  var pane = $('#pane');

  /* text / textarea / number / select */
  pane.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.dataset.path) return;
    var v = el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
    set(model, el.dataset.path, v);
    touch(false);
  });
  pane.addEventListener('change', function (e) {
    var el = e.target;
    if (el.type === 'checkbox' && el.dataset.path) {
      set(model, el.dataset.path, el.checked);
      touch(true);
    } else if (el.tagName === 'SELECT' && el.dataset.path) {
      touch(true);
    }
  });

  pane.addEventListener('click', function (e) {
    var t = e.target;

    /* expand / collapse */
    var h = t.closest('.item-head');
    if (h && !t.closest('.acts')) {
      h.parentNode.classList.toggle('open');
      return;
    }

    /* add row */
    var add = t.closest('[data-add]');
    if (add) {
      var p = add.dataset.add;
      var arr = get(model, p);
      if (!Array.isArray(arr)) { arr = []; set(model, p, arr); }
      arr.push(template(p));
      touch(true);
      return;
    }

    /* delete row */
    var del = t.closest('[data-del]');
    if (del) {
      var dp = del.dataset.del.split('.');
      var di = Number(dp.pop());
      var darr = get(model, dp.join('.'));
      var name = (darr[di] && (darr[di].title || darr[di].name || darr[di].role ||
                  darr[di].degree || darr[di].label)) || 'this item';
      if (!confirm('Delete “' + name + '”? This cannot be undone.')) return;
      darr.splice(di, 1);
      touch(true);
      return;
    }

    /* reorder */
    var mv = t.closest('[data-move]');
    if (mv) {
      var mp = mv.dataset.move.split('.');
      var mi = Number(mp.pop());
      var marr = get(model, mp.join('.'));
      var to = mi + Number(mv.dataset.dir);
      if (to < 0 || to >= marr.length) return;
      marr.splice(to, 0, marr.splice(mi, 1)[0]);
      touch(true);
      return;
    }

    /* tag remove */
    var td = t.closest('[data-tagdel]');
    if (td) {
      get(model, td.dataset.tagdel).splice(Number(td.dataset.i), 1);
      touch(true);
      return;
    }
    /* tag add */
    var tb = t.closest('[data-tagbtn]');
    if (tb) {
      addTag(tb.dataset.tagbtn);
      return;
    }
  });

  pane.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.dataset.tagadd) {
      e.preventDefault();
      addTag(e.target.dataset.tagadd);
    }
  });

  function addTag(path) {
    var input = pane.querySelector('[data-tagadd="' + path + '"]');
    var v = (input.value || '').trim();
    if (!v) return;
    var arr = get(model, path);
    if (!Array.isArray(arr)) { arr = []; set(model, path, arr); }
    arr.push(v);
    input.value = '';
    touch(true);
  }

  /* re-render (keeping which rows were open) when structure changes */
  function touch(rerender) {
    localStorage.setItem(K_DRAFT, JSON.stringify(model));
    markDirty();
    buildTabs();
    if (rerender) {
      var open = $$('.item.open', pane).map(function (el) { return el.dataset.item; });
      var focus = document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.path : null;
      renderPane();
      open.forEach(function (p) {
        var el = pane.querySelector('[data-item="' + p + '"]');
        if (el) el.classList.add('open');
      });
      if (focus) {
        var f = pane.querySelector('[data-path="' + focus + '"]');
        if (f) f.focus();
      }
    }
  }

  function markDirty() {
    var d = JSON.stringify(model) !== JSON.stringify(clean);
    $('#dirty').classList.toggle('hide', !d);
    return d;
  }

  window.addEventListener('beforeunload', function (e) {
    if (markDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ============================================================
     TOOLBAR
     ============================================================ */
  $('#revertBtn').addEventListener('click', function () {
    if (!confirm('Discard all unsaved changes and reload the published content?')) return;
    localStorage.removeItem(K_DRAFT);
    model = clone(clean);
    buildTabs();
    renderPane();
    markDirty();
    toast('Reverted to published content.');
  });

  $('#downloadBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloaded. Replace data/content.json in your repo.');
  });

  $('#previewBtn').addEventListener('click', function () {
    sessionStorage.setItem('portfolio:preview', JSON.stringify(model));
    window.open('../index.html', 'pf_preview');
  });

  $('#publishBtn').addEventListener('click', function () {
    tab = 'publish';
    buildTabs();
    renderPane();
  });

  /* ============================================================
     PUBLISH TO GITHUB
     ============================================================ */
  function ghCfg() {
    try { return JSON.parse(localStorage.getItem(K_GH)) || {}; } catch (e) { return {}; }
  }

  function publishPane() {
    var g = ghCfg();
    return '<div class="note warn"><h4>How publishing works</h4>' +
      'This commits <code>data/content.json</code> straight to your repository using the GitHub ' +
      'API. GitHub Pages then rebuilds and your site updates in about a minute.' +
      '<ol>' +
        '<li>Open GitHub → Settings → Developer settings → <b>Fine-grained tokens</b>.</li>' +
        '<li>Scope it to <b>only</b> your portfolio repository.</li>' +
        '<li>Give it one permission: <b>Contents → Read and write</b>.</li>' +
        '<li>Set a short expiry and paste the token below.</li>' +
      '</ol>' +
      'The token is stored in this browser only. Anyone with access to this device can read it, ' +
      'so use a short expiry and revoke it if the device is shared.</div>' +

      '<div class="grid">' +
        '<div class="f"><label for="ghOwner">GitHub username</label>' +
          '<input id="ghOwner" value="' + esc(g.owner || 'munna-it360') + '"></div>' +
        '<div class="f"><label for="ghRepo">Repository</label>' +
          '<input id="ghRepo" value="' + esc(g.repo || 'portfolio') + '"></div>' +
        '<div class="f"><label for="ghBranch">Branch</label>' +
          '<input id="ghBranch" value="' + esc(g.branch || 'main') + '"></div>' +
        '<div class="f"><label for="ghPath">File path</label>' +
          '<input id="ghPath" value="' + esc(g.path || 'data/content.json') + '"></div>' +
      '</div>' +
      '<div class="f"><label for="ghToken">Access token</label>' +
        '<input id="ghToken" type="password" placeholder="github_pat_…" value="' + esc(g.token || '') + '">' +
        '<p class="hint">Leave blank to use the token already saved in this browser.</p></div>' +
      '<label class="check"><input type="checkbox" id="ghRemember"' + (g.token ? ' checked' : '') +
        '> Remember the token in this browser</label>' +
      '<div class="f" style="margin-top:14px"><label for="ghMsg">Commit message</label>' +
        '<input id="ghMsg" value="Update site content"></div>' +
      '<div class="f-row" style="margin-bottom:10px">' +
        '<button class="btn btn-accent" type="button" id="ghGo">Publish to GitHub</button>' +
        '<button class="btn btn-ghost" type="button" id="ghTest">Test connection</button>' +
      '</div>' +
      '<div class="log" id="ghLog">Ready.</div>';
  }

  function logLine(msg, kind) {
    var el = $('#ghLog');
    if (!el) return;
    el.innerHTML += '\n<span class="' + (kind || '') + '">' + esc(msg) + '</span>';
    el.scrollTop = el.scrollHeight;
  }

  function readCfg() {
    var cfg = {
      owner:  $('#ghOwner').value.trim(),
      repo:   $('#ghRepo').value.trim(),
      branch: $('#ghBranch').value.trim() || 'main',
      path:   $('#ghPath').value.trim() || 'data/content.json',
      token:  $('#ghToken').value.trim() || ghCfg().token || ''
    };
    if ($('#ghRemember').checked) {
      localStorage.setItem(K_GH, JSON.stringify(cfg));
    } else {
      var noTok = Object.assign({}, cfg); delete noTok.token;
      localStorage.setItem(K_GH, JSON.stringify(noTok));
    }
    return cfg;
  }

  function api(cfg, url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch('https://api.github.com' + url, opts);
  }

  pane.addEventListener('click', async function (e) {
    if (e.target.id === 'ghTest') {
      var cfg = readCfg();
      if (!cfg.token) { logLine('No token provided.', 'err'); return; }
      $('#ghLog').textContent = 'Checking…';
      try {
        var r = await api(cfg, '/repos/' + cfg.owner + '/' + cfg.repo);
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        var j = await r.json();
        logLine('Connected to ' + j.full_name + '.', 'ok');
        logLine('Default branch: ' + j.default_branch);
        logLine(j.permissions && j.permissions.push
          ? 'Write access confirmed.' : 'Warning: no write permission on this token.',
          j.permissions && j.permissions.push ? 'ok' : 'err');
      } catch (err) {
        logLine('Failed: ' + err.message, 'err');
        logLine('Check the username, repository name, and that the token has Contents: Read and write.');
      }
      return;
    }

    if (e.target.id === 'ghGo') {
      var cfg = readCfg();
      if (!cfg.token) { logLine('No token provided.', 'err'); return; }
      var btn = e.target;
      btn.disabled = true;
      $('#ghLog').textContent = 'Publishing…';
      try {
        /* current file sha, if it exists */
        var sha = null;
        var head = await api(cfg, '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
                             cfg.path + '?ref=' + encodeURIComponent(cfg.branch));
        if (head.ok) {
          sha = (await head.json()).sha;
          logLine('Found existing file.');
        } else if (head.status === 404) {
          logLine('File does not exist yet — it will be created.');
        } else {
          throw new Error('Could not read the file: ' + head.status + ' ' + head.statusText);
        }

        var body = {
          message: $('#ghMsg').value.trim() || 'Update site content',
          content: b64(JSON.stringify(model, null, 2)),
          branch: cfg.branch
        };
        if (sha) body.sha = sha;

        var put = await api(cfg, '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!put.ok) {
          var errTxt = await put.text();
          throw new Error(put.status + ' ' + put.statusText + ' — ' + errTxt.slice(0, 220));
        }
        var res = await put.json();
        logLine('Published. Commit ' + res.commit.sha.slice(0, 7) + '.', 'ok');
        logLine('GitHub Pages usually finishes rebuilding within a minute.');
        clean = clone(model);
        localStorage.removeItem(K_DRAFT);
        markDirty();
        toast('Published to GitHub.');
      } catch (err) {
        logLine('Failed: ' + err.message, 'err');
        toast('Publish failed — see the log.', 'err');
      } finally {
        btn.disabled = false;
      }
    }
  });
})();
