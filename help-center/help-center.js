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
    
