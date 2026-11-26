// Procedural soundscape. Its private random stream cannot change driving events.
(function (game) {
    'use strict';
    const sim = game.state;
    const soundscape = (() => {
        let ctx, master, bed, fx, engine, engine2, rumble, road, roadGain, engineGain, engineFilter, noise, ambienceAt = 0, clock = 0, lastEvent = null, wasActive = false, seed = 927314, voiceCount = 0;
        const rand = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const smooth = (param, value, time = .08) => param.setTargetAtTime(value, ctx.currentTime, time);
        function init() {
            if (ctx)
                return true;
            try {
                let AC = window.AudioContext || window.webkitAudioContext;
                if (!AC)
                    return false;
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0;
                const compressor = ctx.createDynamicsCompressor();
                compressor.threshold.value = -19;
                compressor.ratio.value = 3;
                master.connect(compressor);
                compressor.connect(ctx.destination);
                bed = ctx.createGain();
                bed.gain.value = 0;
                bed.connect(master);
                fx = ctx.createGain();
                fx.gain.value = 0;
                fx.connect(master);
                noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
                let data = noise.getChannelData(0);
                for (let i = 0; i < data.length; i++)
                    data[i] = rand() * 2 - 1;
                engineGain = ctx.createGain();
                engineGain.gain.value = .11;
                engineFilter = ctx.createBiquadFilter();
                engineFilter.type = 'lowpass';
                engineFilter.frequency.value = 250;
                engineFilter.Q.value = .65;
                engineFilter.connect(engineGain);
                engineGain.connect(bed);
                function motor(type, f, volume) {
                    let o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = type;
                    o.frequency.value = f;
                    g.gain.value = volume;
                    o.connect(g);
                    g.connect(engineFilter);
                    o.start();
                    return o;
                }
                engine = motor('sawtooth', 34, .52);
                engine2 = motor('triangle', 68, .23);
                rumble = ctx.createBufferSource();
                rumble.buffer = noise;
                rumble.loop = true;
                let low = ctx.createBiquadFilter();
                low.type = 'lowpass';
                low.frequency.value = 100;
                let rg = ctx.createGain();
                rg.gain.value = .36;
                rumble.connect(low);
                low.connect(rg);
                rg.connect(engineFilter);
                rumble.start();
                road = ctx.createBufferSource();
                road.buffer = noise;
                road.loop = true;
                let rf = ctx.createBiquadFilter();
                rf.type = 'bandpass';
                rf.frequency.value = 530;
                rf.Q.value = .45;
                roadGain = ctx.createGain();
                roadGain.gain.value = 0;
                road.connect(rf);
                rf.connect(roadGain);
                roadGain.connect(bed);
                road.start();
                return true;
            }
            catch {
                ctx = null;
                return false;
            }
        }
        function unlock() {
            if (!sim.muted && init() && ctx.state === 'suspended')
                ctx.resume().catch(() => {
                });
        }
        function pulse({ type = 'noise', freq = 600, end = freq, filter = 'bandpass', q = .8, dur = .2, vol = .04, pan = 0, delay = 0, bus = fx }) {
            if (!ctx || sim.muted || ctx.state !== 'running' || voiceCount >= 32)
                return;
            let now = ctx.currentTime + delay, o = type === 'noise' ? ctx.createBufferSource() : ctx.createOscillator(), g = ctx.createGain();
            if (type === 'noise')
                o.buffer = noise;
            else {
                o.type = type;
                o.frequency.setValueAtTime(Math.max(15, freq), now);
                o.frequency.exponentialRampToValueAtTime(Math.max(15, end), now + dur);
            }
            let f = ctx.createBiquadFilter();
            f.type = filter;
            f.frequency.setValueAtTime(Math.max(20, freq), now);
            f.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + dur);
            f.Q.value = q;
            o.connect(f);
            f.connect(g);
            if (ctx.createStereoPanner) {
                let p = ctx.createStereoPanner();
                p.pan.value = pan;
                g.connect(p);
                p.connect(bus);
            }
            else
                g.connect(bus);
            g.gain.setValueAtTime(.0001, now);
            g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), now + Math.min(.045, dur * .22));
            g.gain.exponentialRampToValueAtTime(.0001, now + dur);
            voiceCount++;
            o.onended = () => {
                voiceCount--;
                o.disconnect();
                f.disconnect();
                g.disconnect();
            };
            if (type === 'noise')
                o.start(now, rand() * Math.max(0, noise.duration - dur - .02));
            else
                o.start(now);
            o.stop(now + dur + .01);
        }
        function spill(side) {
            pulse({
                freq: 1150,
                end: 410,
                q: .55,
                dur: .13,
                vol: .09,
                pan: side * .4
            });
            pulse({
                type: 'sine',
                freq: 520 + rand() * 200,
                end: 140,
                dur: .08,
                vol: .025,
                pan: side * .4,
                delay: .025
            });
        }
        function rattle() {
            for (let i = 0; i < 4; i++) {
                pulse({
                    freq: 1000 + rand() * 2100,
                    end: 550,
                    q: 2.5,
                    dur: .10 + rand() * .13,
                    vol: .035 + rand() * .018,
                    pan: (rand() - .5) * 1.3,
                    delay: i * .06
                });
            }
            pulse({
                freq: 95,
                end: 38,
                filter: 'lowpass',
                dur: .27,
                vol: .16
            });
        }
        function cue(kind) {
            if (kind === 'BRAKE!')
                pulse({
                    freq: 2200,
                    end: 630,
                    q: 1.7,
                    dur: .4,
                    vol: .048
                });
            else if (kind === 'FULL THROTTLE!')
                pulse({
                    type: 'triangle',
                    freq: 63,
                    end: 116,
                    filter: 'lowpass',
                    dur: .35,
                    vol: .055
                });
            else
                pulse({
                    freq: 470,
                    end: 190,
                    q: 1.4,
                    dur: .18,
                    vol: .034
                });
        }
        function environment() {
            let p = rand() < .5 ? -0.7 : .7;
            let r = rand();
            if (r < .38) {
                // passing small motorcycle, distant and brief
                pulse({
                    type: 'sawtooth',
                    freq: 108,
                    end: 48,
                    filter: 'lowpass',
                    dur: 1.7,
                    vol: .035,
                    pan: p
                });
                pulse({
                    freq: 720,
                    end: 270,
                    q: .5,
                    dur: 1.65,
                    vol: .032,
                    pan: p
                });
            }
            else if (r < .71) {
                // distant dog-like barks, intentionally stylized
                for (let i = 0; i < 2 + (rand() < .35 ? 1 : 0); i++) {
                    pulse({
                        type: 'triangle',
                        freq: 300 + rand() * 80,
                        end: 115,
                        filter: 'lowpass',
                        dur: .20,
                        vol: .027,
                        pan: p,
                        delay: i * .31
                    });
                    pulse({
                        freq: 700,
                        end: 360,
                        dur: .15,
                        vol: .021,
                        pan: p,
                        delay: i * .31
                    });
                }
            }
            else {
                // quiet evening insects and road ambience
                for (let i = 0; i < 4; i++)
                    pulse({
                        type: 'sine',
                        freq: 2350 + rand() * 240,
                        end: 2150,
                        dur: .10,
                        vol: .009,
                        pan: p,
                        delay: i * .18
                    });
            }
        }
        function update(dt) {
            if (!ctx)
                return;
            let active = sim.state === 'play' && !sim.muted && !document.hidden;
            smooth(master.gain, sim.muted || document.hidden ? 0 : .70, .035);
            smooth(bed.gain, active ? 1 : 0, .12);
            smooth(fx.gain, active ? 1 : 0, .045);
            if (!active) {
                wasActive = false;
                return;
            }
            if (!wasActive) {
                lastEvent = null;
                ambienceAt = clock + 3 + rand() * 3;
                wasActive = true;
            }
            clock += dt;
            const hz = 29 + sim.speed * 1.25 + Math.max(0, sim.ax) * 2.1;
            smooth(engine.frequency, hz, .15);
            smooth(engine2.frequency, hz * 2.02, .15);
            smooth(engineFilter.frequency, 180 + sim.speed * 9 + Math.max(0, sim.ax) * 14, .17);
            smooth(engineGain.gain, .12 + Math.min(.10, Math.abs(sim.ax) * .009), .15);
            smooth(roadGain.gain, .025 + sim.speed * .005, .2);
            if (sim.event && sim.t >= sim.event.start && sim.t < sim.event.start + sim.event.dur && lastEvent !== sim.event) {
                lastEvent = sim.event;
                if (sim.event.kind === 'POTHOLE!' || sim.event.kind === 'ROUGH ROAD!')
                    rattle();
                else
                    cue(sim.event.kind);
            }
            if (clock >= ambienceAt) {
                environment();
                ambienceAt = clock + 6 + rand() * 8;
            }
        }
        function warning() {
            pulse({
                freq: 1250,
                end: 760,
                q: 2,
                dur: .09,
                vol: .032
            });
        }
        function result(pass) {
            if (!ctx || sim.muted)
                return;
            // subdued arrival/failed cue on master, independent of paused effects bus
            const notes = pass ? [294, 370, 440] : [220, 147];
            notes.forEach((n, i) => pulse({
                type: 'sine',
                freq: n,
                end: n,
                filter: 'lowpass',
                dur: .32,
                vol: .035,
                delay: i * .12,
                bus: master
            }));
        }
        function reset() {
            lastEvent = null;
            wasActive = false;
        }
        return {
            unlock,
            update,
            spill,
            result,
            warning,
            reset,
            get context() {
                return ctx;
            },
            get status() {
                return ctx ? {
                    state: ctx.state,
                    master: master.gain.value,
                    bed: bed.gain.value,
                    engine: engine.frequency.value,
                    voices: voiceCount
                } : null;
            }
        };
    })();
    game.audio = soundscape;
})(window.CoffeeGame);
