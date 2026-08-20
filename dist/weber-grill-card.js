/**
 * Weber Grill Card — Home Assistant Lovelace custom card.
 *
 * Renders the grill as an actual grill: an SVG gas grill whose lid carries the
 * cavity temperature, with probe rows underneath and a banner for cook-session
 * alerts. Built for the entities published by weber-bridge (grill-weber repo),
 * but every entity is configurable, so it works with any temperature source.
 *
 * Ships a native GUI editor (ha-form + entity selectors) and registers itself in
 * the card picker with a live preview.
 */

const WEBER_CARD_VERSION = '1.0.0';

// Cavity/probe colours: cold → warm → hot. Keyed on °C.
const TEMP_STOPS = [
  [0, '#4a90d9'],
  [40, '#49a7c9'],
  [80, '#d9a441'],
  [150, '#e07b2c'],
  [250, '#d1442f'],
  [350, '#b02020'],
];

const DEFAULTS = {
  title: '',
  name: 'Grill',
  show_image: true,
  show_status: true,
  animate: true,
  alarm_minutes: 30,
  unit: '°C',
};

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function tempColor(t) {
  if (t === null || t === undefined || Number.isNaN(t)) return 'var(--disabled-text-color, #888)';
  const stops = TEMP_STOPS;
  if (t <= stops[0][0]) return stops[0][1];
  if (t >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return mixHex(c0, c1, f);
    }
  }
  return stops[stops.length - 1][1];
}

