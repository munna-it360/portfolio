/* ============================================================
   app.js — renders the portfolio from data/content.json
   ============================================================ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* "text {highlighted} text" -> accent-wrapped */
  function hl(s) {
    return esc(s).replace(/\{([^}]*)\}/g, '<em>$1</em>');
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^(https?:|mailto:|tel:|\/|#|\.)/i.test(u) ? u : '#';
  }
  function isExternal(u) { return /^https?:/i.test(u); }
  function vis(a) { return (a || []).filter(function (x) { return x && x.visible !== false; }); }

  /* ---------- boot ---------- */
  var BOOT = $('#boot');
  function fail(msg) {
    if (!BOOT) return;
    BOOT.innerHTML = '<div class="fatal"><b>Content failed to load</b>' + esc(msg) + '</div>';
  }

  fetch('data/content.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      /* an admin preview draft overrides the published file */
      try {
        var draft = sessionStorage.getItem('portfolio:preview');
        if (draft) data = JSON.parse(draft);
      } catch (e) { /* ignore */ }
      render(data);
      wire(data);
      if (BOOT) BOOT.classList.add('gone');
    })
    .catch(function (e) {
      fail('data/content.json could not be read (' + e.message + '). If you are opening the file directly from disk, run a local web server instead — browsers block fetch on file:// URLs.');
    });

  /* ============================================================
     RENDER
     ============================================================ */
  function render(d) {
    var p = d.profile || {}, site = d.site || {};

    /* --- head --- */
    document.title = site.title || p.name || 'Portfolio';
    setMeta('description', site.description);
    setMeta('og:title', site.title, true);
    setMeta('og:description', site.description, true);
    setMeta('og:url', site.url, true);
    setMeta('twitter:title', site.title, true);
    setMeta('twitter:description', site.description, true);

    var ld = $('#ldjson');
    if (ld) {
      ld.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: p.name,
        jobTitle: (p.typedRoles || [])[0] || '',
        email: p.email ? 'mailto:' + p.email : undefined,
        telephone: p.phoneRaw || undefined,
        url: site.url || undefined,
        image: p.avatar || undefined,
        address: { '@type': 'PostalAddress', addressLocality: p.location || '' },
        sameAs: vis(d.socials).map(function (s) { return s.url; })
                  .filter(function (u) { return /^https?:/i.test(u); })
      });
    }

    /* --- identity (rail + topbar) --- */
    var avatarImg = p.avatar
      ? '<img src="' + esc(p.avatar) + '" alt="' + esc(p.name) + '" loading="eager" ' +
        'onerror="this.remove()">'
      : '';
    $('#avatar').innerHTML =
      '<div class="initial">' + esc(p.initial || (p.name || '?').charAt(0)) + '</div>' + avatarImg;
    $('#railName').textContent = p.name || '';
    $('#tbName').textContent = p.name || '';
    $('#tbRole').textContent = (p.typedRoles || [])[0] || '';
    $('#tbAvatar').innerHTML = avatarImg;

    var avail = $('#avail');
    if (p.available) {
      avail.innerHTML = '<span class="dot"></span>' + esc(p.availableText || 'Available');
      avail.hidden = false;
    } else { avail.hidden = true; }

    /* --- nav (rail + drawer) --- */
    var navHtml = (d.nav || []).map(function (n) {
      return '<a href="#' + esc(n.id) + '" data-sec="' + esc(n.id) + '">' + esc(n.label) + '</a>';
    }).join('');
    $('#railNav').innerHTML = navHtml;
    $('#drawerNav').innerHTML = navHtml;

    /* --- socials --- */
    var socialHtml = vis(d.socials).map(function (s) {
      var ext = isExternal(s.url) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<a href="' + esc(safeUrl(s.url)) + '"' + ext +
             ' aria-label="' + esc(s.label || s.platform) + '" title="' + esc(s.label || s.platform) + '">' +
             Icons.svg(s.platform) + '</a>';
    }).join('');
    $('#railSocials').innerHTML = socialHtml;
    $('#drawerSocials').innerHTML = socialHtml;

    /* --- CV --- */
    var cvHtml = p.cvUrl
      ? '<a class="btn btn-accent" href="' + esc(safeUrl(p.cvUrl)) + '" download>Download CV' +
        Icons.svg('download') + '</a>'
      : '';
    $('#railCv').innerHTML = cvHtml;
    $('#drawerCv').innerHTML = cvHtml;

    /* --- footer --- */
    var footTxt = String((d.footer || {}).text || '').replace('{year}', new Date().getFullYear());
    $('#railFoot').innerHTML = '<span class="tick">✓</span> ' + esc(footTxt);
    $('#pageFoot').innerHTML = '<span class="tick">✓</span> ' + esc(footTxt);

    /* --- hero --- */
    var h = d.hero || {};
    $('#hello').innerHTML = esc(h.greeting || '') + ' <b>' + esc(p.name) + '</b> 👋';
    $('#heroTitle').innerHTML = hl(h.headline);
    $('#heroIntro').textContent = h.intro || '';
    $('#heroCta').innerHTML =
      (h.primaryCta ? '<a class="btn btn-accent" href="' + esc(safeUrl(h.primaryCta.href)) + '">' +
        esc(h.primaryCta.label) + '</a>' : '') +
      (h.secondaryCta ? '<a class="btn btn-ghost" href="' + esc(safeUrl(h.secondaryCta.href)) + '">' +
        esc(h.secondaryCta.label) + '</a>' : '');
    $('#consoleLabel').textContent = h.statusLabel || 'status';
    $('#stats').innerHTML = (h.stats || []).map(function (s) {
      return '<div class="stat"><b><span data-count="' + Number(s.value || 0) + '">0</span>' +
             esc(s.suffix || '') + '</b><span>' + esc(s.label) + '</span></div>';
    }).join('');

    /* --- works --- */
    $('#filters').innerHTML = (d.workCategories || []).map(function (c, i) {
      return '<button class="fbtn" data-filter="' + esc(c.id) + '" aria-pressed="' +
             (i === 0 ? 'true' : 'false') + '">' + esc(c.label) + '</button>';
    }).join('');

    var works = vis(d.works);
    $('#worksGrid').innerHTML = works.length ? works.map(function (w) {
      var links = (w.links || []).map(function (l) {
        return '<a class="chip" href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' +
               esc(l.label) + Icons.svg('external') + '</a>';
      }).join('');
      var chips = (w.chips || []).map(function (c) {
        return '<span class="chip">' + esc(c) + '</span>';
      }).join('');
      return '<article class="card work reveal" data-cat="' + esc(w.category) + '">' +
        '<div class="work-visual">' +
          (w.tag ? '<span class="wtag">' + esc(w.tag) + '</span>' : '') +
          Icons.svg(w.icon || 'server') +
        '</div>' +
        '<div class="work-body">' +
          '<h3>' + esc(w.title) + '</h3>' +
          (w.summary ? '<p>' + esc(w.summary) + '</p>' : '') +
          (w.value ? '<div class="wvalue"><strong>Value:</strong> ' + esc(w.value) + '</div>' : '') +
          ((chips || links) ? '<div class="chips">' + chips + links + '</div>' : '') +
        '</div></article>';
    }).join('') : '<div class="empty">No projects published yet.</div>';

    /* --- services --- */
    var svcs = vis(d.services);
    $('#servicesGrid').innerHTML = svcs.map(function (s) {
      return '<article class="card svc reveal">' +
        '<div class="ico">' + Icons.svg(s.icon || 'gear') + '</div>' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<p>' + esc(s.description) + '</p>' +
        '<a class="get" href="#contact">Get started</a></article>';
    }).join('') || '<div class="empty">No services listed.</div>';

    /* --- resume --- */
    $('#experience').innerHTML = vis(d.experience).map(function (e) {
      return '<article class="card r-item">' +
        '<span class="when">' + esc(e.period) + '</span>' +
        '<h4>' + esc(e.role) + '</h4>' +
        '<div class="org">' + esc(e.org) + '</div>' +
        (e.description ? '<p>' + esc(e.description) + '</p>' : '') +
      '</article>';
    }).join('') || '<div class="empty">No experience listed.</div>';

    $('#certs').innerHTML = vis(d.certifications).map(function (c) {
      return '<article class="card r-item">' +
        '<span class="when' + (c.inProgress ? ' wip' : '') + '">' + esc(c.issuer) + '</span>' +
        '<h4>' + esc(c.title) + '</h4>' +
        '<div class="org">' + esc(c.org) + '</div>' +
        (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
        (c.image ? '<button class="cert-btn" data-cert="' + esc(c.image) +
                   '" data-title="' + esc(c.title) + '">View certificate</button>' : '') +
      '</article>';
    }).join('') || '<div class="empty">No certifications listed.</div>';

    $('#education').innerHTML = vis(d.education).map(function (e) {
      return '<article class="card r-item">' +
        '<span class="when">' + esc(e.period) + '</span>' +
        '<h4>' + esc(e.degree) + '</h4>' +
        '<div class="org">' + esc(e.institution) + '</div>' +
        (e.detail ? '<p>' + esc(e.detail) + '</p>' : '') +
      '</article>';
    }).join('') || '<div class="empty">No education listed.</div>';

    /* --- skills --- */
    var sk = d.skills || {};
    var C = 2 * Math.PI * 42; /* r = 42 */
    $('#featSkills').innerHTML = vis(sk.featured).map(function (f) {
      var pct = Math.max(0, Math.min(100, Number(f.percent) || 0));
      return '<article class="card fskill reveal">' +
        '<div class="ring" data-pct="' + pct + '">' +
          '<svg width="92" height="92" aria-hidden="true">' +
            '<circle cx="46" cy="46" r="42" stroke="#28323f" stroke-width="7" fill="none"/>' +
            '<circle class="ring-fill" cx="46" cy="46" r="42" stroke="#4fd1c5" stroke-width="7" ' +
              'fill="none" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" ' +
              'stroke-dashoffset="' + C.toFixed(1) + '"/>' +
          '</svg><b>' + pct + '%</b></div>' +
        '<h4>' + esc(f.name) + '</h4><p>' + esc(f.note || '') + '</p></article>';
    }).join('');

    $('#skillCols').innerHTML = vis(sk.groups).map(function (g) {
      return '<div class="skill-col reveal"><h3>' + esc(g.title) + '</h3>' +
        (g.items || []).map(function (it) {
          var pct = Math.max(0, Math.min(100, Number(it.percent) || 0));
          return '<div class="sk"><div class="sk-top"><b>' + esc(it.name) + '</b>' +
                 '<span>' + esc(it.level || pct + '%') + '</span></div>' +
                 '<div class="track"><div class="fill" data-w="' + pct + '"></div></div></div>';
        }).join('') + '</div>';
    }).join('');

    var know = sk.knowledge || [];
    $('#knowWrap').hidden = !know.length;
    $('#knowTitle').textContent = sk.knowledgeTitle || 'Knowledge';
    $('#knowledge').innerHTML = know.map(function (k) {
      return '<li>' + esc(k) + '</li>';
    }).join('');

    /* --- contact --- */
    var cc = [];
    if (p.phone) cc.push({ i: 'phone', k: 'Phone', v: p.phone, href: 'tel:' + (p.phoneRaw || p.phone) });
    if (p.email) cc.push({ i: 'email', k: 'Email', v: p.email, href: 'mailto:' + p.email });
    if (p.location) cc.push({ i: 'pin', k: 'Location', v: p.location, href: '' });
    $('#ccards').innerHTML = cc.map(function (c) {
      var val = c.href
        ? '<a class="v" href="' + esc(c.href) + '">' + esc(c.v) + '</a>'
        : '<span class="v">' + esc(c.v) + '</span>';
      return '<article class="card ccard reveal"><div class="cico">' + Icons.svg(c.i) + '</div>' +
             '<div class="k">' + esc(c.k) + '</div>' + val + '</article>';
    }).join('');

    var ct = d.contact || {};
    $('#formTitle').innerHTML = hl(ct.heading);
    $('#formNote').textContent = ct.formNote || '';
  }

  function setMeta(name, val, isProp) {
    if (!val) return;
    var sel = isProp ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(isProp ? 'property' : 'name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', val);
  }

  /* ============================================================
     WIRE — interactions, run after DOM is built
     ============================================================ */
  function wire(d) {
    /* --- typewriter --- */
    var typedEl = $('#typed');
    var roles = (d.profile || {}).typedRoles || [];
    if (typedEl && roles.length) {
      if (reduced) {
        typedEl.textContent = roles[0];
        var cur = $('.tcursor'); if (cur) cur.style.display = 'none';
      } else {
        var ri = 0, ci = 0, del = false;
        (function step() {
          var w = roles[ri];
          typedEl.textContent = w.slice(0, ci);
          if (!del && ci < w.length) { ci++; setTimeout(step, 72); }
          else if (!del) { del = true; setTimeout(step, 1650); }
          else if (ci > 0) { ci--; setTimeout(step, 34); }
          else { del = false; ri = (ri + 1) % roles.length; setTimeout(step, 320); }
        })();
      }
    }

    /* --- local clock --- */
    var clock = $('#clock');
    var tz = (d.profile || {}).timezone || 'Asia/Dhaka';
    if (clock) {
      (function tick() {
        try {
          clock.textContent = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
          }).format(new Date()) + ' ' + tz.split('/').pop().replace('_', ' ');
        } catch (e) { clock.textContent = ''; }
        setTimeout(tick, 20000);
      })();
    }

    /* --- reveal on scroll --- */
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });

    /* --- counters --- */
    $$('[data-count]').forEach(function (el) {
      var target = parseInt(el.dataset.count, 10) || 0;
      var o = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          o.unobserve(el);
          if (reduced) { el.textContent = target; return; }
          var dur = 1250, t0 = performance.now();
          (function f(now) {
            var pr = Math.min((now - t0) / dur, 1);
            el.textContent = Math.round(target * (1 - Math.pow(1 - pr, 3)));
            if (pr < 1) requestAnimationFrame(f);
          })(t0);
        });
      }, { threshold: .5 });
      o.observe(el);
    });

    /* --- ring gauges --- */
    $$('.ring').forEach(function (ring) {
      var pct = parseInt(ring.dataset.pct, 10) || 0;
      var c = $('.ring-fill', ring);
      var C = 2 * Math.PI * 42;
      var o = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          o.unobserve(ring);
          c.style.transition = reduced ? 'none' : 'stroke-dashoffset 1.25s cubic-bezier(.25,.7,.3,1)';
          c.style.strokeDashoffset = C * (1 - pct / 100);
        });
      }, { threshold: .45 });
      o.observe(ring);
    });

    /* --- skill bars --- */
    $$('.fill').forEach(function (el) {
      var o = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          o.unobserve(el);
          if (reduced) el.style.transition = 'none';
          el.style.width = (el.dataset.w || 0) + '%';
        });
      }, { threshold: .45 });
      o.observe(el);
    });

    /* --- works filter --- */
    var fbtns = $$('#filters .fbtn');
    fbtns.forEach(function (b) {
      b.addEventListener('click', function () {
        fbtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var f = b.dataset.filter;
        $$('#worksGrid .work').forEach(function (w) {
          w.hidden = (f !== 'all' && w.dataset.cat !== f);
        });
      });
    });

    /* --- certificate lightbox --- */
    var modal = $('#modal'), mImg = $('#modalImg'), mTitle = $('#modalTitle'), lastFocus = null;
    function openModal(src, title) {
      lastFocus = document.activeElement;
      mTitle.textContent = title;
      mImg.innerHTML = '';
      var im = new Image();
      im.alt = title;
      im.onerror = function () {
        mImg.innerHTML = '<div class="missing">No image found at ' + esc(src) +
          '<br>Upload it to your repository at that path.</div>';
      };
      im.src = src;
      mImg.appendChild(im);
      modal.classList.add('on');
      document.body.style.overflow = 'hidden';
      $('#modalClose').focus();
    }
    function closeModal() {
      modal.classList.remove('on');
      document.body.style.overflow = '';
      mImg.innerHTML = '';
      if (lastFocus) lastFocus.focus();
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('.cert-btn');
      if (b) openModal(b.dataset.cert, b.dataset.title);
    });
    $('#modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    /* --- drawer --- */
    var drawer = $('#drawer'), scrim = $('#scrim'), burger = $('#burger');
    function setDrawer(on) {
      drawer.classList.toggle('on', on);
      scrim.classList.toggle('on', on);
      burger.setAttribute('aria-expanded', String(on));
      document.body.style.overflow = on ? 'hidden' : '';
      if (on) $('#drawerClose').focus(); else burger.focus();
    }
    burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('on')); });
    $('#drawerClose').addEventListener('click', function () { setDrawer(false); });
    scrim.addEventListener('click', function () { setDrawer(false); });
    $$('#drawerNav a').forEach(function (a) {
      a.addEventListener('click', function () { setDrawer(false); });
    });

    /* --- escape closes whatever is open --- */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (modal.classList.contains('on')) closeModal();
      else if (drawer.classList.contains('on')) setDrawer(false);
    });

    /* --- smooth anchor scroll (single handler) --- */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var t = document.getElementById(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + id);
    });

    /* --- scroll spy --- */
    var links = $$('.rail-nav a, #drawerNav a');
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (l) {
          l.setAttribute('aria-current', String(l.dataset.sec === e.target.id));
        });
      });
    }, { rootMargin: '-35% 0px -58% 0px' });
    $$('main section[id]').forEach(function (s) { spy.observe(s); });

    /* --- progress bar + back to top --- */
    var bar = $('#progress'), top = $('#totop'), ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
        top.classList.toggle('on', window.scrollY > 520);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    /* --- contact form --- */
    var form = $('#contactForm'), msg = $('#formMsg');
    var endpoint = (d.contact || {}).formspreeId;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#fName').value.trim(),
          mail = $('#fEmail').value.trim(),
          subj = $('#fSubject').value.trim(),
          body = $('#fMsg').value.trim();
      if (!name || !mail || !body) { say('Fill in your name, email and message.', 'err'); return; }

      if (endpoint) {
        var btn = $('#sendBtn');
        btn.disabled = true; btn.textContent = 'Sending…';
        fetch('https://formspree.io/f/' + endpoint, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, email: mail, subject: subj, message: body })
        }).then(function (r) {
          if (!r.ok) throw new Error();
          form.reset();
          say('Message sent. I usually reply within a day.', 'ok');
        }).catch(function () {
          say('Sending failed. Email me directly at ' + (d.profile || {}).email + '.', 'err');
        }).then(function () {
          btn.disabled = false;
          btn.innerHTML = 'Send message' + Icons.svg('send');
        });
      } else {
        window.location.href = 'mailto:' + (d.profile || {}).email +
          '?subject=' + encodeURIComponent(subj) +
          '&body=' + encodeURIComponent(body + '\n\n— ' + name + ' (' + mail + ')');
        say('Opening your email app…', 'ok');
      }
    });
    function say(t, kind) {
      msg.textContent = t;
      msg.className = 'formmsg show ' + kind;
    }
    $('#sendBtn').innerHTML = 'Send message' + Icons.svg('send');
  }
})();
