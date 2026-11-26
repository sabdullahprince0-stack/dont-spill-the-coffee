// Classic scripts share this one namespace so index.html also works over file://.
(function () {
  'use strict';
  window.CoffeeGame = {
    config: {
      // Cup model dimensions, not SI measurements. Keep the approved V0.7 tuning.
      G: 9.81, W: 160, H: 180, fill0: 0.87,
      CW: 900, CH: 506,
      motionModes: ['gentle', 'minimal', 'still'],
      clamp: (v, a, b) => Math.max(a, Math.min(b, v))
    }
  };
})();
