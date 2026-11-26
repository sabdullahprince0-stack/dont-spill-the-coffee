// Menus, route buttons, monitor, preferences and keyboard/pointer wiring.
(function (game) {
    'use strict';
    const sim = game.state;
    const { G, motionModes, clamp } = game.config;
    const $ = id => document.getElementById(id);
    function panel(title, desc, buttons) {
        $('endingScores').hidden = true;
        $('pt').textContent = title;
        $('pd').textContent = desc;
        $('actions').replaceChildren();
        for (let [label, fn] of buttons) {
            let b = document.createElement('button');
            b.textContent = label;
            b.onclick = fn;
            $('actions').append(b);
        }
        $('panel').hidden = false;
    }
    function routes() {
        $('routes').replaceChildren();
        game.routes.levels.forEach((l, i) => {
            let b = document.createElement('button');
            b.textContent = `${i + 1}. ${l[0]}${sim.save.best[i] != null ? ' · ' + game.endings.grade(sim.save.best[i]) : ''}`;
            b.disabled = i > sim.save.unlocked;
            b.className = i === sim.level ? 'active' : '';
            b.onclick = () => game.main.start(i);
            $('routes').append(b);
        });
    }
    function pause() {
        if (sim.state === 'play') {
            sim.state = 'pause';
            game.ui.panel('PAUSED', 'Your coffee can wait.', [['Resume', () => {
                        sim.state = 'play';
                        $('panel').hidden = true;
                        sim.keys = {};
                    }
                ], ['Restart', () => game.main.start(sim.level)], ['Main menu', game.ui.showCafe]]);
        }
        else if (sim.state === 'pause') {
            sim.state = 'play';
            $('panel').hidden = true;
            sim.keys = {};
        }
    }
    function updatePhysics() {
        if (!sim.monitorOn)
            return;
        const gy = Math.max(2, G + sim.ay), gx = -sim.ax * 1.22, deg = 180 / Math.PI;
        const values = {
            pv: sim.speed.toFixed(2),
            pax: sim.ax.toFixed(2),
            pay: sim.ay.toFixed(2),
            pdist: sim.dist.toFixed(1),
            ptheta: (sim.theta * deg).toFixed(1),
            pslosh: (sim.slosh * deg).toFixed(1),
            pg: Math.hypot(gx, gy).toFixed(2),
            pangle: (Math.atan2(gx, gy) * deg).toFixed(1),
            pke: (.5 * sim.speed * sim.speed).toFixed(2),
            pcoffee: (sim.amount * 100).toFixed(1)
        };
        for (const [id, value] of Object.entries(values))
            $(id).textContent = value;
    }
    function togglePhysics() {
        sim.monitorOn = !sim.monitorOn;
        $('physicsMonitor').hidden = !sim.monitorOn;
        $('physicsToggle').textContent = 'Physics: ' + (sim.monitorOn ? 'on' : 'off');
        $('physicsToggle').setAttribute('aria-expanded', String(sim.monitorOn));
        game.ui.updatePhysics();
    }
    function updateMotion() {
        $('motion').textContent = 'Motion: ' + motionModes[sim.motion];
        try {
            localStorage.setItem('coffee-motion-v03', motionModes[sim.motion]);
        }
        catch {
        }
    }
    function updateSound() {
        $('mute').textContent = 'Sound: ' + (sim.muted ? 'off' : 'on');
        $('mute').setAttribute('aria-pressed', String(!sim.muted));
        try {
            localStorage.setItem('coffee-sound-v04', sim.muted ? 'off' : 'on');
        }
        catch {
        }
    }
    function closeCafeDialog() {
        $('cafe-dialog').hidden = true;
        if (sim.cafeTrigger)
            sim.cafeTrigger.focus();
    }
    function cafePanel(title, desc, buttons) {
        if ($('cafe-dialog').hidden)
            sim.cafeTrigger = document.activeElement;
        $('menuTitle').textContent = title;
        $('menuDesc').textContent = desc;
        $('menuActions').replaceChildren();
        for (const [label, fn] of buttons) {
            const b = document.createElement('button');
            b.textContent = label;
            b.onclick = fn;
            $('menuActions').append(b);
        }
        $('cafe-dialog').hidden = false;
        $('menuActions').firstElementChild?.focus();
    }
    function showCafe() {
        sim.state = 'menu';
        sim.keys = {};
        $('game').hidden = true;
        $('panel').hidden = true;
        $('cafe').hidden = false;
        $('cafe-dialog').hidden = true;
        $('menuContinue').disabled = !game.hasProgress();
        $('menuStart').focus({
            preventScroll: true
        });
        $('menuStart').blur();
    }
    function cafeSettings() {
        game.ui.cafePanel('Settings', 'Choose the motion level that feels comfortable. These settings do not change the coffee physics.', [[`Motion: ${motionModes[sim.motion]}`, () => {
                    sim.motion = (sim.motion + 1) % motionModes.length;
                    game.ui.updateMotion();
                    game.ui.cafeSettings();
                }
            ], [`Sound: ${sim.muted ? 'off' : 'on'}`, () => {
                    sim.muted = !sim.muted;
                    game.ui.updateSound();
                    if (!sim.muted)
                        game.audio.unlock();
                    game.ui.cafeSettings();
                }
            ], ['Back', game.ui.closeCafeDialog]]);
    }
    function cafeReturn() {
        if (sim.state === 'end') {
            game.ui.showCafe();
            return;
        }
        game.ui.panel('RETURN TO MAIN MENU?', 'Your completed routes and best grades are saved. This unfinished delivery will restart.', [['Main menu', game.ui.showCafe], ['Resume', () => {
                    sim.state = 'play';
                    sim.keys = {};
                    $('panel').hidden = true;
                }
            ]]);
    }
    function bindControls() {
        $('physicsToggle').onclick = game.ui.togglePhysics;
        window.addEventListener('keydown', e => {
            let k = e.key.toLowerCase();
            if (sim.state === 'menu') {
                if (k === 'escape' && !$('cafe-dialog').hidden)
                    game.ui.closeCafeDialog();
                return;
            }
            if (['a', 'd', 'arrowleft', 'arrowright', ' '].includes(k))
                e.preventDefault();
            if (k === 'a' || k === 'arrowleft')
                sim.keys.left = true;
            if (k === 'd' || k === 'arrowright')
                sim.keys.right = true;
            if (!e.repeat && k === 'r' && sim.state !== 'menu')
                game.main.start(sim.level);
            if (!e.repeat && k === 'p')
                game.ui.pause();
            if (!e.repeat && k === 'i')
                game.ui.togglePhysics();
        });
        window.addEventListener('keyup', e => {
            let k = e.key.toLowerCase();
            if (k === 'a' || k === 'arrowleft')
                sim.keys.left = false;
            if (k === 'd' || k === 'arrowright')
                sim.keys.right = false;
        });
        window.addEventListener('blur', () => {
            sim.keys = {};
            if (sim.state === 'play')
                game.ui.pause();
        });
        for (let [id, k] of [['left', 'left'], ['right', 'right']]) {
            let b = $(id);
            b.onpointerdown = e => {
                e.preventDefault();
                b.setPointerCapture(e.pointerId);
                sim.keys[k] = true;
            };
            b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => sim.keys[k] = false;
        }
        $('motion').onclick = () => {
            sim.motion = (sim.motion + 1) % motionModes.length;
            game.ui.updateMotion();
        };
        $('mute').onclick = () => {
            sim.muted = !sim.muted;
            game.ui.updateSound();
            if (!sim.muted)
                game.audio.unlock();
        };
        $('menuStart').onclick = () => game.ui.cafePanel('One coffee. One crush.', 'Get the coffee to campus with at least 40% remaining. Tilt left or right to counter the slosh. Six routes await.\nStarting at Route 1 does not erase your records.', [['Begin journey', () => game.main.start(0)], ['Back', game.ui.closeCafeDialog]]);
        $('menuContinue').onclick = () => {
            if (game.endings.campaignScore() === null) {
                game.main.start(clamp(sim.save.unlocked, 0, game.routes.levels.length - 1));
                return;
            }
            game.ui.cafePanel('Journey complete', `Overall delivery: ${game.endings.percent(game.endings.campaignScore())} · Grade ${game.endings.grade(game.endings.campaignScore())}. Replay any route to improve your ending.`, [['View ending', () => {
                        game.main.start(5);
                        game.endings.showEnding();
                    }
                ], ['Continue journey', () => game.main.start(5)], ['Back', game.ui.closeCafeDialog]]);
        };
        $('menuSettings').onclick = game.ui.cafeSettings;
        $('menuCredits').onclick = () => game.ui.cafePanel('Credits', "Don't Spill the Coffee!\nConcept, art direction and playtesting: game creator\nIllustrations and programming assistance: ChatGPT\nTypography: Hogfish DEMO (license pending)\nMade for the love of coffee, physics and the Filipino commute.", [['Back', game.ui.closeCafeDialog]]);
        $('menuBack').onclick = () => {
            if (sim.state === 'play')
                game.ui.pause();
            game.ui.cafeReturn();
        };
        $('cafe-dialog').addEventListener('keydown', e => {
            if (e.key !== 'Tab')
                return;
            const bs = [...$('menuActions').querySelectorAll('button')];
            if (!bs.length)
                return;
            if (e.shiftKey && document.activeElement === bs[0]) {
                e.preventDefault();
                bs.at(-1).focus();
            }
            else if (!e.shiftKey && document.activeElement === bs.at(-1)) {
                e.preventDefault();
                bs[0].focus();
            }
        });
    }
    game.ui = {
        panel,
        routes,
        pause,
        updatePhysics,
        togglePhysics,
        updateMotion,
        updateSound,
        closeCafeDialog,
        cafePanel,
        showCafe,
        cafeSettings,
        cafeReturn,
        bindControls
    };
})(window.CoffeeGame);
