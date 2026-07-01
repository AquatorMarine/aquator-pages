/* ── Back to Help Center button ────────────────────────────────────────
   Injected on every info page (each loads this file). Prefers history.back()
   when the user arrived from a same-origin page, otherwise navigates to the
   Help Center hub. */
(function () {
  if (document.querySelector(".hc-back")) return;
  // Prefer the sticky left rail so the button stays visible while scrolling;
  // fall back to the top of the content column.
  var host = document.querySelector(".rail-left") || document.querySelector("main.content");
  if (!host) return;
  var HUB = "index.html";
  var back = document.createElement("a");
  back.className = "hc-back";
  back.href = HUB;
  back.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
    "<span>Back to Help Center</span>";
  back.addEventListener("click", function (e) {
    try {
      if (document.referrer) {
        var ref = new URL(document.referrer);
        if (ref.origin === location.origin && ref.href !== location.href) {
          e.preventDefault();
          history.back();
        }
      }
    } catch (err) {}
  });
  host.insertBefore(back, host.firstChild);
})();

/* ── Interactive Plans & Pricing selector ──────────────────────────────
   Powers the "Choose your plan" dropdown in the Plans & Pricing section.
   For each plan it shows the summary + every add-on module: an "Included"
   link when the plan covers it, otherwise the plan-specific price.
   Indicative figures — live pricing at aquatormarine.com/pricing. */
