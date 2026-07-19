/**
 * Pilah — Meta Pixel stub helpers
 * No-op when metaPixelId is empty. No real tracking until configured.
 */
(function(){
  window.NRDS_CONFIG = window.NRDS_CONFIG || {};
  window.NRDS_CONFIG.metaPixelId = '858215920458180';

  var _pixelId = '';
  var _enabled = false;

  function initPixel() {
    _pixelId = (window.NRDS_CONFIG.metaPixelId || '').trim();
    _enabled = !!_pixelId;
    if (!_enabled) {
      console.log('[Pilah] Meta pixel disabled — no metaPixelId configured.');
      return;
    }
    // Only load if enabled and ID is set
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', _pixelId);
    /* eslint-enable */
  }

  /**
   * Track a ViewContent event (no-op if pixel disabled)
   * @param {Object} params — optional {content_name, content_category, value, currency}
   */
  function trackViewContent(params) {
    if (!_enabled) return;
    if (typeof fbq === 'function') fbq('track', 'ViewContent', params || {});
  }

  /**
   * Track an InitiateCheckout event
   * @param {Object} params — optional {content_name, content_type, num_items, value, currency}
   */
  function trackInitiateCheckout(params) {
    if (!_enabled) return;
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', params || {});
  }

  /**
   * Track a Lead event (form submission without purchase)
   * @param {Object} params — optional {content_name, content_category}
   */
  function trackLead(params) {
    if (!_enabled) return;
    if (typeof fbq === 'function') fbq('track', 'Lead', params || {});
  }

  /**
   * NO Purchase event in browser per spec.
   * Purchase tracking will be server-side only.
   */

  // Expose API
  window.NRDS_PIXEL = {
    init: initPixel,
    viewContent: trackViewContent,
    initiateCheckout: trackInitiateCheckout,
    lead: trackLead
  };

  // Auto-init on load
  initPixel();
})();
