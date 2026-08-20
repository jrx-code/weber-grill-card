/**
 * Weber Grill Card — Home Assistant Lovelace custom card.
 *
 * Shows cavity temperature, probes, connectivity and cook-session alerts for a
 * Weber grill. Built for the entities published by weber-bridge (grill-weber
 * repo), but every entity is configurable, so any temperature source works.
 *
 * Visual variants live in this file and are picked with `variant`, so the preview
 * page renders the production component rather than a look-alike:
 *   photo   — product photo of the grill, reading overlaid in the free corner
 *   vector  — the same layout on the flat vector artwork
 *   compact — number leads, artwork alongside
 *   ring    — 270° gauge of progress towards the target
 *   type    — large number plus a target-marked track
 *
 * Ships a native GUI editor (ha-form + entity selectors) and registers itself in
 * the card picker with a live preview.
 */

const WEBER_CARD_VERSION = '1.2.0';

// Cavity/probe colours: cold → warm → hot. Keyed on °C.
const TEMP_STOPS = [
  [0, '#4a90d9'],
  [40, '#49a7c9'],
  [80, '#d9a441'],
  [150, '#e07b2c'],
  [250, '#d1442f'],
  [350, '#b02020'],
];

const VARIANTS = ['photo', 'vector', 'compact', 'ring', 'type'];

// Artwork lives next to the card; override with `image_base` if deployed elsewhere.
const DEFAULT_IMAGE_BASE = '/local/weber-grill-card/images/';
const IMAGES = { photo: 'grill-photo.png', vector: 'grill-vector.png' };

// Measured on the artwork: the lid occupies x 22–78%, y 0–25%, so the top
// corners are free for the reading and the lid seam sits at ~26% height.
const LID_SEAM = 26;