(function () {
  // Add-on module catalogue (rows shown for every plan)
  var ADDONS = [
    { key: "refit", name: "Refit", href: "refits.html", desc: "Refit project planning &amp; budgeting" },
    { key: "crew", name: "Crew", href: "crew-management.html", desc: "Crew lists, leave &amp; payslips" },
    { key: "charter", name: "Charter", href: "charter.html", desc: "Bookings, APA &amp; guest profiles" },
    { key: "sms", name: "SMS", href: "sms.html", desc: "Safety Management System" },
    { key: "newbuild", name: "New Build", href: "new-builds.html", desc: "New-build project ERP suite" },
    { key: "warranty", name: "Warranty", href: "warranty.html", desc: "Warranty tracking &amp; claims" },
    { key: "integrations", name: "Integrations", href: "integrations.html", desc: "Third-party connections" },
    { key: "users", name: "Additional Users", href: "user-management.html", desc: "Extra user seats" },
  ];

  // Row status helpers
  function inc(note) { return { t: "inc", note: note || "" }; }      // included with the plan
  function price(v) { return { t: "price", v: v }; }                  // priced add-on
  var ADDON = { t: "addon" };                                        // available, price on request
  var CONTACT = { t: "contact" };                                    // custom / contact sales

  // $120/yr-each users row, reused across superyacht plans
  var U120 = price("$120<small>/yr each</small>");
  var U60 = price("$60<small>/yr each</small>");

  // Each plan carries both billing rates; add-ons are always annual figures
  // (the 15% annual discount applies to base plans only, not add-ons).
  var PLANS = {
    // ── Yacht Plans (single yachts up to 80ft) ──
    starter: { fam: "Yacht Plan", name: "Starter", len: "Under 50ft", annual: "Free", monthly: "Free", users: 2,
      note: "8 core modules, mobile access and 24/7 support. Every add-on module is available to bolt on.",
      rows: { users: U60 } },
    essential: { fam: "Yacht Plan", name: "Essential", len: "50–60ft", annual: "$99", monthly: "$9", users: 4,
      note: "Everything in Starter, plus Maintenance Tasks, Equipment List and Inventory List.",
      rows: { users: U60 } },
    advanced: { fam: "Yacht Plan", name: "Advanced", len: "60–70ft", annual: "$299", monthly: "$29", users: 6,
      note: "Everything in Essential, plus Accounting Transactions and Budget.",
      rows: { users: U60 } },
    pro: { fam: "Yacht Plan", name: "Pro", len: "70–80ft", annual: "$999", monthly: "$99", users: 8,
      note: "Everything in Advanced, plus Crew Lists, Crew Leave &amp; Payslips and 1 integration.",
      rows: { crew: inc("Crew Lists, Leave &amp; Payslips"), integrations: inc("1 included"), users: U60 } },

    // ── Superyacht Plans (24m and above) — all 10 core modules included ──
    alpha: { fam: "Superyacht Plan", name: "Alpha", len: "24–35m", annual: "$2,500", monthly: "$245", users: 4,
      note: "All 10 core modules included. Extra modules are available as priced add-ons.",
      rows: { refit: price("$900<small>/yr</small>"), crew: price("$900<small>/yr</small>"), charter: price("$600<small>/yr</small>"), sms: price("$600<small>/yr</small>"), newbuild: price("$2,000<small>/yr</small>"), warranty: price("$1,500<small>/yr</small>"), integrations: CONTACT, users: U120 } },
    bravo: { fam: "Superyacht Plan", name: "Bravo", len: "35–50m", annual: "$4,000", monthly: "$390", users: 6,
      note: "All core modules, 1 integration included and settings setup.",
      rows: { refit: price("$1,125<small>/yr</small>"), crew: price("$1,125<small>/yr</small>"), charter: price("$750<small>/yr</small>"), sms: price("$750<small>/yr</small>"), newbuild: price("$2,500<small>/yr</small>"), warranty: price("$1,875<small>/yr</small>"), integrations: inc("1 included"), users: U120 } },
    charlie: { fam: "Superyacht Plan", name: "Charlie", len: "50–65m", annual: "$7,000", monthly: "$685", users: 9,
      note: "All core modules, 2 integrations included and PMS data migration.",
      rows: { refit: price("$1,350<small>/yr</small>"), crew: price("$1,350<small>/yr</small>"), charter: price("$900<small>/yr</small>"), sms: price("$900<small>/yr</small>"), newbuild: price("$3,000<small>/yr</small>"), warranty: price("$2,250<small>/yr</small>"), integrations: inc("2 included"), users: U120 } },
    delta: { fam: "Superyacht Plan", name: "Delta", len: "65–80m", annual: "$13,000", monthly: "$1,275", users: 12,
      note: "All core modules, 3 integrations included and PMS + Accounting migration.",
      rows: { refit: price("$1,575<small>/yr</small>"), crew: price("$1,575<small>/yr</small>"), charter: price("$1,050<small>/yr</small>"), sms: price("$1,050<small>/yr</small>"), newbuild: price("$3,500<small>/yr</small>"), warranty: price("$2,625<small>/yr</small>"), integrations: inc("3 included"), users: U120 } },
    echo: { fam: "Superyacht Plan", name: "Echo", len: "80–100m", annual: "$20,000", monthly: "$1,960", users: 18,
      note: "All core modules, 4 integrations included, PMS + Accounting migration and Assist support included.",
      rows: { refit: price("$1,800<small>/yr</small>"), crew: price("$1,800<small>/yr</small>"), charter: price("$1,200<small>/yr</small>"), sms: price("$1,200<small>/yr</small>"), newbuild: price("$4,000<small>/yr</small>"), warranty: price("$3,000<small>/yr</small>"), integrations: inc("4 included"), users: U120 } },
    foxtrot: { fam: "Superyacht Plan", name: "Foxtrot", len: "100m+", annual: "Custom", monthly: "Custom", users: "Custom",
      note: "Custom-quoted. All integrations, full data migration, dedicated account team and bespoke reporting.",
      rows: { refit: CONTACT, crew: CONTACT, charter: CONTACT, sms: CONTACT, newbuild: CONTACT, warranty: CONTACT, integrations: inc("All included"), users: CONTACT } },
  };

  // Resolve the headline price for a plan + billing cycle
  function priceFor(p, cycle) {
    if (p.annual === "Free") return "Free";
    if (p.annual === "Custom") return "Custom";
    if (cycle === "monthly") return p.monthly + "<small>/mo</small>";
    return p.annual + "<small>/yr</small>";
  }
  function hasCyclePrice(p) {
    return p.annual !== "Free" && p.annual !== "Custom";
  }

  var GROUPS = [
    { label: "Yacht Plans (up to 80ft)", ids: ["starter", "essential", "advanced", "pro"] },
    { label: "Superyacht Plans (24m+)", ids: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"] },
  ];

  function statusCell(row, addon) {
    if (!row) row = ADDON;
    if (row.t === "inc") {
      return '<span class="chip okchip">' + (row.note || "Included") + "</span>" +
        '<a class="aq-link" href="' + addon.href + '">View guide &#8599;</a>';
    }
    if (row.t === "price") {
      return '<span class="aq-pr">' + row.v + "</span>" +
        '<a class="aq-link" href="' + addon.href + '">Learn more &#8599;</a>';
    }
    if (row.t === "contact") {
      return '<span class="chip warnchip">Custom</span>' +
        '<a class="aq-link" href="' + addon.href + '">Contact sales &#8599;</a>';
    }
    // default: available add-on, price on request
    return '<span class="chip neutralchip">Add-on</span>' +
      '<a class="aq-link" href="https://aquatormarine.com/pricing" target="_blank" rel="noopener noreferrer">See pricing &#8599;</a>';
  }

  function render(id) {
    var out = document.getElementById("aqPlanOut");
    if (!out) return;
    var p = PLANS[id];
    if (!p) {
      out.innerHTML = '<div class="aq-empty">Select a plan above to see what&rsquo;s included and the add-on pricing for that tier.</div>';
      return;
    }
    var cycleSel = document.getElementById("aqBillSelect");
    var cycle = cycleSel ? cycleSel.value : "annual";
    var rowsHtml = ADDONS.map(function (a) {
      return '<li class="aq-addon"><span class="aq-mname">' + a.name + "</span>" +
        '<span class="aq-mdesc">' + a.desc + "</span>" +
        '<span class="aq-stat">' + statusCell(p.rows[a.key], a) + "</span></li>";
    }).join("");
    var billLabel = !hasCyclePrice(p)
      ? "&mdash;"
      : cycle === "monthly"
        ? "Monthly"
        : "Annual &middot; save 15%";
    out.innerHTML =
      '<div class="aq-card">' +
        '<div class="aq-head"><span class="aq-name">' + p.name + "</span>" +
          '<span class="aq-fam">' + p.fam + '</span>' +
          '<span class="aq-price">' + priceFor(p, cycle) + "</span></div>" +
        '<div class="aq-meta"><span>Vessel size&nbsp; <b>' + p.len + "</b></span>" +
          "<span>Users included&nbsp; <b>" + p.users + "</b></span>" +
          "<span>Billing&nbsp; <b>" + billLabel + "</b></span></div>" +
        '<div class="aq-note">' + p.note + "</div>" +
        '<div class="aq-sub">Add-on modules <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">(billed annually)</span></div>' +
        '<ul class="aq-addons">' + rowsHtml + "</ul>" +
      "</div>";
  }

  // Build the <option> list once the picker is in the DOM, then render default
  function init() {
    var sel = document.getElementById("aqPlanSelect");
    if (!sel || sel.dataset.ready) return;
    var opts = '<option value="">&mdash; Select a plan &mdash;</option>';
    GROUPS.forEach(function (g) {
      opts += '<optgroup label="' + g.label + '">';
      g.ids.forEach(function (id) {
        var p = PLANS[id];
        opts += '<option value="' + id + '">' + p.name + " &mdash; " + p.len + "</option>";
      });
      opts += "</optgroup>";
    });
    sel.innerHTML = opts;
    sel.dataset.ready = "1";
    sel.addEventListener("change", function () { render(sel.value); });

    var bill = document.getElementById("aqBillSelect");
    if (bill && !bill.dataset.ready) {
      bill.dataset.ready = "1";
      bill.addEventListener("change", function () { render(sel.value); });
    }
    render("");
  }

  window.AQ_initPlanPicker = init;
})();

(function () {
        var DB = JSON.parse(document.getElementById("kb").textContent).modules;
        var IC = {
          compass:
            '<circle cx="12" cy="12" r="9"/><polygon points="16.2 7.8 13.4 13.4 7.8 16.2 10.6 10.6 16.2 7.8"/>',
          id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.4"/><path d="M5.5 16.5a3.5 3.5 0 0 1 7 0"/><line x1="15" y1="10" x2="18" y2="10"/><line x1="15" y1="13.5" x2="18" y2="13.5"/>',
          contract:
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 16c1.5-1.6 3-1.6 4 0s2.5 1.6 4 0"/>',
          cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
          badge:
            '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 8 22l4-2.2L16 22l-1-8.5"/>',
          calendar:
            '<rect x="3" y="4.5" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/>',
          phone:
            '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
          help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.4 9.4a2.6 2.6 0 0 1 5.1 .7c0 1.7-2.5 2-2.5 3.5"/><path d="M12 16.8v.3"/>',
          chart:
            '<line x1="4" y1="20" x2="20.5" y2="20"/><rect x="6" y="11" width="3" height="6.5"/><rect x="11" y="6.5" width="3" height="11"/><rect x="16" y="13.5" width="3" height="4"/>',
          tag: '<path d="M3 11.5V5.5a2 2 0 0 1 2-2h6a2 2 0 0 1 1.4.6l7.5 7.5a2 2 0 0 1 0 2.8l-6.1 6.1a2 2 0 0 1-2.8 0l-7.5-7.5a2 2 0 0 1-.6-1.4z"/><circle cx="7.6" cy="7.6" r="1.3"/>',
          scale:
            '<line x1="12" y1="3.5" x2="12" y2="20.5"/><line x1="5" y1="6.5" x2="19" y2="6.5"/><line x1="7.5" y1="20.5" x2="16.5" y2="20.5"/><path d="M5 6.5 2.5 13a3 3 0 0 0 5 0z"/><path d="M19 6.5 16.5 13a3 3 0 0 0 5 0z"/>',
          receipt:
            '<path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3z"/><line x1="8.5" y1="8" x2="15.5" y2="8"/><line x1="8.5" y1="12" x2="15.5" y2="12"/>',
          rocket:
            '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2a2.1 2.1 0 0 0-3-3z"/><path d="M12 15l-3-3a14 14 0 0 1 4-7c2.4-2.4 5-2.6 6.5-2.5.1 1.5-.1 4.1-2.5 6.5a14 14 0 0 1-7 4z"/><circle cx="15" cy="9" r="1.3"/>',
          anchor:
            '<circle cx="12" cy="5" r="2.5"/><line x1="12" y1="7.5" x2="12" y2="21"/><path d="M5 12a7 7 0 0 0 14 0"/><line x1="3" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21" y2="12"/>',
          users:
            '<circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.5"/><path d="M21 20c0-2.8-1.8-5-4-5"/>',
          gear:
            '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        };
        function svg(n) {
          return (
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            (IC[n] || IC.compass) +
            "</svg>"
          );
        }
        var modsEl = document.getElementById("mods"),
          secsEl = document.getElementById("secs"),
          bodyEl = document.getElementById("body"),
          titleEl = document.getElementById("title"),
          crumbEl = document.getElementById("crumbName");

        DB.forEach(function (m) {
          var b = document.createElement("button");
          b.className = "mod";
          b.dataset.id = m.id;
          b.innerHTML =
            '<span class="mic">' +
            svg(m.icon) +
            "</span><span>" +
            m.name +
            "</span>";
          b.addEventListener("click", function () {
            select(m.id);
          });
          modsEl.appendChild(b);
        });

        function select(id) {
          var m = DB.filter(function (x) {
            return x.id === id;
          })[0];
          if (!m) return;
          titleEl.innerHTML = m.name;
          crumbEl.innerHTML = "&rsaquo; " + m.name;
          bodyEl.innerHTML = m.body;
          if (window.AQ_initPlanPicker) window.AQ_initPlanPicker();
          [].forEach.call(modsEl.children, function (b) {
            b.classList.toggle("active", b.dataset.id === id);
          });
          buildSecs();
          window.scrollTo(0, 0);
          try {
            if (location.hash.slice(1) !== id)
              history.replaceState(null, "", "#" + id);
          } catch (e) {}
        }
        function buildSecs() {
          var hs = bodyEl.querySelectorAll("h2");
          var out = "";
          hs.forEach(function (h, i) {
            var s = "s" + i;
            h.id = s;
            out += '<a data-s="' + s + '">' + h.textContent + "</a>";
          });
          secsEl.innerHTML = out;
          secsEl.querySelectorAll("a").forEach(function (a) {
            a.addEventListener("click", function () {
              var el = document.getElementById(a.dataset.s);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          });
        }
        window.addEventListener(
          "scroll",
          function () {
            var hs = bodyEl.querySelectorAll("h2"),
              links = secsEl.querySelectorAll("a"),
              idx = 0;
            hs.forEach(function (h, i) {
              if (h.getBoundingClientRect().top < 120) idx = i;
            });
            links.forEach(function (a, i) {
              a.classList.toggle("on", i === idx);
            });
          },
          { passive: true },
        );

        var start = "";
        try {
          start = location.hash.slice(1);
        } catch (e) {}
        select(
          DB.filter(function (x) {
            return x.id === start;
          }).length
            ? start
            : DB[0].id,
        );
      })();
    
