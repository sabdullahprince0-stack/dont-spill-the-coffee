// Shared mutable state and the original V0.7 save migration.
(function (game) {
    'use strict';
    game.state = {
        save: {
            unlocked: 0,
            best: []
        },
        level: 0,
        state: 'menu',
        t: 0,
        amount: 1,
        theta: 0,
        omega: 0,
        slosh: 0,
        sv: 0,
        ax: 0,
        ay: 0,
        speed: 0,
        dist: 0,
        event: null,
        next: 0,
        keys: {},
        drops: [],
        shake: 0,
        muted: false,
        lastSpill: 0,
        scroll: 0,
        visualSpeed: 0,
        chain: null,
        hold: 0,
        lastDir: 0,
        motion: 0,
        monitorOn: false,
        monitorClock: 0,
        cafeTrigger: null
    };
    const sim = game.state;
    const { motionModes } = game.config;
    try {
        let old = JSON.parse(localStorage.getItem('coffee-delivery-v1'));
        sim.save = JSON.parse(localStorage.getItem('coffee-delivery-v03')) || {
            unlocked: old?.unlocked || 0,
            best: []
        };
    }
    catch {
    }
    try {
        let m = localStorage.getItem('coffee-motion-v03');
        if (m !== null && motionModes.includes(m))
            sim.motion = motionModes.indexOf(m);
        else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            sim.motion = 2;
    }
    catch {
    }
    try {
        sim.muted = localStorage.getItem('coffee-sound-v04') === 'off';
    }
    catch {
    }
    function hasProgress() {
        return sim.save.unlocked > 0 || sim.save.best.some(v => v != null);
    }
    game.hasProgress = hasProgress;
    // Keep storage errors harmless, including browsers that restrict file:// storage.
    game.persistProgress = function () {
        try {
            localStorage.setItem('coffee-delivery-v03', JSON.stringify(sim.save));
        }
        catch {
        }
    };
})(window.CoffeeGame);
