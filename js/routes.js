// Approved route order, difficulty parameters, artwork and lighting.
(function (game) {
    'use strict';
    const sim = game.state;
    const levels = [['The neighborhood', 32, 2.8, 0.45], ['City traffic', 38, 4.2, .7], ['Pothole province', 42, 4.8, 1.5], ['Mountain road', 46, 5.8, 1.25], ['Highway madness', 48, 7, 1.0], ['The jeepney final boss', 55, 8.2, 2.1]];
    const routeArt = [{
            street: game.assets.images.street,
            interior: game.assets.images.interior,
            cup: game.assets.images.cup,
            tint: 'rgba(36,22,26,.18)'
        }];
    for (let i = 2; i <= 6; i++) {
        let art = {};
        for (const [key, file] of Object.entries({
            street: `street-${i}.jpg`,
            interior: `interior-${i}.webp`,
            cup: `hand-empty-${i}.webp`
        })) {
            let im = new Image();
            im.src = 'assets/' + file;
            art[key] = im;
        }
        art.tint = ['rgba(20,24,42,.13)', 'rgba(92,70,38,.035)', 'rgba(40,60,72,.09)', 'rgba(10,18,36,.16)', 'rgba(28,20,34,.12)'][i - 2];
        routeArt.push(art);
    }
    function routeImage(key) {
        let im = game.routes.art[sim.level][key];
        return game.assets.ready(im) ? im : game.assets.images[key];
    }
    game.routes = {
        levels,
        art: routeArt,
        imageFor: routeImage
    };
})(window.CoffeeGame);
