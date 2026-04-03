/**
 * Cross-platform ad stub: Yandex Games, generic fullscreen, or no-op.
 * Replace or extend for your platform SDK.
 */
(function (global) {
  "use strict";

  var pending = [];

  function runPending() {
    var cb;
    while ((cb = pending.shift())) {
      try {
        cb();
      } catch (e) {
        console.warn("[ads]", e);
      }
    }
  }

  /**
   * Show fullscreen / interstitial after game over when possible.
   * @param {function} onClose — called when ad finished or unavailable
   */
  function showGameOverAd(onClose) {
    onClose = typeof onClose === "function" ? onClose : function () {};

    if (global.ysdk && global.ysdk.adv && typeof global.ysdk.adv.showFullscreenAdv === "function") {
      global.ysdk.adv.showFullscreenAdv({ callbacks: { onClose: onClose, onError: onClose } });
      return;
    }

    // Yandex Games (SDK variant with adv() promise)
    if (global.ysdk && typeof global.ysdk.adv === "function") {
      global.ysdk
        .adv()
        .then(function (adv) {
          if (adv.showFullscreenAdv) {
            return adv.showFullscreenAdv({
              callbacks: {
                onClose: onClose,
                onError: onClose,
              },
            });
          }
          onClose();
        })
        .catch(onClose);
      return;
    }

    if (global.yaGames && global.yaGames.adv) {
      var adv = global.yaGames.adv;
      if (adv.showFullscreenAdv) {
        adv.showFullscreenAdv({ onClose: onClose, onError: onClose });
        return;
      }
    }

    // Generic hook used by some hosts
    if (typeof global.showFullscreenAdv === "function") {
      try {
        global.showFullscreenAdv({ onClose: onClose });
        return;
      } catch (e) {
        onClose();
        return;
      }
    }

    // Development / no SDK
    pending.push(onClose);
    setTimeout(runPending, 400);
  }

  global.GameAds = {
    showGameOverAd: showGameOverAd,
  };
})(typeof window !== "undefined" ? window : globalThis);
