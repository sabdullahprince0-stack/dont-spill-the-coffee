// Fixed-step driving, sustained tilt, slosh, overflow and droplets. Keep random call order.
(function (game) {
    'use strict';
    const sim = game.state;
    const { G, W, H, fill0, clamp } = game.config;
    function newEvent() {
        let l = game.routes.levels[sim.level], r = Math.random(), chained = sim.chain !== null;
        let kind = chained ? sim.chain : (r < .36 ? 'BRAKE!' : r < .72 ? 'FULL THROTTLE!' : r < .92 ? 'POTHOLE!' : 'ROUGH ROAD!');
        sim.chain = null;
        let bump = kind === 'POTHOLE!' || kind === 'ROUGH ROAD!', sign = kind === 'BRAKE!' ? -1 : 1;
        let warn = Math.max(.28, .72 - sim.level * .075);
        if (chained)
            warn = Math.max(.2, warn * .7);
        sim.event = {
            kind,
            start: sim.t + warn,
            dur: bump ? (kind === 'ROUGH ROAD!' ? 1.0 : .72) : .8 + Math.random() * 1.05,
            force: sign * l[2] * (.8 + Math.random() * .28) * 1.2
        };
        let gap = .55 + Math.random() * Math.max(.35, 1.3 - sim.level * .18);
        if (!chained && sim.level >= 1 && Math.random() < .14 + sim.level * .11) {
            sim.chain = bump ? (Math.random() < .5 ? 'BRAKE!' : 'FULL THROTTLE!') : (Math.random() < .6 ? 'POTHOLE!' : kind === 'BRAKE!' ? 'FULL THROTTLE!' : 'BRAKE!');
            gap = .06 + Math.random() * .16;
        }
        sim.next = sim.event.start + sim.event.dur + gap;
        game.audio.warning();
    }
    function step(dt) {
        if (sim.state !== 'play')
            return;
        sim.t += dt;
        if (sim.t >= sim.next)
            game.physics.newEvent();
        let target = 0;
        sim.ay = 0;
        if (sim.event && sim.t >= sim.event.start && sim.t < sim.event.start + sim.event.dur) {
            let u = (sim.t - sim.event.start) / sim.event.dur;
            let envelope = Math.min(1, u * 11, (1 - u) * 11);
            if (sim.event.kind === 'POTHOLE!' || sim.event.kind === 'ROUGH ROAD!') {
                sim.ay = Math.sin(u * Math.PI * 4) * game.routes.levels[sim.level][3] * 3.15 * envelope;
                target = sim.event.force * .25 * envelope;
            }
            else
                target = sim.event.force * envelope;
        }
        sim.ax += (target - sim.ax) * Math.min(1, dt * 10);
        sim.speed = clamp(sim.speed + sim.ax * dt, 3, 23);
        sim.dist += sim.speed * dt;
        // Softly follow the physical velocity at a deliberately lower visual scale.
        sim.visualSpeed += (sim.speed - sim.visualSpeed) * (1 - Math.exp(-dt * 2.3));
        sim.scroll += sim.visualSpeed * dt * [4.2, 1.5, 0][sim.motion];
        let dir = (sim.keys.right ? 1 : 0) - (sim.keys.left ? 1 : 0);
        // Brief corrections retain the v0.6 response; a held key progressively tips to 60 degrees.
        if (dir !== sim.lastDir) {
            sim.hold = 0;
            sim.lastDir = dir;
        }
        if (dir)
            sim.hold += dt;
        else
            sim.hold = 0;
        let desired = dir * (.73 + .32 * clamp((sim.hold - .42) / .50, 0, 1));
        sim.omega += (19 * (desired - sim.theta) - 7.5 * sim.omega) * dt;
        sim.theta += sim.omega * dt;
        let effective = Math.atan2(-sim.ax * 1.22, Math.max(2, G + sim.ay));
        let equilibrium = clamp(effective - sim.theta, -1.15, 1.15);
        sim.sv += (28 * (equilibrium - sim.slosh) - 3.2 * sim.sv - 1.1 * sim.omega) * dt;
        sim.slosh = clamp(sim.slosh + sim.sv * dt, -1.25, 1.25);
        let h = H * fill0 * sim.amount;
        let rise = Math.abs(Math.tan(sim.slosh)) * W / 2;
        let splash = Math.abs(sim.ay) * 3.2 + Math.abs(sim.sv) * 4;
        let overflow = Math.max(0, h + rise + splash - H);
        // Deep tilt: estimate the liquid volume below the lower rim using a rectangular cross section.
        // Blend in the geometric correction beyond the normal control range to retain the existing balance.
        let slope = Math.abs(Math.tan(sim.slosh)), rim = Math.max(0, H - splash);
        let capacity = slope * W <= rim ? rim - slope * W / 2 : rim * rim / (2 * slope * W);
        let deep = clamp((Math.abs(sim.theta) - .78) / .20, 0, 1);
        overflow += (Math.max(0, h - capacity) - overflow) * deep;
        if (overflow > 0 && sim.amount > 0) {
            let loss = Math.min(sim.amount, overflow * .0042 * dt);
            sim.amount -= loss;
            if (sim.t - sim.lastSpill > .075) {
                sim.lastSpill = sim.t;
                let side = sim.slosh > 0 ? -1 : 1;
                let lip = game.render.cupPoint(side < 0 ? .22 : .70, .19);
                sim.drops.push({
                    x: lip[0],
                    y: lip[1],
                    vx: side * (60 + Math.random() * 100),
                    vy: -80 - Math.random() * 120,
                    life: 1,
                    size: 1 + deep * Math.min(1, overflow / 30) * .85
                });
                game.audio.spill(side);
            }
        }
        for (let d of sim.drops) {
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vy += 500 * dt;
            d.life -= dt;
        }
        sim.drops = sim.drops.filter(d => d.life > 0);
        if (sim.amount <= .001 || sim.t >= game.routes.levels[sim.level][1])
            game.endings.finish();
    }
    game.physics = {
        newEvent,
        step
    };
})(window.CoffeeGame);
