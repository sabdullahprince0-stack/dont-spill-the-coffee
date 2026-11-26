// Original grade precision, route results, campaign average and approved dialogue.
(function (game) {
    'use strict';
    const sim = game.state;
    const $ = id => document.getElementById(id);
    const endings = {
        S: ['THE PERFECT DELIVERY', '“You really came all this way for me?”\n“Next time, let’s get coffee together.”'],
        A: ['A LITTLE CLOSER', '“You actually remembered my order!”\n“You’re really sweet, you know that?”'],
        B: ['IT’S THE THOUGHT THAT COUNTS', '“What happened to this?”\n“Haha, it’s okay. Thank you for thinking of me.”'],
        C: ['THE FRIENDZONE', '“Did you drink half of it on the way here?”\n“Thanks, bro.”']
    };
    function grade(a) {
        return a >= .95 ? 'S' : a >= .8 ? 'A' : a >= .6 ? 'B' : a >= .4 ? 'C' : 'F';
    }
    function campaignScore(best = sim.save.best) {
        const values = game.routes.levels.map((_, i) => best[i]);
        if (!values.every(v => Number.isFinite(v) && v >= .4 && v <= 1))
            return null;
        return Math.round(values.reduce((n, v) => n + v, 0) / values.length * 1e12) / 1e12;
    }
    function percent(v) {
        return (Math.floor(v * 1000 + 1e-9) / 10).toFixed(1) + '%';
    }
    function showEnding() {
        let score = game.endings.campaignScore();
        if (score === null)
            return;
        sim.state = 'end';
        sim.keys = {};
        let g = game.endings.grade(score), [title, dialogue] = endings[g];
        game.ui.panel(title, `Overall delivery: ${game.endings.percent(score)} · Grade ${g}\n\n${dialogue}\n\nBased on your best successful delivery on each route.`, [['Improve a route', () => game.main.start(0)], ['Main menu', game.ui.showCafe]]);
        let el = $('endingScores');
        el.replaceChildren();
        game.routes.levels.forEach((_, i) => {
            let item = document.createElement('span'), value = document.createElement('b');
            item.textContent = `Route 0${i + 1} · `;
            value.textContent = `${game.endings.percent(sim.save.best[i])} ${game.endings.grade(sim.save.best[i])}`;
            item.append(value);
            el.append(item);
        });
        el.hidden = false;
    }
    function finish() {
        sim.state = 'end';
        let g = game.endings.grade(sim.amount), pass = sim.amount >= .4;
        sim.save.best[sim.level] = Math.max(sim.save.best[sim.level] || 0, sim.amount);
        if (pass)
            sim.save.unlocked = Math.max(sim.save.unlocked, Math.min(5, sim.level + 1));
        game.persistProgress();
        game.ui.routes();
        game.audio.result(pass);
        let desc = `${game.endings.percent(sim.amount)} delivered · Grade ${g}. `;
        if (!pass)
            desc += 'Your crush received a cup of disappointment. Try again.';
        else if (sim.level === 5)
            desc += 'You made it to campus! Your overall grade determines the ending.';
        else
            desc += 'Delivery accepted! Next route unlocked.';
        let buttons = [['Retry', () => game.main.start(sim.level)]];
        if (pass && sim.level < 5)
            buttons.push(['Next route →', () => game.main.start(sim.level + 1)]);
        let total = game.endings.campaignScore();
        if (total !== null) {
            desc += ` Overall: ${game.endings.percent(total)} (${game.endings.grade(total)}).`;
            buttons.push(['View ending', game.endings.showEnding]);
        }
        else if (pass && sim.level === 5)
            desc += ' Complete all six routes successfully to unlock the ending.';
        buttons.push(['Main menu', game.ui.showCafe]);
        game.ui.panel(pass ? (sim.level === 5 ? 'YOU MADE IT!' : 'DELIVERY COMPLETE') : 'DELIVERY FAILED', desc, buttons);
    }
    game.endings = {
        grade,
        campaignScore,
        percent,
        showEnding,
        finish
    };
})(window.CoffeeGame);
