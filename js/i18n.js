/* Pegasus: English-only public site after retiring automatic translation.
 * Preserve first-party analytics without a language selector, dictionary reads,
 * translation queues, language auto-detection or paid AI translation.
 */
(function () {
  'use strict';
  if (window.__pegI18n) return;
  window.__pegI18n = true;

  // This shared script also bootstraps analytics. Do not remove it from pages.
  try {
    var tr = document.createElement('script');
    tr.src = '/js/pegasus-track.js?v=1';
    tr.defer = true;
    (document.head || document.documentElement).appendChild(tr);
  } catch (e) {}

  // Clear the old auto-selected locale so future links stay in English.
  try { localStorage.removeItem('peg_lang'); } catch (e) {}

  // Legacy ?lang=… links should settle on the canonical English URL.
  try {
    var url = new URL(window.location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      window.location.replace(url.pathname + url.search + url.hash);
    }
  } catch (e) {}
})();
