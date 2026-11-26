// Initialization, route reset and the original requestAnimationFrame accumulator.
(function (game) {
    'use strict';
    const sim = game.state;
    const $ = id => document.getElementById(id);
    function start(i) {
        $('cafe').hidden = true;
        $('cafe-dialog').hidden = true;
        $('game').hidden = false;
        sim.level = i;
        sim.t = 0;
        sim.amount = 1;
        sim.theta = sim.omega = sim.slosh = sim.sv = sim.ax = sim.ay = sim.dist = sim.scroll = 0;
        sim.speed = 8;
        sim.visualSpeed = 0;
        sim.hold = sim.lastDir = 0;
        sim.chain = null;
        sim.event = null;
        sim.next = 2;
        sim.drops = [];
        sim.lastSpill = 0;
        sim.state = 'play';
        sim.keys = {};
        $('panel').hidden = true;
        game.ui.routes();
        game.audio.reset();
        game.audio.unlock();
    }
    let last = performance.now(), acc = 0;
    function loop(now) {
        let dt = Math.min(.05, (now - last) / 1000);
        last = now;
        acc += dt;
        while (acc >= 1 / 120) {
            game.physics.step(1 / 120);
            acc -= 1 / 120;
        }
        game.audio.update(dt);
        game.render.draw();
        sim.monitorClock += dt;
        if (sim.monitorClock >= .1) {
            sim.monitorClock = 0;
            game.ui.updatePhysics();
        }
        requestAnimationFrame(loop);
    }
    game.main = {
        start
    };
    game.ui.bindControls();
    game.ui.updateMotion();
    game.ui.updateSound();
    game.ui.routes();
    game.ui.showCafe();
    requestAnimationFrame(loop);
})(window.CoffeeGame);
