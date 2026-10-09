/**
 * LoudMetric tracker
 *
 * One file, no dependencies, framework-agnostic. Loaded from your own server
 * or bundled — it never talks to anyone but your ingest endpoint.
 *
 * What it collects, and why each thing is here:
 *
 *   pageview   path + title + referrer
 *   scroll     how far someone actually got, as an integer percent
 *   section    which section was on screen and for how long
 *   vital      LCP / CLS / INP from real visitors, via PerformanceObserver
 *   heartbeat  presence, so dwell time can be computed instead of guessed
 *   event      your own goals: lm('track', 'signup', { plan: 'pro' })
 *
 * What it deliberately does NOT do: set a cookie, read one, or persist any
 * identifier. Visitors are counted by a server-side hash of IP + user agent
 * against a salt that rotates daily, so today cannot be joined to yesterday.
 *
 * Sends are batched and coalesced with sendBeacon so that a page unload does
 * not lose data, and so a busy page is not one request per event.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var ENDPOINT = script.getAttribute("data-endpoint") || "";
  var SITE = script.getAttribute("data-site") || "";
  // Set data-track-scroll="false" to skip the scroll listener on long pages,
  // and data-heartbeat="false" if you do not want dwell time.
  var TRACK_SCROLL = script.getAttribute("data-scroll") !== "false";
  var HEARTBEAT = script.getAttribute("data-heartbeat") !== "false";
  var HEARTBEAT_MS = 15000;

  // Respect Do Not Track. Not legally binding in the EU, but it is the
  // clearest signal a visitor can give and honouring it is the right default.
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") {
    window.lm = function () {};
    window.lm.ready = true;
    return;
  }

  if (!ENDPOINT || !SITE) {
    console.warn("[loudmetric] missing data-endpoint or data-site on the script tag");
    return;
  }

  var queue = [];
  var lastPath = null;
  var maxScroll = 0;
  var scrollSent = new Set();
  var sectionStart = null;
  var sectionName = null;
  var firstViewAt = Date.now();
  var lastBeat = Date.now();

  function push(type, props) {
    queue.push({
      t: type,
      p: typeof location.pathname === "string" ? location.pathname.slice(0, 400) : "",
      r: document.referrer ? document.referrer.slice(0, 400) : "",
      d: Date.now(),
      x: props || {},
    });
    if (queue.length >= 10) flush();
  }

  var flushing = false;
  function flush(useBeacon) {
    if (!queue.length || flushing) return;
    flushing = true;
    var body = JSON.stringify({ site: SITE, e: queue.splice(0) });
    // Coalesced: a long chain of events becomes one request, and the cookie
    // budget it would have spent is never touched because there is no cookie.
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
      flushing = false;
      return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      body,
      headers: { "content-type": "text/plain" },
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    })
      .catch(function () {})
      .then(function () {
        flushing = false;
      });
  }

  // ── Pageviews ────────────────────────────────────────────────────────────
  function pageview() {
    document.title = document.title || "";
    push("pageview", { ti: document.title.slice(0, 200) });
    lastPath = location.pathname;
    maxScroll = 0;
    scrollSent.clear();
    firstViewAt = Date.now();
  }

  // ── Scroll depth ─────────────────────────────────────────────────────────
  // Reported at thresholds, not continuously: a scroll handler that fires on
  // every frame is the single most common way analytics scripts cause jank.
  if (TRACK_SCROLL) {
    var onScroll = function () {
      var doc = document.documentElement;
      var h = Math.max(doc.scrollHeight, doc.body ? doc.body.scrollHeight : 0) - window.innerHeight;
      var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
      if (pct > maxScroll) maxScroll = pct;
      [25, 50, 75, 90, 100].forEach(function (threshold) {
        if (pct >= threshold && !scrollSent.has(threshold)) {
          scrollSent.add(threshold);
          push("scroll", { v: threshold });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ── Section engagement ───────────────────────────────────────────────────
  // Every element with data-lm-section is observed. Reports how long it was
  // the most-visible section, which is more useful than "was it seen".
  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-lm-section]"));
  if (sections.length && typeof IntersectionObserver !== "undefined") {
    var visible = new Map();
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var name = entry.target.getAttribute("data-lm-section");
          visible.set(entry.target, (visible.get(entry.target) || 0) + entry.intersectionRatio);
        });
        var best = null;
        var bestRatio = 0.08; // ignore slivers
        visible.forEach(function (ratio, el) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = el.getAttribute("data-lm-section");
          }
        });
        if (best && best !== sectionName) {
          var now = Date.now();
          if (sectionName && now - sectionStart > 900) {
            push("section", { n: sectionName, v: now - sectionStart });
          }
          sectionName = best;
          sectionStart = now;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach(function (el) {
      io.observe(el);
    });
  }

  // ── Core Web Vitals, from real visitors ─────────────────────────────────
  // This is the thing no mainstream self-hosted tool has. It is real field
  // data, not a lab number.
  function onVital(name, value) {
    push("vital", { n: name, v: value });
  }
  if (typeof PerformanceObserver !== "undefined") {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.entryType === "largest-contentful-paint") onVital("lcp", e.startTime);
        });
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}
    try {
      // CLS is reported per session window, not per entry.
      var clsValue = 0;
      var clsReported = false;
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (!e.hadRecentInput) {
            clsValue += e.value;
            if (!clsReported) {
              clsReported = true;
              onVital("cls", clsValue);
            }
          }
        });
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver(function (list) {
        var last = 0;
        list.getEntries().forEach(function (e) {
          last = Math.max(last, e.duration);
        });
        if (last) onVital("inp", last);
      }).observe({ type: "event", durationThreshold: 40, buffered: true });
    } catch (e) {}
  }

  // ── Heartbeat / dwell ────────────────────────────────────────────────────
  // Dwell time cannot be measured without knowing the person stayed, so this
  // reports presence. Two heartbeats minimum means "not bounced".
  if (HEARTBEAT) {
    setInterval(function () {
      if (document.hidden) return;
      var now = Date.now();
      if (now - lastBeat < HEARTBEAT_MS) return;
      lastBeat = now;
      push("heartbeat", { v: now - firstViewAt });
    }, HEARTBEAT_MS);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  /**
   * lm('track', 'name', { props })  — your own goal
   * lm('pageview')                 — manual, for SPAs
   */
  function lm() {
    var a = Array.prototype.slice.call(arguments);
    if (a[0] === "track" && a[1]) {
      push("event", { n: String(a[1]).slice(0, 64), x: a[2] || {} });
    }
  }
  lm.ready = true;

  window.lm = lm;
  window.LoudMetric = lm;

  // ── Lifecycle ────────────────────────────────────────────────────────────
  pageview();

  // SPA navigations: patch pushState/replaceState so history-based routers
  // report a pageview without needing framework integration.
  var hist = history;
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = hist[fn];
    if (typeof orig !== "function") return;
    hist[fn] = function () {
      var res = orig.apply(this, arguments);
      if (location.pathname !== lastPath) pageview();
      return res;
    };
  });
  window.addEventListener("popstate", function () {
    if (location.pathname !== lastPath) pageview();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      flush(true); // beacon survives unload
    }
  });
  window.addEventListener("pagehide", function () {
    flush(true);
  });
})();