const DEFAULTS = {
  title: '',
  name: 'Grill',
  variant: 'photo',
  artwork: 'photo',
  show_status: true,
  animate: true,
  alarm_minutes: 30,
  unit: '°C',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mixHex(a, b, f) {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.substr(i, 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(',')})`;
}

function tempColor(t) {
  if (t === null || t === undefined || Number.isNaN(t)) return 'var(--disabled-text-color, #6c7583)';
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  const last = TEMP_STOPS[TEMP_STOPS.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const [t0, c0] = TEMP_STOPS[i];
    const [t1, c1] = TEMP_STOPS[i + 1];
    if (t >= t0 && t <= t1) return mixHex(c0, c1, (t - t0) / (t1 - t0));
  }
  return last[1];
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function numState(hass, entityId) {
  if (!entityId || !hass) return null;
  const st = hass.states[entityId];
  if (!st) return null;
  const v = parseFloat(st.state);
  return Number.isFinite(v) ? v : null;
}

function isOn(hass, entityId) {
  if (!entityId || !hass) return null;
  const st = hass.states[entityId];
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
  return st.state === 'on';
}

function isAvailable(hass, entityId) {
  if (!entityId || !hass) return false;
  const st = hass.states[entityId];
  return !!st && st.state !== 'unavailable';
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
class WeberGrillCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._built = false;
  }

  static getConfigElement() {
    return document.createElement('weber-grill-card-editor');
  }

  /** Pre-fill from existing grill entities so picking the card yields a working one. */
  static getStubConfig(hass) {
    const cfg = { type: 'custom:weber-grill-card', name: 'Grill', variant: 'photo', probes: [] };
    if (!hass || !hass.states) return cfg;

    // Scoped to grill-looking entities: an unrelated wifi or battery sensor must
    // never get wired in behind the user's back.
    const GRILL = /spirit|weber|grill/i;
    const ids = Object.keys(hass.states).filter((id) => GRILL.test(id));
    const find = (domain, re) => ids.find((id) => id.startsWith(domain) && re.test(id));

    cfg.cavity_temp = find('sensor.', /temperatura_komory|cavity_temp/);
    cfg.cavity_target = find('sensor.', /cel_komory|cavity_target/);
    cfg.battery = find('sensor.', /bateria|battery/);
    cfg.last_alarm = find('sensor.', /ostatni_alarm|last_alarm/);
    cfg.wifi = find('binary_sensor.', /wifi/);
    cfg.cloud = find('binary_sensor.', /chmura|cloud/);
    cfg.bluetooth = find('binary_sensor.', /bluetooth/);

    const probeRe = /(sonda|probe)_(\d+)$/;
    ids.filter((id) => id.startsWith('sensor.') && probeRe.test(id)).sort().forEach((id) => {
      const n = id.match(probeRe)[2];
      const target = ids.find((t) => t === `${id}_cel` || t === `${id}_target`);
      cfg.probes.push({ name: `Sonda ${n}`, temp: id, target });
    });

    Object.keys(cfg).forEach((k) => cfg[k] === undefined && delete cfg[k]);
    return cfg;
  }

  setConfig(config) {
    if (!config) throw new Error('Brak konfiguracji');
    this._config = { ...DEFAULTS, ...config };
    if (!VARIANTS.includes(this._config.variant)) this._config.variant = DEFAULTS.variant;
    this._config.probes = Array.isArray(config.probes) ? config.probes : [];
    this._built = false;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 4 + Math.ceil((this._config?.probes?.length || 0) / 2);
  }

  // -- rendering --------------------------------------------------------
  _render() {
    if (!this._config) return;
    const c = this._config;

    const cavity = numState(this._hass, c.cavity_temp);
    const target = numState(this._hass, c.cavity_target);
    const battery = numState(this._hass, c.battery);
    const online = c.cavity_temp ? isAvailable(this._hass, c.cavity_temp) : true;

    if (!this._built) {
      this.shadowRoot.innerHTML = `<style>${this._css()}</style><ha-card></ha-card>`;
      this._built = true;
    }

    const card = this.shadowRoot.querySelector('ha-card');
    card.innerHTML = `
      ${c.title ? `<h1 class="card-header">${esc(c.title)}</h1>` : ''}
      <div class="wrap${online ? '' : ' offline'}">
        <div class="hd">
          <span class="nm">${esc(c.name || 'Grill')}</span>
          ${c.show_status ? this._chips(battery) : ''}
        </div>
        ${this._alarmBanner()}
        ${this._hero(cavity, target)}
        ${this._probes()}
        ${online ? '' : '<div class="offline-note">Grill niedostępny</div>'}
      </div>`;

    card.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const e = new Event('hass-more-info', { bubbles: true, composed: true });
        e.detail = { entityId: el.getAttribute('data-entity') };
        this.dispatchEvent(e);
      });
    });
  }

  /** Dispatch on the configured variant. */
  _hero(cavity, target) {
    const color = tempColor(cavity);
    const heat = cavity === null ? 0 : clamp((cavity - 45) / 175, 0, 1);
    const pct = (cavity !== null && target) ? clamp((cavity / target) * 100, 0, 100) : null;
    switch (this._config.variant) {
      case 'ring': return this._heroRing(cavity, target, color, pct);
      case 'type': return this._heroType(cavity, target, color, pct);
      case 'compact': return this._heroCompact(cavity, target, color, pct, heat);
      case 'vector': return this._heroImage('vector', cavity, target, color, heat);
      default: return this._heroImage('photo', cavity, target, color, heat);
    }
  }

  _imgSrc(kind) {
    const base = this._config.image_base || DEFAULT_IMAGE_BASE;
    return base + (IMAGES[kind] || IMAGES.photo);
  }

  /** Product artwork with the reading overlaid in the free top corner. */
  _heroImage(kind, cavity, target, color, heat) {
    const smoke = this._config.animate && heat > 0.15 ? clamp(heat, 0, 0.75).toFixed(2) : 0;
    return `<div class="hero img" data-entity="${esc(this._config.cavity_temp)}">
      <img src="${esc(this._imgSrc(kind))}" alt="Weber Spirit" loading="lazy">
      <div class="ember" style="opacity:${(heat * 0.95).toFixed(2)}"></div>
      <div class="smoke2" style="opacity:${smoke}"><i></i><i></i><i></i></div>
      <div class="read">
        <span class="v" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></span>
        ${target === null ? '' : `<span class="t">cel ${Math.round(target)} ${esc(this._config.unit)}</span>`}
      </div>
    </div>`;
  }

  _heroCompact(cavity, target, color, pct, heat) {
    return `<div class="hero compact" data-entity="${esc(this._config.cavity_temp)}">
      <div>
        <div class="big sm" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
        <div class="sub"><span>komora</span>${target === null ? '' : `<span>cel ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
        ${this._numTrack(pct, color)}
      </div>
      <div class="art">
        <img src="${esc(this._imgSrc(this._config.artwork))}" alt="Weber Spirit" loading="lazy">
        <div class="ember" style="opacity:${(heat * 0.95).toFixed(2)}"></div>
      </div>
    </div>`;
  }

  _numTrack(pct, color) {
    if (pct === null) return '';
    return `<div class="track"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></div>`;
  }

  _heroRing(cavity, target, color, pct) {
    const ARC = 367;           // length of a 270° arc at r=78
    const p = pct === null ? 0 : pct;
    return `<div class="hero ring" data-entity="${esc(this._config.cavity_temp)}">
      <svg viewBox="0 0 200 200" role="img" aria-label="Wskaźnik temperatury komory">
        <defs>
          <linearGradient id="wgArc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#4a90d9"/><stop offset=".5" stop-color="#e0a33a"/>
            <stop offset="1" stop-color="#d1442f"/>
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="78" fill="none" stroke="var(--divider-color,#232a36)" stroke-width="13"
                stroke-dasharray="${ARC} 490" stroke-linecap="round" transform="rotate(135 100 100)"/>
        <circle cx="100" cy="100" r="78" fill="none" stroke="url(#wgArc)" stroke-width="13"
                stroke-dasharray="${(ARC * p / 100).toFixed(1)} 490" stroke-linecap="round"
                transform="rotate(135 100 100)"/>
        <line x1="100" y1="14" x2="100" y2="30" stroke="var(--primary-text-color,#e8eaee)" stroke-width="3"
              stroke-linecap="round" opacity=".8" transform="rotate(${(270 * p / 100).toFixed(1)} 100 100)"/>
        <text class="ringVal" x="100" y="103" text-anchor="middle" fill="${color}">${cavity === null ? '--' : Math.round(cavity)}</text>
        <text class="ringLbl" x="100" y="122" text-anchor="middle">${esc(this._config.unit)} w komorze</text>
        ${target === null ? '' : `<text class="ringTgt" x="100" y="146" text-anchor="middle">cel ${Math.round(target)}${esc(this._config.unit)}</text>`}
      </svg>
    </div>`;
  }

  _heroType(cavity, target, color, pct) {
    return `<div class="hero type" data-entity="${esc(this._config.cavity_temp)}">
      <div class="big" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
      <div class="sub"><span>komora</span>${target === null ? '' : `<span>cel ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
      ${this._numTrack(pct, color)}
    </div>`;
  }

  _chips(battery) {
    const c = this._config;
    const chip = (on, icon, label, entity) => (on === null ? ''
      : `<span class="chip ${on ? 'on' : 'off'}" data-entity="${esc(entity)}" title="${esc(label)}"><ha-icon icon="${icon}"></ha-icon></span>`);
    const parts = [
      chip(isOn(this._hass, c.wifi), 'mdi:wifi', 'WiFi', c.wifi),
      chip(isOn(this._hass, c.cloud), 'mdi:cloud-outline', 'Chmura', c.cloud),
      chip(isOn(this._hass, c.bluetooth), 'mdi:bluetooth', 'Bluetooth', c.bluetooth),
    ];
    if (battery !== null) {
      const icon = battery > 90 ? 'mdi:battery'
        : battery > 10 ? `mdi:battery-${Math.round(battery / 10) * 10}` : 'mdi:battery-alert';
      parts.push(`<span class="chip batt ${battery <= 15 ? 'low' : ''}" data-entity="${esc(c.battery)}" title="Bateria"><ha-icon icon="${icon}"></ha-icon><b>${Math.round(battery)}%</b></span>`);
    }
    const html = parts.filter(Boolean).join('');
    return html ? `<span class="chips">${html}</span>` : '';
  }

  _alarmBanner() {
    const id = this._config.last_alarm;
    if (!id || !this._hass) return '';
    const st = this._hass.states[id];
    if (!st || ['unknown', 'unavailable', ''].includes(st.state)) return '';
    const when = st.attributes?.when ? new Date(st.attributes.when) : null;
    const mins = this._config.alarm_minutes;
    if (when && mins > 0 && (Date.now() - when.getTime()) / 60000 > mins) return '';
    const sub = st.attributes?.text || '';
    return `<div class="alarm" data-entity="${esc(id)}">
      <ha-icon icon="mdi:bell-ring"></ha-icon>
      <div><b>${esc(st.state)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`;
  }

  _probes() {
    const probes = this._config.probes || [];
    if (!probes.length) return '';
    const rows = probes.map((p, i) => {
      const t = numState(this._hass, p.temp);
      const tgt = numState(this._hass, p.target);
      const pct = (t !== null && tgt) ? clamp((t / tgt) * 100, 0, 100) : null;
      const col = tempColor(t);
      return `<div class="pr${pct !== null && pct >= 100 ? ' hit' : ''}" data-entity="${esc(p.temp)}">
        <div class="prtop">
          <span class="prname"><ha-icon icon="mdi:thermometer-probe"></ha-icon>${esc(p.name || `Sonda ${i + 1}`)}</span>
          <span class="prval" style="color:${col}">${t === null ? '--' : Math.round(t)}${tgt === null ? '' : `<u>/ ${Math.round(tgt)} ${esc(this._config.unit)}</u>`}</span>
        </div>
        ${pct === null ? '' : `<div class="prbar"><i style="width:${pct.toFixed(1)}%;background:${col}"></i></div>`}
      </div>`;
    }).join('');
    return `<div class="probes">${rows}</div>`;
  }

  _css() {
    return `
      :host { display: block; }
      ha-card { overflow: hidden; }
      .card-header { font-size: 20px; font-weight: 400; padding: 12px 16px 0; margin: 0; }
      .wrap { padding: 13px 16px 16px; }
      .wrap.offline { opacity: .55; }
      .hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .nm { font-size: 14px; font-weight: 600; letter-spacing: -.01em; color: var(--primary-text-color); }
      .chips { display: flex; gap: 5px; }
      .chip { min-width: 22px; height: 22px; padding: 0 5px; border-radius: 7px; display: inline-flex;
              align-items: center; justify-content: center; gap: 4px; cursor: pointer;
              background: var(--secondary-background-color); color: var(--disabled-text-color); }
      .chip ha-icon { --mdc-icon-size: 14px; }
      .chip.on { color: var(--state-icon-active-color, #f0a23c); }
      .chip b { font-size: 11px; font-weight: 600; color: var(--secondary-text-color);
                font-variant-numeric: tabular-nums; }
      .chip.batt.low, .chip.batt.low b { color: var(--error-color, #db4437); }

      .hero { margin-top: 8px; cursor: pointer; }
      .hero svg { width: 100%; height: auto; display: block; }

      /* Artwork variants: the reading sits in the corner the grill leaves empty
         (lid spans x 22–78%), so it never lands on the Weber badge. */
      /* Container query so the overlaid reading scales with the card's own width,
         not the viewport — the same card sits in narrow and wide columns. */
      .hero.img { position: relative; container-type: inline-size; }
      .hero.img img { width: 100%; height: auto; display: block; }
      .hero.img .read { position: absolute; top: 1%; right: 1%; text-align: right;
                        line-height: 1; pointer-events: none; }
      .hero.img .read .v { font-size: clamp(26px, 12cqw, 44px); font-weight: 700;
                           letter-spacing: -.035em; font-variant-numeric: tabular-nums; display: block; }
      .hero.img .read .v sup { font-size: .42em; font-weight: 600; margin-left: 1px; }
      .hero.img .read .t { font-size: 11px; color: var(--secondary-text-color); display: block; margin-top: 3px; }
      /* Heat leaking from the lid seam, measured at ${LID_SEAM}% of the artwork height. */
      .hero.img .ember, .hero.compact .ember {
        position: absolute; left: 12%; right: 12%; top: ${LID_SEAM - 5}%; height: 16%;
        border-radius: 50%; pointer-events: none; transition: opacity .8s ease;
        background: radial-gradient(ellipse at center, rgba(255,123,46,.85), rgba(255,123,46,0) 70%);
        filter: blur(6px); mix-blend-mode: screen; }
      .hero.img .smoke2 { position: absolute; left: 40%; top: 0; width: 20%; height: 26%;
                          pointer-events: none; transition: opacity .8s ease; }
      .hero.img .smoke2 i { position: absolute; bottom: 0; width: 9px; height: 9px; border-radius: 50%;
                            background: #93a0b3; opacity: 0; animation: wgPuff 4.5s ease-in-out infinite; }
      .hero.img .smoke2 i:nth-child(1) { left: 12%; }
      .hero.img .smoke2 i:nth-child(2) { left: 45%; animation-delay: -1.5s; }
      .hero.img .smoke2 i:nth-child(3) { left: 74%; animation-delay: -3s; }
      @keyframes wgPuff { 0% { transform: translateY(4px) scale(.7); opacity: 0; }
                          35% { opacity: .5; } 100% { transform: translateY(-46px) scale(1.5); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .hero.img .smoke2 i { animation: none; } }

      .hero.compact { display: grid; grid-template-columns: 1fr 46%; gap: 10px; align-items: center; }
      .hero.compact .art { position: relative; }
      .hero.compact .art img { width: 100%; height: auto; display: block; }

      .hero.ring { display: grid; place-items: center; }
      .hero.ring svg { max-width: 250px; }
      .ringVal { font-size: 46px; font-weight: 700; letter-spacing: -.03em;
                 font-family: var(--paper-font-headline_-_font-family, inherit); }
      .ringLbl { font-size: 13px; fill: var(--secondary-text-color); }
      .ringTgt { font-size: 12px; fill: var(--disabled-text-color); }

      .big { font-size: 62px; font-weight: 700; line-height: .92; letter-spacing: -.045em;
             font-variant-numeric: tabular-nums; display: flex; align-items: flex-start; gap: 4px; }
      .big.sm { font-size: 50px; }
      .big sup { font-size: 20px; font-weight: 600; margin-top: 8px; letter-spacing: 0; }
      .sub { display: flex; justify-content: space-between; margin-top: 9px;
             font-size: 12px; color: var(--secondary-text-color); }
      .track { height: 6px; border-radius: 3px; background: var(--divider-color); margin-top: 8px; overflow: hidden; }
      .track i { display: block; height: 100%; border-radius: 3px; transition: width .6s ease; }

      .probes { display: grid; gap: 7px; margin-top: 11px; }
      .pr { background: var(--secondary-background-color); border-radius: 11px; padding: 9px 11px; cursor: pointer; }
      .pr.hit { box-shadow: inset 0 0 0 1px var(--success-color, #43a047); }
      .prtop { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .prname { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--secondary-text-color); }
      .prname ha-icon { --mdc-icon-size: 14px; }
      .prval { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
      .prval u { text-decoration: none; font-size: 11px; color: var(--disabled-text-color); font-weight: 500; margin-left: 3px; }
      .prbar { height: 3px; border-radius: 2px; background: var(--divider-color); margin-top: 7px; overflow: hidden; }
      .prbar i { display: block; height: 100%; border-radius: 2px; transition: width .6s ease; }

      .alarm { display: flex; align-items: center; gap: 9px; margin-top: 10px; padding: 9px 11px;
               border-radius: 11px; cursor: pointer; color: #fff;
               background: linear-gradient(90deg, #7f1d1d, #9b2c2c); }
      .alarm ha-icon { --mdc-icon-size: 18px; flex: none; }
      .alarm b { font-size: 12.5px; display: block; }
      .alarm span { font-size: 11px; opacity: .82; display: block; margin-top: 1px; }
      .offline-note { margin-top: 9px; text-align: center; font-size: 12px; color: var(--secondary-text-color); }
    `;
  }
}

// ---------------------------------------------------------------------------
// GUI editor — native ha-form, so entity fields get real HA pickers
// ---------------------------------------------------------------------------
const EDITOR_LABELS = {
  title: 'Tytuł karty', name: 'Nazwa grilla', variant: 'Wygląd',
  artwork: 'Grafika w wariancie „Kompakt”',
  cavity_temp: 'Temperatura komory', cavity_target: 'Cel komory', battery: 'Bateria',
  wifi: 'WiFi', cloud: 'Chmura', bluetooth: 'Bluetooth', last_alarm: 'Ostatni alarm',
  show_status: 'Ikony stanu', animate: 'Animacja dymu', alarm_minutes: 'Ukryj alarm po (min)',
};

const EDITOR_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  { name: 'title', selector: { text: {} } },
  {
    name: 'variant',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'photo', label: 'Zdjęcie grilla' },
          { value: 'vector', label: 'Grafika wektorowa' },
          { value: 'compact', label: 'Kompakt — liczba + grill obok' },
          { value: 'ring', label: 'Pierścień — wskaźnik celu' },
          { value: 'type', label: 'Typograficzny — sama liczba' },
        ],
      },
    },
  },
  {
    name: 'artwork',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'photo', label: 'Zdjęcie' },
          { value: 'vector', label: 'Wektor' },
        ],
      },
    },
  },
  {
    name: '', type: 'grid', schema: [
      { name: 'cavity_temp', selector: { entity: { domain: 'sensor' } } },
      { name: 'cavity_target', selector: { entity: { domain: 'sensor' } } },
      { name: 'battery', selector: { entity: { domain: 'sensor' } } },
      { name: 'last_alarm', selector: { entity: { domain: ['sensor', 'event'] } } },
      { name: 'wifi', selector: { entity: { domain: 'binary_sensor' } } },
      { name: 'cloud', selector: { entity: { domain: 'binary_sensor' } } },
      { name: 'bluetooth', selector: { entity: { domain: 'binary_sensor' } } },
    ],
  },
  {
    name: '', type: 'grid', schema: [
      { name: 'show_status', selector: { boolean: {} } },
      { name: 'animate', selector: { boolean: {} } },
      { name: 'alarm_minutes', selector: { number: { min: 0, max: 720, mode: 'box' } } },
    ],
  },
];

class WeberGrillCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config }, bubbles: true, composed: true,
    }));
  }

  _render() {
    if (!this._built) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .sec { margin-top: 14px; }
          .sec h4 { margin: 0 0 6px; font-size: 13px; color: var(--secondary-text-color); font-weight: 500; }
          .probe { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; align-items: center; margin-bottom: 6px; }
          .probe input { padding: 7px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px;
                         background: var(--card-background-color, #fff); color: var(--primary-text-color); min-width: 0; }
          .probe button, .add { border: none; border-radius: 4px; padding: 7px 10px; cursor: pointer;
                                background: var(--secondary-background-color); color: var(--primary-text-color); }
          .hint { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 6px; }
        </style>
        <div id="form"></div>
        <div class="sec">
          <h4>Sondy</h4>
          <div class="hint">Encje temperatury sondy i jej celu. Puste pole celu ukrywa pasek postępu.</div>
          <div id="probes"></div>
          <button class="add" id="add">+ Dodaj sondę</button>
        </div>`;
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._config = { ...this._config, ...ev.detail.value };
        this._emit();
      });
      this.shadowRoot.getElementById('form').appendChild(this._form);
      this.shadowRoot.getElementById('add').addEventListener('click', () => {
        const probes = [...(this._config.probes || [])];
        probes.push({ name: `Sonda ${probes.length + 1}`, temp: '', target: '' });
        this._config = { ...this._config, probes };
        this._emit();
        this._renderProbes();
      });
      this._built = true;
    }
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
    if (this._hass) this._form.hass = this._hass;
    this._renderProbes();
  }

  _renderProbes() {
    const host = this.shadowRoot?.getElementById('probes');
    if (!host) return;
    const probes = this._config.probes || [];
    host.innerHTML = probes.map((p, i) => `
      <div class="probe" data-i="${i}">
        <input data-k="name" placeholder="Nazwa" value="${esc(p.name || '')}">
        <input data-k="temp" placeholder="sensor.…_sonda_1" value="${esc(p.temp || '')}">
        <input data-k="target" placeholder="sensor.…_sonda_1_cel" value="${esc(p.target || '')}">
        <button data-del="${i}" title="Usuń">✕</button>
      </div>`).join('');

    host.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const i = Number(inp.closest('.probe').dataset.i);
        const probes2 = [...(this._config.probes || [])];
        probes2[i] = { ...probes2[i], [inp.dataset.k]: inp.value };
        this._config = { ...this._config, probes: probes2 };
        this._emit();
      });
    });
    host.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.del);
        this._config = { ...this._config, probes: (this._config.probes || []).filter((_, n) => n !== i) };
        this._emit();
        this._renderProbes();
      });
    });
  }
}

customElements.define('weber-grill-card', WeberGrillCard);
customElements.define('weber-grill-card-editor', WeberGrillCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'weber-grill-card',
  name: 'Weber Grill Card',
  description: 'Grill z temperaturą komory, sondami i alarmami sesji pieczenia',
  preview: true,
  documentationURL: 'https://fg.iwanus.eu/jiwanus/weber-grill-card',
});

console.info(
  '%c WEBER-GRILL-CARD %c v' + WEBER_CARD_VERSION + ' ',
  'background: #7f1d1d; color: #fde68a; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #1f2937; color: #fff; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
