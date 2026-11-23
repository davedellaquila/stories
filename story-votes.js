/* Story votes — Stories collection (stories.fiddletowngazette.com).
   One 👍 per upcoming story, in the "Coming Sundays" list on the front page.
   Readers vote for the stories they're most looking forward to; tallies are
   standing (not day-scoped) and accumulate until each story is released.
   Counted by Analytics Buddy's votes API on the same Cloudflare Worker as
   the visitor counter (collector/API.md): site "stories", target_type
   "story", target_id = the story's slug, edition "upcoming". Up-only.
   One vote per browser per story; the server stores only a salted hash of
   a random browser marker. Modeled on the Gazette's thumbs.js. */
(function () {
  "use strict";
  var CFG = { endpoint: "https://visitor-counter.dave-5d7.workers.dev", site: "stories", edition: "upcoming", type: "story" };

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  var picks = lsGet("stories-votes-v1", {});   // slug -> 1

  function marker() {
    var m = null;
    try { m = localStorage.getItem("stories-voter"); } catch (e) { /* ignore */ }
    if (!m) {
      if (window.crypto && crypto.getRandomValues) {
        var a = new Uint8Array(16); crypto.getRandomValues(a);
        m = Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      } else { m = "m" + Math.random().toString(16).slice(2) + Date.now().toString(16); }
      try { localStorage.setItem("stories-voter", m); } catch (e) { /* ignore */ }
    }
    return m;
  }
  function api(path, opts) {
    return fetch(CFG.endpoint + path, opts).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function ensureStyle() {
    if (document.getElementById("sv-style")) return;
    var s = document.createElement("style");
    s.id = "sv-style";
    s.textContent =
      ".sv-vote{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}" +
      ".sv-up{font-size:14px;line-height:1;padding:5px 10px;border:1px solid var(--line,#d8cbae);border-radius:999px;background:transparent;cursor:pointer}" +
      ".sv-up:hover{border-color:var(--accent,#8a5a2b)}" +
      ".sv-up[aria-pressed=\"true\"]{background:#f3e5c3;border-color:#c9a44a}" +
      ".sv-c{font-size:14px;color:var(--muted,#6f6250);min-width:1ch}" +
      ".sv-note{font-size:12.5px;font-style:italic;color:var(--muted,#6f6250);transition:opacity .45s ease}";
    document.head.appendChild(s);
  }

  function makeControl(wrap, id) {
    wrap.innerHTML =
      '<button type="button" class="sv-up" aria-label="Vote for this story" aria-pressed="false">👍</button>' +
      '<span class="sv-c" hidden></span>' +
      '<span class="sv-note" role="status" hidden></span>';
    if (picks[id]) wrap.querySelector(".sv-up").setAttribute("aria-pressed", "true");
    wrap.querySelector(".sv-up").addEventListener("click", function () { castVote(wrap, id); });
  }
  function paint(wrap, ups) {
    var c = wrap.querySelector(".sv-c");
    if (!c) return;
    c.textContent = ups; c.hidden = false;
    if (picks[wrap.getAttribute("data-id")]) wrap.querySelector(".sv-up").setAttribute("aria-pressed", "true");
  }
  function showNote(wrap, msg) {
    var n = wrap.querySelector(".sv-note");
    if (!n) return;
    n.textContent = msg;
    n.hidden = false; n.style.opacity = "0";
    void n.offsetWidth; n.style.opacity = "1";
    if (wrap._nt) clearTimeout(wrap._nt);
    if (wrap._nt2) clearTimeout(wrap._nt2);
    wrap._nt = setTimeout(function () {
      n.style.opacity = "0";
      wrap._nt2 = setTimeout(function () { n.hidden = true; }, 500);
    }, 4000);
  }
  function castVote(wrap, id) {
    if (picks[id]) { showNote(wrap, "Already counted — thanks!"); return; }
    picks[id] = 1; lsSet("stories-votes-v1", picks);
    wrap.querySelector(".sv-up").setAttribute("aria-pressed", "true");
    var c = wrap.querySelector(".sv-c");
    var cur = parseInt(c.textContent, 10);
    c.textContent = (isNaN(cur) ? 0 : cur) + 1; c.hidden = false; // tick up now; the server tally reconciles on return
    showNote(wrap, "Counted — thanks!");
    api("/vote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: CFG.site, target_type: CFG.type, target_id: id, edition: CFG.edition, value: 1, marker: marker() })
    }).then(function (res) {
      if (res && res.tally) paint(wrap, res.tally.ups);
      refresh();
    });
  }
  function refresh() {
    api("/votes?site=" + encodeURIComponent(CFG.site) + "&edition=" + encodeURIComponent(CFG.edition)).then(function (res) {
      if (!res || !res.targets) return;
      var byId = {};
      res.targets.forEach(function (t) { if (t.target_type === CFG.type) byId[t.target_id] = t.ups; });
      document.querySelectorAll(".sv-vote").forEach(function (wrap) {
        var id = wrap.getAttribute("data-id");
        if (id in byId) paint(wrap, byId[id]);
      });
    });
  }

  ensureStyle();
  document.querySelectorAll(".sv-vote").forEach(function (wrap) {
    makeControl(wrap, wrap.getAttribute("data-id"));
  });
  refresh();
})();
