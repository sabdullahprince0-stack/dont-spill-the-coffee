// Canvas scenery, cup geometry, liquid, droplets and raster HUD lettering.
(function (game) {
    'use strict';
    const sim = game.state;
    const { CW, CH, clamp } = game.config;
    const $ = id => document.getElementById(id), c = $('c'), x = c.getContext('2d');
    // Presentation only: never write these values back into the physical model.
    const scenery = { scroll: 0, bump: 0, driveGain: 1, scrollRate: 0 };
    function resetScenery() {
        scenery.scroll = scenery.bump = 0;
        scenery.driveGain = 1;
        scenery.scrollRate = 0;
    }
    function updateScenery(dt) {
        if (sim.state !== 'play' || dt <= 0)
            return;
        // Short events produce small physical velocity changes. Emphasize their
        // driving condition visually, only once the warning interval has ended.
        const active = sim.event && sim.t >= sim.event.start && sim.t < sim.event.start + sim.event.dur;
        const kind = active ? sim.event.kind : '';
        const gain = kind === 'FULL THROTTLE!' ? 1.9 : kind === 'BRAKE!' ? .45 : 1;
        scenery.driveGain += (gain - scenery.driveGain) * (1 - Math.exp(-dt * (gain === 1 ? 6 : 10)));
        // Keep accumulating phase; never multiply the existing displacement by
        // the gain. Cap presentation speed at ~78 px/s Gentle, ~28 px/s Minimal
        // (the window renderer applies another .58 factor). Still remains zero.
        scenery.scrollRate = Math.min(32, Math.max(0, sim.speed) * scenery.driveGain) * [4.2, 1.5, 0][sim.motion];
        scenery.scroll += scenery.scrollRate * dt;
        const limit = [1.25, .35, 0][sim.motion];
        const target = clamp(sim.ay * [.18, .045, 0][sim.motion], -limit, limit);
        scenery.bump = clamp(scenery.bump + (target - scenery.bump) * (1 - Math.exp(-12 * dt)), -limit, limit);
    }
    const cavity = [[.211, .181], [.23, .137], [.276, .108], [.34, .091], [.42, .079], [.50, .079], [.58, .088], [.64, .107], [.683, .138], [.706, .171], [.705, .195], [.684, .224], [.646, .248], [.59, .270], [.52, .286], [.456, .290], [.39, .284], [.33, .271], [.28, .251], [.242, .225], [.218, .202]];
    const spriteW = 460, spriteH = 460 * 1312 / 1199, originX = -210, originY = -245;
    function text(s, a, b, size = 18, color = '#ebdab9', align = 'left') {
        s = String(s).toUpperCase();
        let scale = size / 64;
        let width = [...s].reduce((n, ch) => n + (game.assets.glyphs[ch]?.[4] || 18) * scale, 0);
        let left = align === 'right' ? a - width : align === 'center' ? a - width / 2 : a;
        if (!game.assets.ready(game.assets.images.font)) {
            x.fillStyle = color;
            x.font = `${size}px Georgia`;
            x.textAlign = align;
            x.fillText(s, a, b + size * .8);
            return;
        }
        x.save();
        x.shadowColor = '#1c120c';
        x.shadowBlur = 5;
        x.shadowOffsetY = 2;
        for (const ch of s) {
            let g = game.assets.glyphs[ch];
            if (g) {
                if (ch !== ' ')
                    x.drawImage(game.assets.images.font, g[0], g[1], g[2], g[3], left - 4 * scale, b - 5 * scale, g[2] * scale, g[3] * scale);
                left += g[4] * scale;
            }
            else
                left += 18 * scale;
        }
        x.restore();
    }
    function cupPoint(u, v) {
        const a = originX + u * spriteW, b = originY + v * spriteH;
        return [450 + a * Math.cos(sim.theta) - b * Math.sin(sim.theta), 350 + Math.sin(sim.t * 23) * sim.ay * [1.0, .55, 0][sim.motion] + a * Math.sin(sim.theta) + b * Math.cos(sim.theta)];
    }
    function drawStreet() {
        let im = game.routes.imageFor('street');
        if (!game.assets.ready(im))
            return;
        // Use the original renderer (including its tint) while the PNG is unavailable.
        if (game.routes.art[sim.level].panorama && im === game.routes.art[sim.level].street) {
            drawPanorama(im);
            return;
        }
        let ht = 294, wd = ht * im.width / im.height;
        for (let side = 0; side < 2; side++) {
            x.save();
            x.beginPath();
            x.rect(side * 450, 0, 450, CH);
            x.clip();
            let delta = (scenery.scroll * .58 * (side ? 1 : -1) + (side ? wd * .43 : wd * .15)) % wd;
            let pos = ((delta % wd) + wd) % wd - wd;
            for (let i = 0; i < 3; i++)
                x.drawImage(im, pos + i * wd, 93, wd, ht);
            x.restore();
        }
        // Slight dusk tint keeps the windows in the same palette.
        x.fillStyle = game.routes.art[sim.level].tint;
        x.fillRect(0, 0, CW, CH);
    }
    let panoramaImage, panoramaTile, panoramaPattern;
    function drawPanorama(im) {
        if (panoramaImage !== im) {
            // The supplied edges are different. Blend only a narrow end/head overlap
            // once in memory; keep the source file, colors and uniform scale intact.
            const overlap = Math.round(im.naturalHeight * .16);
            const period = im.naturalWidth - overlap;
            panoramaTile = document.createElement('canvas');
            panoramaTile.width = period;
            panoramaTile.height = im.naturalHeight;
            const tile = panoramaTile.getContext('2d');
            tile.drawImage(im, overlap, 0, period, im.naturalHeight, 0, 0, period, im.naturalHeight);
            const head = document.createElement('canvas');
            head.width = overlap;
            head.height = im.naturalHeight;
            const blend = head.getContext('2d');
            blend.drawImage(im, 0, 0);
            blend.globalCompositeOperation = 'destination-in';
            const fade = blend.createLinearGradient(0, 0, overlap, 0);
            fade.addColorStop(0, 'rgba(0,0,0,0)');
            fade.addColorStop(1, 'rgba(0,0,0,1)');
            blend.fillStyle = fade;
            blend.fillRect(0, 0, overlap, im.naturalHeight);
            tile.drawImage(head, period - overlap, 0);
            panoramaPattern = x.createPattern(panoramaTile, 'repeat-x');
            panoramaImage = im;
        }
        const scale = 294 / im.naturalHeight;
        const width = panoramaTile.width * scale;
        for (let side = 0; side < 2; side++) {
            x.save();
            x.beginPath();
            x.rect(side * 450, 0, 450, CH);
            x.clip();
            // Same directions, pixel speed and scale; raise this artwork's lower
            // skyline so the storefronts and curb sit naturally above the sill.
            const delta = scenery.scroll * .58 * (side ? 1 : -1) + width * (side ? .43 : .15);
            const pos = ((delta % width) + width) % width - width;
            x.translate(pos, 40);
            x.scale(scale, scale);
            x.fillStyle = panoramaPattern;
            // A repeating pattern avoids subpixel gaps between separate drawImage tiles.
            x.fillRect(-pos / scale, 0, CW / scale, im.naturalHeight);
            x.restore();
        }
    }
    function drawCup() {
        let cup = game.routes.imageFor('cup');
        if (!game.assets.ready(cup))
            return;
        x.save();
        x.translate(450, 350 + Math.sin(sim.t * 23) * sim.ay * [1.0, .55, 0][sim.motion]);
        x.rotate(sim.theta);
        x.drawImage(cup, originX, originY, spriteW, spriteH);
        if (sim.amount > .001) {
            x.save();
            x.translate(originX, originY);
            x.scale(spriteW, spriteH);
            x.beginPath();
            cavity.forEach(([u, v], i) => i ? x.lineTo(u, v) : x.moveTo(u, v));
            x.closePath();
            x.clip();
            let fill = clamp(sim.amount, 0, 1);
            let cx = .458, cy = .271 - .053 * fill, rx = .07 + .17 * Math.sqrt(fill), ry = .013 + .067 * Math.sqrt(fill);
            let angle = clamp(sim.slosh * (.55 + .35 * clamp((Math.abs(sim.theta) - .78) / .20, 0, 1)), -1.15, 1.15);
            x.translate(cx, cy);
            x.rotate(angle);
            x.beginPath();
            x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            x.save();
            x.clip();
            x.fillStyle = '#352014';
            x.fillRect(-rx, -ry, rx * 2, ry * 2);
            if (game.assets.ready(game.assets.images.liquid))
                x.drawImage(game.assets.images.liquid, -rx, -ry, rx * 2, ry * 2);
            let grd = x.createLinearGradient(0, -ry, 0, ry);
            grd.addColorStop(0, 'rgba(29,14,7,.4)');
            grd.addColorStop(.6, 'rgba(0,0,0,0)');
            grd.addColorStop(1, 'rgba(45,22,10,.3)');
            x.fillStyle = grd;
            x.fillRect(-rx, -ry, rx * 2, ry * 2);
            x.restore();
            x.strokeStyle = '#b18051';
            x.lineWidth = .0026;
            x.globalAlpha = .7;
            x.beginPath();
            x.ellipse(0, 0, rx * .97, ry * .92, 0, Math.PI, 2 * Math.PI);
            x.stroke();
            x.globalAlpha = 1;
            for (let j = 0; j < 20; j++) {
                let a = Math.PI + j / 19 * Math.PI;
                let u = Math.cos(a) * rx * .91, v = Math.sin(a) * ry * .84;
                x.fillStyle = j % 3 ? '#a16d3f' : '#d0a16b';
                x.globalAlpha = .45;
                x.beginPath();
                x.ellipse(u, v, .0028 + (j % 3) * .001, .0018, 0, 0, Math.PI * 2);
                x.fill();
            }
            x.restore();
        }
        x.restore();
    }
    function draw() {
        x.clearRect(0, 0, CW, CH);
        x.fillStyle = '#211b17';
        x.fillRect(0, 0, CW, CH);
        x.save();
        // Give the exterior its own damped bump response, with no camera shake
        // added on top. The interior and cup retain their original motion.
        x.translate(CW / 2, CH / 2 + (sim.motion === 2 ? 0 : scenery.bump));
        x.scale(1.017, 1.017);
        x.translate(-CW / 2, -CH / 2);
        game.render.drawStreet();
        x.restore();
        x.save();
        let j = Math.sin(sim.t * 31) * sim.ay * [.13, .035, 0][sim.motion];
        x.translate(CW / 2, CH / 2 + j);
        x.scale(1.017, 1.017);
        x.translate(-CW / 2, -CH / 2);
        let interior = game.routes.imageFor('interior');
        if (game.assets.ready(interior))
            x.drawImage(interior, 0, 0, CW, CH);
        x.restore();
        game.render.drawCup();
        for (let d of sim.drops) {
            x.save();
            x.translate(d.x, d.y);
            x.rotate(Math.atan2(d.vy, d.vx) + Math.PI / 2);
            x.globalAlpha = Math.min(1, d.life * 2);
            x.fillStyle = '#49291a';
            x.beginPath();
            x.ellipse(0, 0, 3 * (d.size || 1), 6 * (d.size || 1), 0, 0, 7);
            x.fill();
            x.strokeStyle = '#ba8652';
            x.lineWidth = .8;
            x.beginPath();
            x.moveTo(-1, -4);
            x.lineTo(-2, 0);
            x.stroke();
            x.restore();
        }
        let top = x.createLinearGradient(0, 0, 0, 105);
        top.addColorStop(0, 'rgba(18,13,10,.65)');
        top.addColorStop(1, 'rgba(18,13,10,0)');
        x.fillStyle = top;
        x.fillRect(0, 0, CW, 105);
        let bottom = x.createLinearGradient(0, CH - 95, 0, CH);
        bottom.addColorStop(0, 'rgba(18,13,10,0)');
        bottom.addColorStop(1, 'rgba(18,13,10,.65)');
        x.fillStyle = bottom;
        x.fillRect(0, CH - 95, CW, 95);
        game.render.text(`ROUTE 0${sim.level + 1}`, 25, 23, 23);
        game.render.text(game.routes.levels[sim.level][0], 25, 51, 16);
        game.render.text('COFFEE LEFT', 875, 22, 19, undefined, 'right');
        game.render.text(`${Math.round(sim.amount * 100)}%`, 875, 48, 43, undefined, 'right');
        x.strokeStyle = '#d2b78c';
        x.lineWidth = 1.5;
        x.globalAlpha = .4;
        x.beginPath();
        x.moveTo(776, 100);
        x.quadraticCurveTo(827, 98, 875, 100);
        x.stroke();
        x.globalAlpha = 1;
        x.beginPath();
        x.moveTo(776, 100);
        x.lineTo(776 + 99 * sim.amount, 100);
        x.stroke();
        if (sim.event && sim.t < sim.event.start + sim.event.dur) {
            let warning = sim.t < sim.event.start;
            let s = warning ? 'INCOMING: ' + sim.event.kind : sim.event.kind;
            game.render.text(s, 450, 70, warning ? 18 : 31, undefined, 'center');
        }
        game.render.text(`${Math.round(sim.speed * 3.6)} KM/H`, 25, CH - 78, 30);
        game.render.text(`ACCEL ${sim.ax.toFixed(1)} M/S²`, 25, CH - 43, 15);
        game.render.text('TO CAMPUS', 875, CH - 78, 18, undefined, 'right');
        game.render.text(`${Math.max(0, Math.ceil(game.routes.levels[sim.level][1] - sim.t))} S LEFT`, 875, CH - 53, 26, undefined, 'right');
        let progress = clamp(sim.t / game.routes.levels[sim.level][1], 0, 1);
        x.strokeStyle = '#e0c6a0';
        x.lineWidth = 1.3;
        x.globalAlpha = .25;
        x.beginPath();
        x.moveTo(25, CH - 14);
        x.lineTo(875, CH - 14);
        x.stroke();
        x.globalAlpha = 1;
        x.beginPath();
        x.moveTo(25, CH - 14);
        x.lineTo(25 + 850 * progress, CH - 14);
        x.stroke();
        $('route').textContent = `Route ${sim.level + 1}/6 · ${game.routes.levels[sim.level][0]}`;
        $('coffee').textContent = `Coffee ${Math.round(sim.amount * 100)}%`;
        $('accel').textContent = `Acceleration ${sim.ax.toFixed(1)} m/s²`;
        $('distance').textContent = `Distance ${Math.round(sim.dist)} m`;
    }
    game.render = {
        scenery,
        resetScenery,
        updateScenery,
        text,
        cupPoint,
        drawStreet,
        drawCup,
        draw
    };
})(window.CoffeeGame);