function mixHex(a, b, f) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * f));
  return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Numeric state, or null for unknown/unavailable/non-numeric. */
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
  if (!st) return null;
  if (st.state === 'unavailable' || st.state === 'unknown') return null;
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

  /**
   * Pre-fill from whatever grill entities exist, so picking the card from the
   * GUI yields a working card instead of an empty shell.
   */
  static getStubConfig(hass) {
    const cfg = { type: 'custom:weber-grill-card', name: 'Grill', probes: [] };
    if (!hass || !hass.states) return cfg;

    // Only consider entities that look like a grill, so an unrelated "wifi" or
    // "battery" sensor never gets wired in behind the user's back.
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

    // Probes: sensor.<...>_sonda_N / _probe_N plus its matching target sibling.
    const probeRe = /(sonda|probe)_(\d+)$/;
    ids.filter((id) => id.startsWith('sensor.') && probeRe.test(id))
      .sort()
      .forEach((id) => {
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

  static getLayoutOptions() {
    return { grid_rows: 5, grid_columns: 4, grid_min_rows: 3 };
  }

  // -- rendering --------------------------------------------------------
  _render() {
    if (!this._config) return;
    const c = this._config;
    const hass = this._hass;

    const cavity = numState(hass, c.cavity_temp);
    const target = numState(hass, c.cavity_target);
    const batt = numState(hass, c.battery);
    const online = c.cavity_temp ? isAvailable(hass, c.cavity_temp) : true;

    const heat = cavity === null ? 0 : clamp((cavity - 25) / 225, 0, 1);
    const color = tempColor(cavity);

    if (!this._built) {
      this.shadowRoot.innerHTML = `<style>${this._css()}</style><ha-card></ha-card>`;
      this._built = true;
    }
    const card = this.shadowRoot.querySelector('ha-card');

    card.innerHTML = `
      ${c.title ? `<h1 class="card-header">${esc(c.title)}</h1>` : ''}
      <div class="wrap${online ? '' : ' offline'}">
        ${this._alarmBanner()}
        <div class="top">
          <div class="name">${esc(c.name || 'Grill')}</div>
          ${c.show_status ? this._statusChips(batt) : ''}
        </div>
        <div class="hero">
          ${c.show_image ? this._grillSvg(heat, color, cavity, target) : this._bigReadout(cavity, target, color)}
        </div>
        ${this._probesHtml()}
        ${online ? '' : '<div class="offline-note">Grill niedostępny</div>'}
      </div>
    `;

    card.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._showMore(el.getAttribute('data-entity'));
      });
    });
  }

  _showMore(entityId) {
    if (!entityId) return;
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _statusChips(batt) {
    const c = this._config;
    const chip = (on, icon, label, entity) => {
      if (on === null) return '';
      return `<span class="chip ${on ? 'on' : 'off'}" data-entity="${esc(entity)}" title="${esc(label)}">
        <ha-icon icon="${icon}"></ha-icon></span>`;
    };
    const parts = [
      chip(isOn(this._hass, c.wifi), 'mdi:wifi', 'WiFi', c.wifi),
      chip(isOn(this._hass, c.cloud), 'mdi:cloud-outline', 'Chmura', c.cloud),
      chip(isOn(this._hass, c.bluetooth), 'mdi:bluetooth', 'Bluetooth', c.bluetooth),
    ];
    if (batt !== null) {
      const lvl = batt <= 15 ? 'low' : 'ok';
      const icon = batt > 90 ? 'mdi:battery' : batt > 10
        ? `mdi:battery-${Math.round(batt / 10) * 10}` : 'mdi:battery-alert';
      parts.push(`<span class="chip batt ${lvl}" data-entity="${esc(c.battery)}" title="Bateria">
        <ha-icon icon="${icon}"></ha-icon><b>${Math.round(batt)}%</b></span>`);
    }
    const html = parts.filter(Boolean).join('');
    return html ? `<div class="chips">${html}</div>` : '';
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
      <div><b>${esc(st.state)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    </div>`;
  }

  _bigReadout(cavity, target, color) {
    return `<div class="readout" data-entity="${esc(this._config.cavity_temp)}">
      <div class="val" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<i>${esc(this._config.unit)}</i></div>
      ${target === null ? '' : `<div class="tgt">cel ${Math.round(target)}${esc(this._config.unit)}</div>`}
    </div>`;
  }

  /** A gas grill, drawn inline: no external assets, scales, themes cleanly. */
  _grillSvg(heat, color, cavity, target) {
    const glow = (0.15 + heat * 0.85).toFixed(2);
    const anim = this._config.animate && heat > 0.12;
    const smoke = anim ? `
      <g class="smoke" opacity="${clamp(heat, 0, 0.7).toFixed(2)}">
        <circle cx="96" cy="60" r="7"/>
        <circle cx="120" cy="52" r="9"/>
        <circle cx="146" cy="58" r="6"/>
      </g>` : '';

    return `
    <div class="grill" data-entity="${esc(this._config.cavity_temp)}">
      <svg viewBox="0 0 260 210" role="img" aria-label="Grill">
        <defs>
          <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4b5563"/><stop offset="100%" stop-color="#1f2937"/>
          </linearGradient>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#374151"/><stop offset="100%" stop-color="#111827"/>
          </linearGradient>
          <radialGradient id="heat">
            <stop offset="0%" stop-color="${color}" stop-opacity="${glow}"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </radialGradient>
        </defs>

        ${smoke}

        <!-- heat halo escaping the lid seam -->
        <ellipse cx="130" cy="106" rx="86" ry="26" fill="url(#heat)"/>

        <!-- lid -->
        <path d="M46 104 a84 60 0 0 1 168 0 z" fill="url(#lid)"/>
        <path d="M46 104 a84 60 0 0 1 168 0" fill="none" stroke="#6b7280" stroke-width="2"/>
        <rect x="118" y="40" width="24" height="7" rx="3.5" fill="#9ca3af"/>
        <rect x="126" y="47" width="8" height="9" fill="#6b7280"/>

        <!-- cavity readout on the lid -->
        <text class="lid-val" x="130" y="96" text-anchor="middle" fill="${color}">
          ${cavity === null ? '--' : Math.round(cavity)}<tspan class="deg">${esc(this._config.unit)}</tspan>
        </text>
        ${target === null ? '' : `<text class="lid-tgt" x="130" y="112" text-anchor="middle">cel ${Math.round(target)}${esc(this._config.unit)}</text>`}

        <!-- fire box + seam -->
        <rect x="44" y="104" width="172" height="8" rx="3" fill="#6b7280"/>
        <rect x="48" y="112" width="164" height="34" rx="5" fill="url(#body)"/>

        <!-- side shelves -->
        <rect x="12" y="112" width="34" height="6" rx="3" fill="#4b5563"/>
        <rect x="214" y="112" width="34" height="6" rx="3" fill="#4b5563"/>

        <!-- control knobs -->
        <g fill="#9ca3af">
          <circle cx="78" cy="129" r="5"/><circle cx="102" cy="129" r="5"/><circle cx="126" cy="129" r="5"/>
        </g>

        <!-- cart + wheels -->
        <rect x="62" y="146" width="12" height="40" fill="#374151"/>
        <rect x="186" y="146" width="12" height="40" fill="#374151"/>
        <rect x="62" y="168" width="136" height="7" rx="3" fill="#4b5563"/>
        <circle cx="68" cy="192" r="12" fill="#1f2937" stroke="#4b5563" stroke-width="3"/>
        <circle cx="192" cy="192" r="12" fill="#1f2937" stroke="#4b5563" stroke-width="3"/>
      </svg>
    </div>`;
  }

  _probesHtml() {
    const probes = this._config.probes || [];
    if (!probes.length) return '';
    const rows = probes.map((p, i) => {
      const t = numState(this._hass, p.temp);
      const tgt = numState(this._hass, p.target);
      const pct = (t !== null && tgt !== null && tgt > 0)
        ? clamp((t / tgt) * 100, 0, 100) : null;
      const col = tempColor(t);
      const done = pct !== null && pct >= 100;
      return `
        <div class="probe${done ? ' done' : ''}" data-entity="${esc(p.temp)}">
          <div class="prow">
            <span class="pname"><ha-icon icon="mdi:thermometer-probe"></ha-icon>${esc(p.name || `Sonda ${i + 1}`)}</span>
            <span class="pval" style="color:${col}">
              ${t === null ? '--' : Math.round(t)}<i>${esc(this._config.unit)}</i>
              ${tgt === null ? '' : `<u>/ ${Math.round(tgt)}${esc(this._config.unit)}</u>`}
            </span>
          </div>
          ${pct === null ? '' : `<div class="bar"><span style="width:${pct.toFixed(1)}%;background:${col}"></span></div>`}
        </div>`;
    }).join('');
    return `<div class="probes">${rows}</div>`;
  }

  _css() {
    return `
      :host { display: block; }
      ha-card { overflow: hidden; }
      .card-header { font-size: 20px; font-weight: 400; padding: 12px 16px 0; margin: 0; }
      .wrap { padding: 12px 16px 16px; }
      .wrap.offline { opacity: .55; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
      .chips { display: flex; gap: 6px; align-items: center; }
      .chip { display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border-radius: 12px;
              background: var(--secondary-background-color); cursor: pointer; }
      .chip ha-icon { --mdc-icon-size: 16px; color: var(--disabled-text-color); }
      .chip.on ha-icon { color: var(--state-icon-active-color, #f9a825); }
      .chip b { font-size: 11px; color: var(--secondary-text-color); font-weight: 500; }
      .chip.batt.low ha-icon, .chip.batt.low b { color: var(--error-color, #db4437); }
      .hero { display: flex; justify-content: center; margin: 4px 0 2px; }
      .grill { width: 100%; max-width: 320px; cursor: pointer; }
      .grill svg { width: 100%; height: auto; display: block; }
      .lid-val { font-size: 34px; font-weight: 600; font-family: var(--paper-font-headline_-_font-family, inherit); }
      .lid-val .deg { font-size: 17px; }
      .lid-tgt { font-size: 12px; fill: #cbd5e1; text-anchor: middle; }
      .readout { text-align: center; cursor: pointer; padding: 8px 0; }
      .readout .val { font-size: 46px; font-weight: 600; line-height: 1; }
      .readout .val i { font-size: 22px; font-style: normal; }
      .readout .tgt { font-size: 13px; color: var(--secondary-text-color); margin-top: 4px; }
      .smoke circle { fill: #94a3b8; animation: rise 4s ease-in-out infinite; }
      .smoke circle:nth-child(2) { animation-delay: -1.3s; }
      .smoke circle:nth-child(3) { animation-delay: -2.6s; }
      @keyframes rise { 0% { transform: translateY(6px); opacity: .1; }
                        50% { opacity: .55; } 100% { transform: translateY(-16px); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .smoke circle { animation: none; } }
      .probes { display: grid; gap: 8px; margin-top: 10px; }
      .probe { background: var(--secondary-background-color); border-radius: 10px; padding: 8px 10px; cursor: pointer; }
      .probe.done { box-shadow: inset 0 0 0 2px var(--success-color, #43a047); }
      .prow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .pname { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--secondary-text-color); }
      .pname ha-icon { --mdc-icon-size: 16px; }
      .pval { font-size: 20px; font-weight: 600; }
      .pval i { font-size: 12px; font-style: normal; }
      .pval u { font-size: 12px; text-decoration: none; color: var(--secondary-text-color); margin-left: 3px; }
      .bar { height: 4px; border-radius: 2px; background: var(--divider-color); margin-top: 6px; overflow: hidden; }
      .bar span { display: block; height: 100%; border-radius: 2px; transition: width .6s ease; }
      .alarm { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 8px 10px; cursor: pointer;
               border-radius: 10px; background: var(--error-color, #db4437); color: #fff; }
      .alarm ha-icon { --mdc-icon-size: 20px; }
      .alarm b { font-size: 13px; display: block; }
      .alarm span { font-size: 11px; opacity: .85; display: block; }
      .offline-note { margin-top: 8px; text-align: center; font-size: 12px; color: var(--secondary-text-color); }
    `;
  }
}

// ---------------------------------------------------------------------------
// GUI editor — native ha-form, so entity fields get real HA pickers
// ---------------------------------------------------------------------------
const EDITOR_LABELS = {
  title: 'Tytuł karty',
  name: 'Nazwa grilla',
  cavity_temp: 'Temperatura komory',
  cavity_target: 'Cel komory',
  battery: 'Bateria',
  wifi: 'WiFi',
  cloud: 'Chmura',
  bluetooth: 'Bluetooth',
  last_alarm: 'Ostatni alarm',
  show_image: 'Pokaż grafikę grilla',
  show_status: 'Pokaż ikony stanu',
  animate: 'Animacja dymu',
  alarm_minutes: 'Ukryj alarm po (min)',
};

const EDITOR_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  { name: 'title', selector: { text: {} } },
  {
    name: '',
    type: 'grid',
    schema: [
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
    name: '',
    type: 'grid',
    schema: [
      { name: 'show_image', selector: { boolean: {} } },
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
    this._renderProbes();
  }

  _emit() {
    const ev = new CustomEvent('config-changed', {
      detail: { config: this._config }, bubbles: true, composed: true,
    });
    this.dispatchEvent(ev);
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
          .add { margin-top: 4px; }
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
        const probes2 = (this._config.probes || []).filter((_, n) => n !== i);
        this._config = { ...this._config, probes: probes2 };
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
  documentationURL: 'https://fg.iwanus.eu/jiwanus/grill-weber',
});

console.info(
  '%c WEBER-GRILL-CARD %c v' + WEBER_CARD_VERSION + ' ',
  'background: #7f1d1d; color: #fde68a; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #1f2937; color: #fff; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
