/**
 * Weber Grill Card — Home Assistant Lovelace custom card.
 *
 * Shows cavity temperature, probes, connectivity and cook-session alerts for a
 * Weber grill. Built for the entities published by weber-bridge (grill-weber
 * repo), but every entity is configurable, so any temperature source works.
 *
 * Four visual variants live in this file and are picked with `variant`, so the
 * preview page renders the production component rather than a look-alike:
 *   illustration — drawn gas grill, reading on the lid badge
 *   ring         — 270° gauge of progress towards the target
 *   type         — large number plus a target-marked track
 *   hybrid       — number leads, small grill for context
 *
 * Ships a native GUI editor (ha-form + entity selectors) and registers itself in
 * the card picker with a live preview.
 */

const WEBER_CARD_VERSION = '1.1.0';

// Cavity/probe colours: cold → warm → hot. Keyed on °C.
const TEMP_STOPS = [
  [0, '#4a90d9'],
  [40, '#49a7c9'],
  [80, '#d9a441'],
  [150, '#e07b2c'],
  [250, '#d1442f'],
  [350, '#b02020'],
];

const VARIANTS = ['illustration', 'ring', 'type', 'hybrid'];

const DEFAULTS = {
  title: '',
  name: 'Grill',
  variant: 'illustration',
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
    const cfg = { type: 'custom:weber-grill-card', name: 'Grill', variant: 'illustration', probes: [] };
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
      case 'hybrid': return this._heroHybrid(cavity, target, color, pct, heat);
      default: return this._heroIllustration(cavity, target, color, heat);
    }
  }

  _numTrack(pct, color) {
    if (pct === null) return '';
    return `<div class="track"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></div>`;
  }

  _heroType(cavity, target, color, pct) {
    return `<div class="hero type" data-entity="${esc(this._config.cavity_temp)}">
      <div class="big" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
      <div class="sub"><span>komora</span>${target === null ? '' : `<span>cel ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
      ${this._numTrack(pct, color)}
    </div>`;
  }

  _heroHybrid(cavity, target, color, pct, heat) {
    const smoke = this._config.animate && heat > 0.15 ? clamp(heat, 0, 0.8).toFixed(2) : 0;
    return `<div class="hero hybrid" data-entity="${esc(this._config.cavity_temp)}">
      <div>
        <div class="big sm" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
        <div class="sub"><span>komora</span>${target === null ? '' : `<span>cel ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
        ${this._numTrack(pct, color)}
      </div>
      <div class="art">
        <svg viewBox="0 0 120 150" role="img" aria-label="Grill">
          <defs>
            <linearGradient id="wgLidS" x1=".2" y1="0" x2=".8" y2="1">
              <stop offset="0" stop-color="#525a67"/><stop offset="1" stop-color="#1a1f27"/>
            </linearGradient>
            <radialGradient id="wgGlowS" cx=".5" cy=".5">
              <stop offset="0" stop-color="#ff7b2e" stop-opacity=".9"/>
              <stop offset="1" stop-color="#ff7b2e" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <g class="smoke" opacity="${smoke}">
            <path d="M56 30 q-8-10 1-17 q8-7 1-14" stroke="#93a0b3" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>
          </g>
          <ellipse cx="60" cy="143" rx="40" ry="4.5" fill="#000" opacity=".45"/>
          <path d="M18 74 C18 40 38 24 60 24 C82 24 102 40 102 74 Z" fill="url(#wgLidS)"/>
          <path d="M24 70 C25 46 42 32 60 32 C78 32 95 46 96 70 Z" fill="#fff" opacity=".07"/>
          <rect x="40" y="68" width="40" height="5" rx="2.5" fill="#8b95a4"/>
          <rect x="16" y="74" width="88" height="8" rx="3" fill="#4a525f"/>
          <ellipse cx="60" cy="82" rx="38" ry="7" fill="url(#wgGlowS)" opacity="${(heat * 0.9).toFixed(2)}"/>
          <rect x="20" y="82" width="80" height="20" rx="4" fill="#252b35"/>
          <g fill="#59616e"><circle cx="40" cy="92" r="4"/><circle cx="60" cy="92" r="4"/><circle cx="80" cy="92" r="4"/></g>
          <rect x="30" y="102" width="60" height="30" rx="3" fill="#222833"/>
          <rect x="33" y="105" width="26" height="24" rx="2" fill="#2f3742"/>
          <rect x="61" y="105" width="26" height="24" rx="2" fill="#2f3742"/>
          <circle cx="34" cy="134" r="7" fill="#14181f" stroke="#454e5c" stroke-width="2.5"/>
          <circle cx="86" cy="134" r="7" fill="#14181f" stroke="#454e5c" stroke-width="2.5"/>
        </svg>
      </div>
    </div>`;
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

  _heroIllustration(cavity, target, color, heat) {
    const smoke = this._config.animate && heat > 0.15 ? clamp(heat, 0, 0.8).toFixed(2) : 0;
    return `<div class="hero illu" data-entity="${esc(this._config.cavity_temp)}">
      <svg viewBox="0 0 320 250" role="img" aria-label="Grill gazowy">
        <defs>
          <linearGradient id="wgLid" x1=".2" y1="0" x2=".75" y2="1">
            <stop offset="0" stop-color="#5b636f"/><stop offset=".35" stop-color="#333a45"/>
            <stop offset="1" stop-color="#171b22"/>
          </linearGradient>
          <linearGradient id="wgSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="wgBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3d4551"/><stop offset="1" stop-color="#1b2029"/>
          </linearGradient>
          <linearGradient id="wgDoor" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#2b323d"/><stop offset=".5" stop-color="#373f4c"/>
            <stop offset="1" stop-color="#252b35"/>
          </linearGradient>
          <radialGradient id="wgGlow" cx=".5" cy=".5">
            <stop offset="0" stop-color="#ff7b2e" stop-opacity=".85"/><stop offset="1" stop-color="#ff7b2e" stop-opacity="0"/>
          </radialGradient>
          <filter id="wgSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="wgDrop" x="-30%" y="-40%" width="160%" height="190%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity=".5"/>
          </filter>
        </defs>

        <g class="smoke" opacity="${smoke}">
          <path d="M150 74 q-13-15 2-27 q13-11 1-24" stroke="#93a0b3" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5"/>
          <path d="M172 78 q-11-13 2-24 q11-10 1-20" stroke="#93a0b3" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".35"/>
        </g>

        <ellipse cx="160" cy="236" rx="96" ry="9" fill="#000" opacity=".45" filter="url(#wgSoft)"/>

        <g filter="url(#wgDrop)">
          <path d="M36 128 h34 v9 h-34 a4 4 0 0 1 0-9z" fill="#39414d"/>
          <path d="M284 128 h-34 v9 h34 a4 4 0 0 0 0-9z" fill="#39414d"/>
          <rect x="40" y="137" width="6" height="26" rx="3" fill="#2a313b"/>
          <rect x="274" y="137" width="6" height="26" rx="3" fill="#2a313b"/>

          <path d="M70 128 C70 62 118 34 160 34 C202 34 250 62 250 128 Z" fill="url(#wgLid)"/>
          <path d="M78 122 C80 70 120 44 160 44 C200 44 240 70 242 122 Z" fill="url(#wgSheen)" opacity=".5"/>
          <path d="M70 128 C70 62 118 34 160 34 C202 34 250 62 250 128" fill="none" stroke="#6a7482" stroke-width="1.6" opacity=".7"/>

          <ellipse cx="160" cy="96" rx="27" ry="17" fill="#12161d" opacity=".55"/>
          <ellipse cx="160" cy="96" rx="27" ry="17" fill="none" stroke="#7c8798" stroke-width="1.2"/>
          <text class="lidVal" x="160" y="103" text-anchor="middle" fill="${color}">${cavity === null ? '--' : Math.round(cavity)}°</text>

          <rect x="112" y="119" width="96" height="7" rx="3.5" fill="#8b95a4"/>
          <rect x="112" y="119" width="96" height="3" rx="1.5" fill="#c3cbd6" opacity=".55"/>
          <rect x="116" y="126" width="7" height="7" fill="#5d6673"/>
          <rect x="197" y="126" width="7" height="7" fill="#5d6673"/>

          <rect x="66" y="128" width="188" height="12" rx="4" fill="#4a525f"/>
          <rect x="70" y="140" width="180" height="34" rx="5" fill="url(#wgBody)"/>
          <ellipse cx="160" cy="140" rx="76" ry="12" fill="url(#wgGlow)" opacity="${(heat * 0.9).toFixed(2)}"/>

          <g>
            <g transform="translate(105,157)"><circle r="8.5" fill="#20262f"/><circle r="6.5" fill="#59616e"/><rect x="-1.2" y="-6.5" width="2.4" height="6" rx="1.2" fill="#e8eaee"/></g>
            <g transform="translate(160,157)"><circle r="8.5" fill="#20262f"/><circle r="6.5" fill="#59616e"/><rect x="-1.2" y="-6.5" width="2.4" height="6" rx="1.2" fill="#e8eaee"/></g>
            <g transform="translate(215,157)"><circle r="8.5" fill="#20262f"/><circle r="6.5" fill="#59616e"/><rect x="-1.2" y="-6.5" width="2.4" height="6" rx="1.2" fill="#e8eaee"/></g>
          </g>

          <rect x="86" y="174" width="148" height="52" rx="4" fill="#222833"/>
          <rect x="90" y="178" width="68" height="44" rx="3" fill="url(#wgDoor)"/>
          <rect x="162" y="178" width="68" height="44" rx="3" fill="url(#wgDoor)"/>
          <rect x="146" y="196" width="9" height="3" rx="1.5" fill="#95a0b0"/>
          <rect x="165" y="196" width="9" height="3" rx="1.5" fill="#95a0b0"/>

          <rect x="78" y="176" width="9" height="46" fill="#2a313b"/>
          <rect x="233" y="176" width="9" height="46" fill="#2a313b"/>
          <circle cx="82" cy="228" r="11" fill="#14181f" stroke="#454e5c" stroke-width="3.5"/>
          <circle cx="238" cy="228" r="11" fill="#14181f" stroke="#454e5c" stroke-width="3.5"/>
          <circle cx="82" cy="228" r="3" fill="#5d6673"/>
          <circle cx="238" cy="228" r="3" fill="#5d6673"/>
        </g>
      </svg>
      ${target === null ? '' : `<div class="illuTgt">cel ${Math.round(target)} ${esc(this._config.unit)}</div>`}
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
      .hero.illu { position: relative; }
      .illuTgt { text-align: center; font-size: 12px; color: var(--secondary-text-color); margin-top: -4px; }
      .hero.ring { display: grid; place-items: center; }
      .hero.ring svg { max-width: 250px; }
      .ringVal { font-size: 46px; font-weight: 700; letter-spacing: -.03em;
                 font-family: var(--paper-font-headline_-_font-family, inherit); }
      .ringLbl { font-size: 13px; fill: var(--secondary-text-color); }
      .ringTgt { font-size: 12px; fill: var(--disabled-text-color); }
      .lidVal { font-size: 21px; font-weight: 700; font-family: var(--paper-font-headline_-_font-family, inherit); }

      .big { font-size: 62px; font-weight: 700; line-height: .92; letter-spacing: -.045em;
             font-variant-numeric: tabular-nums; display: flex; align-items: flex-start; gap: 4px; }
      .big.sm { font-size: 50px; }
      .big sup { font-size: 20px; font-weight: 600; margin-top: 8px; letter-spacing: 0; }
      .sub { display: flex; justify-content: space-between; margin-top: 9px;
             font-size: 12px; color: var(--secondary-text-color); }
      .track { height: 6px; border-radius: 3px; background: var(--divider-color); margin-top: 8px; overflow: hidden; }
      .track i { display: block; height: 100%; border-radius: 3px; transition: width .6s ease; }
      .hero.hybrid { display: grid; grid-template-columns: 1fr 108px; gap: 10px; align-items: center; }

      .smoke path { animation: wgRise 4.5s ease-in-out infinite; }
      .smoke path:nth-child(2) { animation-delay: -1.8s; }
      @keyframes wgRise { 0% { transform: translateY(5px); opacity: .15; }
                          50% { opacity: .6; } 100% { transform: translateY(-14px); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .smoke path { animation: none; } }

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
          { value: 'illustration', label: 'Ilustracja — rysowany grill' },
          { value: 'ring', label: 'Pierścień — wskaźnik celu' },
          { value: 'type', label: 'Typograficzny — sama liczba' },
          { value: 'hybrid', label: 'Hybryda — liczba + grill' },
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
