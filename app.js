/* ==========================================================================
   ESCUCHA TU TRAUMA · app.js
   Concepto "El clavado": el sitio entero es un descenso del consciente al
   inconsciente y de regreso a la superficie.

   Capas (todas degradan con gracia si algo falla):
   - Núcleo: WhatsApp, menú, formulario, FAQ  (sin librerías)
   - Visual: shader WebGL de agua, partículas, cursor, tilt, campo observador
   - Scroll: GSAP + ScrollTrigger (pines, scrub) + Lenis (scroll suave)

   Para cambiar el número de WhatsApp edita CONFIG.phone (una sola vez).
   ========================================================================== */
(() => {
    'use strict';

    /* ═══════════ CONFIGURACIÓN ═══════════ */
    const CONFIG = {
        // Código de país + número, sin "+" ni espacios. Ej. México: 5215512345678
        phone: '5214491125755'
    };

    /* ═══════════ UTILIDADES ═══════════ */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const root = document.documentElement;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasGSAP = () => typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

    const state = { y: 0, lastY: 0, vel: 0, toneMix: 0, toneTarget: 0, lenis: null, ready: false };

    /* Un solo bucle de animación para todo lo que no es GSAP */
    const Loop = (() => {
        const fns = [];
        let last = performance.now();
        const tick = now => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            for (let i = 0; i < fns.length; i++) fns[i](now / 1000, dt);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        return { add: fn => fns.push(fn) };
    })();

    const onResize = (() => {
        const subs = [];
        let timer;
        addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => subs.forEach(fn => fn()), 180);
        });
        return fn => subs.push(fn);
    })();

    /* ═══════════ WHATSAPP ═══════════ */
    const waUrl = text => `https://wa.me/${CONFIG.phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

    function initWhatsApp() {
        $$('[data-wa]').forEach(a => {
            a.href = waUrl(a.dataset.wa);
            if (!a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        });
    }

    /* ═══════════ TEXTO DIVIDIDO EN PALABRAS ═══════════ */
    function splitWords(el, mode) {
        let idx = 0;
        const walk = node => {
            Array.from(node.childNodes).forEach(ch => {
                if (ch.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    ch.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const w = document.createElement('span');
                        if (mode === 'mask') {
                            const inner = document.createElement('span');
                            w.className = 'w';
                            inner.className = 'wi';
                            inner.textContent = part;
                            w.style.setProperty('--wi', idx++);
                            w.appendChild(inner);
                        } else {
                            w.className = 'sw';
                            w.textContent = part;
                        }
                        frag.appendChild(w);
                    });
                    node.replaceChild(frag, ch);
                } else if (ch.nodeType === 1 && ch.tagName !== 'BR') {
                    walk(ch);
                }
            });
        };
        walk(el);
    }

    function initSplit() {
        $$('[data-split]').forEach(el => splitWords(el, 'mask'));
        $$('[data-scrub-words]').forEach(el => splitWords(el, 'scrub'));
    }

    /* ═══════════ REVELADOS AL HACER SCROLL ═══════════ */
    function initReveals() {
        $$('.acc-item').forEach((el, i) => el.style.setProperty('--d', (i * 0.07) + 's'));
        if (!('IntersectionObserver' in window)) {
            $$('.rv, [data-split]').forEach(el => el.classList.add('in'));
            return;
        }
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        $$('.rv, [data-split]').forEach(el => { if (!el.matches('.hero-title')) io.observe(el); });

        // "Por qué iniciar": resalta el párrafo que cruza el centro de la pantalla
        const why = new IntersectionObserver(entries => {
            entries.forEach(e => e.target.classList.toggle('is-active', e.isIntersecting));
        }, { rootMargin: '-42% 0px -42% 0px' });
        $$('.why-item').forEach(el => why.observe(el));

        // Línea de tiempo: activa cada paso al llegar al 72% de la pantalla
        const tl = new IntersectionObserver(entries => {
            entries.forEach(e => e.target.classList.toggle('on', e.isIntersecting || e.boundingClientRect.top < 0));
        }, { rootMargin: '0px 0px -28% 0px' });
        $$('.tl-item').forEach(el => tl.observe(el));
    }

    /* ═══════════ LOADER ═══════════ */
    function initLoader() {
        const loader = $('#loader');
        if (!loader) { root.classList.remove('is-loading'); root.classList.add('is-ready'); return; }
        const bar = $('#ld-bar'), num = $('#ld-num'), msg = $('#ld-msg');
        const msgs = ['Respira hondo…', 'Silencia el ruido…', 'Mira hacia adentro…', 'Estás por entrar.'];
        const C = 553;
        const DURATION = reduceMotion ? 500 : 2700;
        const t0 = performance.now();
        let loaded = document.readyState === 'complete';
        let done = false, p = 0, shown = -1;
        addEventListener('load', () => { loaded = true; }, { once: true });

        const finish = () => {
            if (done) return;
            done = true;
            bar.style.strokeDashoffset = 0;
            num.textContent = '100';
            loader.classList.add('is-leaving');
            root.classList.remove('is-loading');
            root.classList.add('is-ready');
            state.ready = true;
            if (state.lenis) state.lenis.start();
            document.dispatchEvent(new Event('app:ready'));
            setTimeout(() => { loader.classList.add('is-gone'); if (hasGSAP()) ScrollTrigger.refresh(); }, 1500);
        };

        const frame = now => {
            if (done) return;
            const t = clamp((now - t0) / DURATION, 0, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            p = Math.max(p, Math.min(eased, loaded ? 1 : 0.92));
            bar.style.strokeDashoffset = C * (1 - p);
            num.textContent = Math.round(p * 100);
            const mi = Math.min(msgs.length - 1, Math.floor(p * msgs.length));
            if (mi !== shown) {
                shown = mi;
                msg.style.opacity = 0;
                setTimeout(() => { msg.textContent = msgs[mi]; msg.style.opacity = 1; }, 160);
            }
            if (p >= 1) { setTimeout(finish, 280); return; }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        setTimeout(finish, 9000); // seguro
    }

    /* ═══════════ SCROLL SUAVE + ESCENAS (GSAP · ScrollTrigger · Lenis) ═══════════ */
    function scrollToTarget(target) {
        const header = $('#header');
        const offset = target.id === 'inicio' ? 0 : -(header ? header.offsetHeight : 76) + 8;
        if (state.lenis) state.lenis.scrollTo(target, { offset, duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
        else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    function initGSAP() {
        if (!hasGSAP() || reduceMotion) return false;
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });
        root.classList.add('gsap-ok');

        if (window.Lenis) {
            const lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
            state.lenis = lenis;
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add(time => lenis.raf(time * 1000));
            gsap.ticker.lagSmoothing(0);
            if (!state.ready) lenis.stop();
        }

        const mm = gsap.matchMedia();
        mm.add({ desk: '(min-width: 1024px)', mob: '(max-width: 1023.98px)' }, ctx => {
            buildScenes(!!ctx.conditions.desk);
        });

        addEventListener('load', () => ScrollTrigger.refresh());
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
        return true;
    }

    /* Se crean en el mismo orden en que aparecen en la página (requisito de los pines) */
    function buildScenes(desk) {
        /* — Hero: parallax de salida — */
        gsap.to('.hero-copy', { y: -70, opacity: 0.1, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to('.hero-orbs i', { y: i => -140 - i * 80, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

        /* — El océano: pin con texto que se revela y orbe que desciende — */
        const ocean = $('#oceano');
        if (ocean) {
            const pin = $('.ocean-pin', ocean), A = $('.is-a', ocean), B = $('.is-b', ocean);
            const cta = $('.ocean-cta', ocean), gauge = $('.gauge', ocean), labels = $$('.gauge li', ocean);
            const wa = $$('.sw', A), wb = $$('.sw', B);
            gsap.set(B, { autoAlpha: 0 });
            gsap.set(cta, { autoAlpha: 0, y: 24 });
            let lastK = -1;

            const tl = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    trigger: pin, start: 'top top', end: desk ? '+=320%' : '+=280%',
                    pin: true, scrub: 0.7, anticipatePin: 1,
                    onUpdate: self => {
                        const k = self.progress < 0.4 ? 0 : self.progress < 0.56 ? 1 : 2;
                        if (k !== lastK) { lastK = k; labels.forEach((li, i) => li.classList.toggle('on', i === k)); }
                    }
                }
            });
            const reveal = (words, start, len) => {
                const each = len / (words.length + 2);
                tl.fromTo(words, { opacity: 0.16 }, { opacity: 1, stagger: { each }, duration: each * 3 }, start);
            };
            tl.to(pin, { '--p': 1, duration: 10 }, 0);
            tl.to(gauge, { '--gp': 1, duration: 10 }, 0);
            reveal(wa, 0.3, 3.8);
            tl.to(A, { autoAlpha: 0, y: -34, duration: 0.7, ease: 'power1.in' }, 4.9)
              .fromTo(B, { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power1.out' }, 5.4);
            reveal(wb, 5.5, 3.4);
            tl.to(cta, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 9.0)
              .to({}, { duration: 1 }, 9.8);
        }

        /* — Método: las cartas se apilan y la anterior se hunde — */
        const cards = $$('.m-card');
        if (desk) {
            cards.forEach((card, i) => {
                const next = cards[i + 1];
                if (!next) return;
                const st = { trigger: next, start: 'top 82%', end: 'top 16%', scrub: true };
                gsap.to(card, { scale: 0.93, ease: 'none', scrollTrigger: st });
                gsap.to($('.m-shade', card), { opacity: 0.62, ease: 'none', scrollTrigger: st });
            });
        } else {
            cards.forEach(card => gsap.from(card, { y: 70, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: card, start: 'top 88%' } }));
        }

        /* — Raíz: las raíces se dibujan con el scroll — */
        const rp = $$('.root-path'), rn = $$('.root-node');
        if (rp.length) {
            gsap.set(rn, { scale: 0.2, opacity: 0 });
            gsap.timeline({ scrollTrigger: { trigger: '.root-art', start: 'top 82%', end: 'bottom 52%', scrub: 0.8 } })
                .to(rp, { strokeDashoffset: 0, stagger: 0.18, ease: 'none', duration: 1 })
                .to(rn, { opacity: 1, scale: 1, stagger: 0.12, ease: 'back.out(2.2)', duration: 0.5 }, '>-0.7');
        }

        /* — Foto que se abre a pantalla completa — */
        const voice = $('#voz');
        if (voice) {
            const vp = $('.voice-pin', voice), vf = $('.voice-frame', voice), vi = $('.voice-img', voice);
            const vr = $$('.vr', voice), hint = $('.voice-hint', voice);
            // Escritorio: la foto arranca centrada en la tarjeta y se desliza a la derecha mientras el marco se abre
            gsap.set(vf, desk ? { '--ct': '13%', '--cs': '33%', '--cr': '38px' } : { '--ct': '18%', '--cs': '12%', '--cr': '30px' });
            gsap.set(vi, desk ? { scale: 1.12, '--vx': '50%' } : { scale: 1.2 });
            const open = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: { trigger: vp, start: 'top top', end: desk ? '+=240%' : '+=210%', pin: true, scrub: 0.7, anticipatePin: 1 }
            });
            open
                .to(vf, { '--ct': '0%', '--cs': '0%', '--cr': '0px', duration: 4, ease: 'power2.inOut' }, 0)
                .to(vi, desk ? { scale: 1.03, '--vx': '100%', duration: 4, ease: 'power2.inOut' } : { scale: 1, duration: 4 }, 0)
                .to(hint, { autoAlpha: 0, duration: 0.8 }, 2.6)
                .fromTo(vr, { autoAlpha: 0, y: 44 }, { autoAlpha: 1, y: 0, stagger: 0.5, duration: 0.9, ease: 'power2.out' }, 3.3)
                .to({}, { duration: 1.6 });
        }

        /* — Modalidades: scroll horizontal con pin — */
        const hzPin = $('.hz-pin'), track = $('.hz-track'), bar = $('.hz-progress i');
        if (hzPin && track) {
            const dist = () => Math.max(0, track.scrollWidth - innerWidth);
            gsap.to(track, {
                x: () => -dist(), ease: 'none',
                scrollTrigger: {
                    trigger: hzPin, start: 'top top', end: () => '+=' + dist(),
                    pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
                    onUpdate: self => { if (bar) bar.style.transform = `scaleX(${self.progress.toFixed(4)})`; }
                }
            });
        }

        /* — Primer paso: la línea se llena — */
        if ($('.tl')) {
            gsap.to('.tl-fill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.tl', start: 'top 70%', end: 'bottom 75%', scrub: true } });
        }

        /* — Footer: la marca gigante sube — */
        gsap.fromTo('.ft-mark span', { yPercent: 35 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '#footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    }

    /* ═══════════ HEADER · MENÚ · ANCLAS ═══════════ */
    function initHeader() {
        const header = $('#header'), burger = $('#burger'), menu = $('#menu');
        if (!header) return;
        $$('.mn-nav a').forEach((a, i) => a.style.setProperty('--k', i));

        const setMenu = open => {
            root.classList.toggle('menu-open', open);
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
            menu.setAttribute('aria-hidden', String(!open));
            header.classList.remove('is-hidden');
            if (state.lenis) open ? state.lenis.stop() : state.lenis.start();
            else root.style.overflow = open ? 'hidden' : '';
        };
        burger.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
        addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('menu-open')) { setMenu(false); burger.focus(); } });

        document.addEventListener('click', e => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute('href');
            if (id.length < 2) return;
            const target = $(id);
            if (!target) return;
            e.preventDefault();
            const wasOpen = root.classList.contains('menu-open');
            if (wasOpen) setMenu(false);
            setTimeout(() => scrollToTarget(target), wasOpen ? 350 : 0);
        });

        document.addEventListener('app:ready', () => {
            const h1 = $('.hero-title');
            if (h1) h1.classList.add('in');
        });
    }

    /* ═══════════ ESTADO DE SCROLL: progreso · tono · profundidad ═══════════ */
    function initScrollState() {
        const header = $('#header'), progress = $('#progress');
        const toneZones = $$('[data-tone]');
        const depthZones = $$('[data-depth]').map(el => ({ el, d: parseFloat(el.dataset.depth), zone: el.dataset.zone }));
        const depthEl = $('#depth'), numEl = $('#dp-num'), zoneEl = $('#dp-zone');
        let shownDepth = 0, targetDepth = 0, zoneName = '', lastHeaderY = 0, dirty = true;

        const zoneAt = y => {
            for (let i = 0; i < toneZones.length; i++) {
                const r = toneZones[i].getBoundingClientRect();
                if (r.top <= y && r.bottom > y) return toneZones[i];
            }
            return null;
        };

        const evaluate = () => {
            const y = window.scrollY;
            const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
            if (progress) progress.style.transform = `scaleX(${clamp(y / max, 0, 1).toFixed(4)})`;

            // Header: tono + ocultar al bajar / mostrar al subir
            const hz = zoneAt(46);
            header.classList.toggle('on-dark', !!hz && hz.dataset.tone === 'dark');
            const dy = y - lastHeaderY;
            if (Math.abs(dy) > 6 && !root.classList.contains('menu-open')) {
                header.classList.toggle('is-hidden', dy > 0 && y > 420);
                lastHeaderY = y;
            }
            if (y < 80) header.classList.remove('is-hidden');

            // Tono global (partículas, medidor)
            const mid = zoneAt(innerHeight * 0.55);
            if (mid) {
                const dark = mid.dataset.tone === 'dark';
                state.toneTarget = dark ? 1 : 0;
                document.body.classList.toggle('tone-dark', dark);
                // En el océano ya hay un medidor propio: se atenúa el global para no duplicar
                if (depthEl) depthEl.classList.toggle('is-muted', mid.id === 'oceano');
            }

            // Profundidad: interpola entre la profundidad de cada sección
            const cy = innerHeight * 0.5;
            for (let i = 0; i < depthZones.length; i++) {
                const r = depthZones[i].el.getBoundingClientRect();
                if (r.top <= cy && r.bottom > cy) {
                    const t = clamp((cy - r.top) / Math.max(1, r.height), 0, 1);
                    const next = depthZones[i + 1];
                    targetDepth = next ? lerp(depthZones[i].d, next.d, t) : depthZones[i].d;
                    if (zoneName !== depthZones[i].zone) { zoneName = depthZones[i].zone; if (zoneEl) zoneEl.textContent = zoneName; }
                    break;
                }
            }
        };

        const markDirty = () => { dirty = true; };
        addEventListener('scroll', markDirty, { passive: true });
        addEventListener('resize', markDirty);
        document.addEventListener('app:ready', markDirty);

        Loop.add((t, dt) => {
            const y = window.scrollY;
            state.vel = lerp(state.vel, clamp(y - state.lastY, -90, 90), 0.22);
            state.lastY = y;
            if (dirty) { dirty = false; evaluate(); }
            state.toneMix = lerp(state.toneMix, state.toneTarget, 1 - Math.pow(0.002, dt));
            if (depthEl) {
                shownDepth = lerp(shownDepth, targetDepth, 1 - Math.pow(0.004, dt));
                if (numEl) numEl.textContent = Math.round(shownDepth).toLocaleString('es-MX').replace(/,/g, ' ');
                depthEl.style.setProperty('--dp', clamp(shownDepth / 4000, 0, 1).toFixed(4));
            }
        });
        evaluate();
    }

    /* ═══════════ MARQUEE reactivo a la velocidad del scroll ═══════════ */
    function initMarquee() {
        const rows = $$('.mq-row');
        if (!rows.length || reduceMotion) return;
        root.classList.add('js-marquee');
        const data = rows.map(r => ({ el: $('.mq-track', r), dir: parseFloat(r.dataset.dir) || -1, x: 0, w: 0 }));
        data.forEach(d => { if (d.dir > 0) d.x = -1; });
        const measure = () => data.forEach(d => { d.w = d.el.firstElementChild.offsetWidth; if (d.dir > 0 && d.x > -1 && d.x >= 0) d.x = -d.w; });
        measure();
        onResize(measure);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        Loop.add((t, dt) => {
            const speed = 70 + Math.abs(state.vel) * 38;
            const skew = clamp(state.vel * -0.18, -7, 7);
            data.forEach(d => {
                if (!d.w) return;
                d.x += d.dir * speed * dt;
                if (d.dir < 0 && d.x <= -d.w) d.x += d.w;
                if (d.dir > 0 && d.x >= 0) d.x -= d.w;
                d.el.style.transform = `translate3d(${d.x.toFixed(1)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
            });
        });
    }

    /* ═══════════ POLVO MARINO (partículas globales) ═══════════ */
    function initDust() {
        const c = $('#dust');
        if (!c || reduceMotion) return;
        const ctx = c.getContext('2d');
        let w, h, dpr, parts = [];
        const build = () => {
            dpr = Math.min(devicePixelRatio || 1, 2);
            w = c.width = Math.round(innerWidth * dpr);
            h = c.height = Math.round(innerHeight * dpr);
            const n = innerWidth < 700 ? 34 : 74;
            parts = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h, z: 0.25 + Math.random() * 0.75,
                r: (0.7 + Math.random() * 2.1) * dpr, vx: (Math.random() - 0.5) * 0.14 * dpr, vy: (0.05 + Math.random() * 0.18) * dpr,
                ph: Math.random() * 6.283
            }));
        };
        build();
        onResize(build);
        Loop.add((t, dt) => {
            ctx.clearRect(0, 0, w, h);
            const m = state.toneMix;
            const r = Math.round(lerp(23, 190, m)), g = Math.round(lerp(67, 255, m)), b = Math.round(lerp(214, 235, m));
            const baseA = lerp(0.34, 0.5, m);
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                p.x += p.vx * 60 * dt + Math.sin(t * 0.45 + p.ph) * 0.1 * dpr;
                p.y += p.vy * 60 * dt - state.vel * p.z * 0.85 * dpr;
                if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
                if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
                ctx.fillStyle = `rgba(${r},${g},${b},${(baseA * (0.35 + p.z * 0.65)).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * p.z + 0.3, 0, 6.2832);
                ctx.fill();
            }
        });
    }

    /* ═══════════ AGUA · shader WebGL de cáusticas ═══════════ */
    const CAUSTIC_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const CAUSTIC_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uT; uniform vec2 uM;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uK;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main(){
  vec2 R = uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * R) / min(R.x, R.y);
  float t = uT * 0.07;
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.8 + 3.0 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p * 1.8 + 3.0 * q + vec2(8.3, 2.8) - t * 1.2));
  float f = fbm(p * 1.6 + 3.2 * r);
  float c = fbm(p * 3.2 + r * 2.2 + vec2(t * 3.0, -t * 2.0));
  c = 1.0 - abs(c * 2.0 - 1.0);
  c = pow(c, 5.0);
  vec2 m = (uM * R - 0.5 * R) / min(R.x, R.y);
  float d = length(p - m);
  float rip = sin(d * 34.0 - uT * 3.2) * exp(-d * 4.5) * 0.18;
  float k = smoothstep(0.15, 0.95, f + rip);
  vec3 col = mix(uA, uB, k);
  col = mix(col, uC, c * uK * (0.5 + 0.5 * smoothstep(0.0, 1.0, f)));
  gl_FragColor = vec4(col, 1.0);
}`;

    function createCaustics(canvas, pal) {
        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
        if (!gl) return null;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const vs = compile(gl.VERTEX_SHADER, CAUSTIC_VS), fs = compile(gl.FRAGMENT_SHADER, CAUSTIC_FS);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const u = {};
        ['uRes', 'uT', 'uM', 'uA', 'uB', 'uC', 'uK'].forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
        gl.uniform3fv(u.uA, pal.a); gl.uniform3fv(u.uB, pal.b); gl.uniform3fv(u.uC, pal.c); gl.uniform1f(u.uK, pal.k);

        const api = { visible: false, dead: false, mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5 };
        api.resize = () => {
            const dpr = Math.min(devicePixelRatio || 1, 1.5);
            const w = Math.max(2, Math.round(canvas.clientWidth * dpr * pal.scale));
            const h = Math.max(2, Math.round(canvas.clientHeight * dpr * pal.scale));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            gl.viewport(0, 0, w, h);
            gl.uniform2f(u.uRes, w, h);
        };
        api.draw = t => {
            api.mx += (api.tx - api.mx) * 0.08;
            api.my += (api.ty - api.my) * 0.08;
            gl.uniform1f(u.uT, t);
            gl.uniform2f(u.uM, api.mx, api.my);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.dead = true; });
        return api;
    }

    function initCaustics() {
        const defs = [
            { id: 'fx-hero', pal: { a: [0.965, 0.978, 1.0], b: [0.74, 0.84, 1.0], c: [0.83, 1.0, 0.95], k: 0.95, scale: 0.5 } },
            { id: 'fx-addict', pal: { a: [0.0, 0.01, 0.06], b: [0.03, 0.12, 0.42], c: [0.32, 0.88, 0.72], k: 0.8, scale: 0.42 } }
        ];
        const list = [];
        defs.forEach(d => {
            const canvas = document.getElementById(d.id);
            if (!canvas) return;
            const api = createCaustics(canvas, d.pal);
            if (!api) { canvas.style.display = 'none'; return; }
            api.canvas = canvas;
            api.resize();
            list.push(api);
            onResize(() => { api.resize(); if (reduceMotion) api.draw(3); });
            if ('IntersectionObserver' in window) {
                new IntersectionObserver(es => { api.visible = es[0].isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
            } else api.visible = true;
            if (reduceMotion) api.draw(3);
        });
        if (!list.length || reduceMotion) return;

        let lastMove = -10;
        addEventListener('pointermove', e => {
            if (e.pointerType === 'touch') return;
            lastMove = performance.now() / 1000;
            list.forEach(api => {
                if (!api.visible) return;
                const r = api.canvas.getBoundingClientRect();
                api.tx = clamp((e.clientX - r.left) / r.width, 0, 1);
                api.ty = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
            });
        }, { passive: true });

        Loop.add(t => {
            const idle = !finePointer || t - lastMove > 3;
            list.forEach(api => {
                if (!api.visible || api.dead) return;
                if (idle) { api.tx = 0.5 + 0.3 * Math.sin(t * 0.33); api.ty = 0.5 + 0.26 * Math.cos(t * 0.27); }
                api.draw(t);
            });
        });
    }

    /* ═══════════ CURSOR · MAGNÉTICOS · TILT · SPOTLIGHT ═══════════ */
    function initCursor() {
        if (!finePointer || reduceMotion) return;
        const cur = $('#cursor');
        if (!cur) return;
        const dot = $('.c-dot', cur), ring = $('.c-ring', cur);
        let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
        root.classList.add('has-cursor');
        addEventListener('pointermove', e => {
            x = e.clientX; y = e.clientY;
            dot.style.transform = `translate3d(${x}px,${y}px,0)`;
        }, { passive: true });
        document.addEventListener('pointerover', e => {
            cur.classList.toggle('is-hover', !!e.target.closest('a, button, select, input, textarea, [data-lens], .acc-btn'));
        });
        Loop.add((t, dt) => {
            const k = 1 - Math.pow(0.0008, dt);
            rx = lerp(rx, x, k); ry = lerp(ry, y, k);
            ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
        });
    }

    function initMagnetic() {
        if (!finePointer) return;
        $$('.magnetic').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.2).toFixed(1) + 'px');
                el.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px');
            });
            el.addEventListener('pointerleave', () => { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); });
        });
    }

    function initTilt() {
        const el = $('[data-tilt]'), hero = $('.hero');
        if (!el || !hero || reduceMotion) return;
        let tx = 0, ty = 0, cx = 0, cy = 0, visible = true, pointerAt = -10;
        if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(hero);
        hero.addEventListener('pointermove', e => {
            if (e.pointerType === 'touch') return;
            const r = hero.getBoundingClientRect();
            tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
            ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
            pointerAt = performance.now() / 1000;
        });
        hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; pointerAt = -10; });
        Loop.add(t => {
            if (!visible) return;
            if (!finePointer || t - pointerAt > 4) { tx = Math.sin(t * 0.55) * 0.55; ty = Math.cos(t * 0.42) * 0.4; }
            cx = lerp(cx, tx, 0.07); cy = lerp(cy, ty, 0.07);
            el.style.setProperty('--ry', (cx * 9).toFixed(2) + 'deg');
            el.style.setProperty('--rx', (-cy * 7).toFixed(2) + 'deg');
        });
    }

    function initSpot() {
        $$('[data-spot]').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--px', (e.clientX - r.left).toFixed(0) + 'px');
                el.style.setProperty('--py', (e.clientY - r.top).toFixed(0) + 'px');
            });
        });
    }

    /* ═══════════ LENTE: palabras ocultas que la luz revela ═══════════ */
    function initLens() {
        const el = $('[data-lens]');
        if (!el) return;
        // Capa base tenue: se intuyen las palabras antes de que la luz las revele
        const words = $('.lens-words', el);
        if (words) {
            const base = words.cloneNode(true);
            base.classList.add('lens-base');
            base.setAttribute('aria-hidden', 'true');
            el.insertBefore(base, words);
        }
        let visible = false, hovered = false, tx = 0, ty = 0, x = 0, y = 0, started = false;
        if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(el);
        el.addEventListener('pointermove', e => {
            const r = el.getBoundingClientRect();
            tx = e.clientX - r.left; ty = e.clientY - r.top; hovered = true;
        });
        el.addEventListener('pointerleave', () => { hovered = false; });
        Loop.add(t => {
            if (!visible && started) return;
            const w = el.clientWidth, h = el.clientHeight;
            let gx = w * (0.5 + 0.34 * Math.sin(t * 0.7)), gy = h * (0.5 + 0.34 * Math.sin(t * 0.53 + 1.2));
            if (reduceMotion) { gx = w / 2; gy = h / 2; }
            if (hovered) { gx = tx; gy = ty; }
            if (!started) { x = gx; y = gy; started = true; }
            x = lerp(x, gx, 0.1); y = lerp(y, gy, 0.1);
            el.style.setProperty('--lx', x.toFixed(1) + 'px');
            el.style.setProperty('--ly', y.toFixed(1) + 'px');
        });
    }

    /* ═══════════ CAMPO OBSERVADOR: el desorden toma forma al ser mirado ═══════════ */
    function initObserver() {
        const c = $('#fx-observer');
        if (!c) return;
        const sec = c.parentElement, ctx = c.getContext('2d');
        let w = 0, h = 0, parts = [], visible = false;
        const ptr = { x: -9999, y: -9999, active: false, at: -10 };
        const RING = 26;

        const build = () => {
            const r = sec.getBoundingClientRect();
            const dpr = Math.min(devicePixelRatio || 1, 2);
            w = r.width; h = r.height;
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = w < 700 ? 90 : 190;
            parts = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
                obs: false, rad: 0, ang: 0, a: 0.35, s: 1 + Math.random() * 1.6
            }));
        };
        build();
        onResize(build);
        if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(sec);
        else visible = true;

        addEventListener('pointermove', e => {
            const r = sec.getBoundingClientRect();
            ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
            ptr.active = ptr.y > -60 && ptr.y < r.height + 60;
            ptr.at = performance.now() / 1000;
        }, { passive: true });

        Loop.add((t, dt) => {
            if (!visible) return;
            // Sin puntero reciente (táctil o quieto): un "observador" recorre la escena solo
            if (reduceMotion || t - ptr.at > 2.5) {
                ptr.x = w * (0.5 + 0.34 * Math.sin(t * 0.32));
                ptr.y = h * (0.2 + 0.1 * Math.sin(t * 0.5 + 1));
                ptr.active = true;
            }
            const R = Math.min(230, w * 0.38);
            ctx.clearRect(0, 0, w, h);

            // Anillos guía alrededor del observador
            if (ptr.active) {
                ctx.strokeStyle = 'rgba(23,67,214,.10)';
                ctx.lineWidth = 1;
                for (let r = RING; r < R; r += RING) { ctx.beginPath(); ctx.arc(ptr.x, ptr.y, r, 0, 6.2832); ctx.stroke(); }
            }

            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                const dx = p.x - ptr.x, dy = p.y - ptr.y, d = Math.hypot(dx, dy);
                if (ptr.active && d < R) {
                    if (!p.obs) { p.obs = true; p.rad = Math.max(RING, Math.round(d / RING) * RING); p.ang = Math.atan2(dy, dx); }
                    p.ang += dt * (0.9 - (p.rad / R) * 0.5);
                    p.x = lerp(p.x, ptr.x + Math.cos(p.ang) * p.rad, 0.14);
                    p.y = lerp(p.y, ptr.y + Math.sin(p.ang) * p.rad, 0.14);
                    p.a = lerp(p.a, 1, 0.1);
                } else {
                    p.obs = false;
                    p.vx = (p.vx + (Math.random() - 0.5) * 0.08) * 0.97;
                    p.vy = (p.vy + (Math.random() - 0.5) * 0.08) * 0.97;
                    p.x += p.vx; p.y += p.vy;
                    if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
                    if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
                    p.a = lerp(p.a, 0.32, 0.05);
                }
                ctx.fillStyle = p.obs ? `rgba(23,67,214,${p.a.toFixed(2)})` : `rgba(88,112,190,${p.a.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.obs ? p.s * 1.25 : p.s, 0, 6.2832);
                ctx.fill();
            }
        });
    }

    /* ═══════════ FORMULARIO → WHATSAPP ═══════════ */
    function initForm() {
        const form = $('#wa-form');
        if (!form) return;
        const name = $('#f-name'), type = $('#f-type'), msg = $('#f-msg');
        const btn = $('button[type="submit"]', form), label = $('span', btn);
        const original = label.textContent;

        const setErr = (input, text) => {
            const field = input.closest('.field');
            field.classList.toggle('invalid', !!text);
            $('.err', field).textContent = text || '';
            input.setAttribute('aria-invalid', String(!!text));
        };
        [name, type].forEach(i => i.addEventListener('input', () => setErr(i, '')));

        form.addEventListener('submit', e => {
            e.preventDefault();
            const n = name.value.trim();
            let ok = true;
            if (n.length < 2) { setErr(name, 'Cuéntanos cómo te llamas para saludarte.'); ok = false; }
            if (!type.value) { setErr(type, 'Elige el tipo de terapia que buscas.'); ok = false; }
            if (!ok) { (n.length < 2 ? name : type).focus(); return; }

            const extra = msg.value.trim() ? ` Quisiera contarle: ${msg.value.trim()}.` : '';
            const text = `Hola Dr. Joe, soy ${n}. Busco: ${type.value}.${extra} ¿Me comparte los horarios disponibles para mi primera sesión?`;
            btn.classList.add('is-sent');
            label.textContent = 'Abriendo WhatsApp…';
            const win = window.open(waUrl(text), '_blank');
            if (win) win.opener = null; else location.href = waUrl(text);
            setTimeout(() => { btn.classList.remove('is-sent'); label.textContent = original; }, 4200);
        });
    }

    /* ═══════════ FAQ ═══════════ */
    function initFAQ() {
        $$('.acc-btn').forEach(btn => btn.addEventListener('click', () => {
            const item = btn.closest('.acc-item');
            const open = !item.classList.contains('open');
            $$('.acc-item.open').forEach(i => {
                if (i !== item) { i.classList.remove('open'); $('.acc-btn', i).setAttribute('aria-expanded', 'false'); }
            });
            item.classList.toggle('open', open);
            btn.setAttribute('aria-expanded', String(open));
            if (hasGSAP()) setTimeout(() => ScrollTrigger.refresh(), 720);
        }));
    }

    /* ═══════════ BOTÓN FLOTANTE ═══════════ */
    function initWAFloat() {
        const f = $('.wa-float');
        if (!f) return;
        document.addEventListener('app:ready', () => {
            setTimeout(() => f.classList.add('tip-on'), 6000);
            setTimeout(() => f.classList.remove('tip-on'), 15000);
        });
    }

    /* ═══════════ ARRANQUE ═══════════ */
    function init() {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        scrollTo(0, 0);

        const year = $('#year');
        if (year) year.textContent = new Date().getFullYear();

        initWhatsApp();
        initSplit();
        initReveals();
        initHeader();
        initLoader();
        initGSAP();
        initScrollState();
        initMarquee();
        initDust();
        initCaustics();
        initCursor();
        initMagnetic();
        initTilt();
        initSpot();
        initLens();
        initObserver();
        initForm();
        initFAQ();
        initWAFloat();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
