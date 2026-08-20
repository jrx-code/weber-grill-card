/**
 * Weber Grill Card — Home Assistant Lovelace custom card.
 *
 * Shows cavity temperature, probes, connectivity and cook-session alerts for a
 * Weber grill. Built for the entities published by weber-bridge (grill-weber
 * repo), but every entity is configurable, so any temperature source works.
 *
 * Visual variants live in this file and are picked with `variant`, so the preview
 * page renders the production component rather than a look-alike:
 *   thermo  — gauge left, artwork right, readings over the cook box (default)
 *   artwork — the artwork alone, reading overlaid in the free corner
 *   compact — number leads, artwork alongside
 *   ring    — 270° gauge of progress towards the target
 *   type    — large number plus a target-marked track
 *
 * Photo vs. vector is not a look — it is the `artwork` option, so every layout
 * that draws the grill honours it. Configs from before 1.7 that carried
 * `variant: photo|vector` are migrated to `variant: artwork` plus that artwork.
 *
 * Everything tunable is in the GUI editor, not hardcoded: entity pickers, the
 * look and artwork, on/off for the glow, status icons and probe overlay (plus
 * smoke in the artwork look, the only one that draws it),
 * the glow colours with their thresholds, and a slider per layout coordinate —
 * plus centre/reset shortcuts. The gauge and artwork halves of the thermo look
 * stay YAML-only (`show_gauge`, `show_artwork`): switching one off is what the
 * other looks already are. The card registers itself in the picker with a live preview.
 */

const WEBER_CARD_VERSION = '1.8.0';

// Cavity/probe colours: cold → warm → hot. Keyed on °C.
const TEMP_STOPS = [
  [0, '#4a90d9'],
  [40, '#49a7c9'],
  [80, '#d9a441'],
  [150, '#e07b2c'],
  [250, '#d1442f'],
  [350, '#b02020'],
];

const VARIANTS = ['thermo', 'artwork', 'compact', 'ring', 'type'];

// Pre-1.7 looks that only differed by which image they drew. Kept so existing
// dashboards keep rendering: the image moves to `artwork`, the look to `artwork`.
const LEGACY_IMAGE_VARIANTS = { photo: 'photo', vector: 'vector' };

// Card and editor strings. The language follows HA (hass.language) unless the
// `language` option pins it; anything unknown falls back to English.
const STRINGS = {
  en: {
    grill: 'Grill', probe: 'Probe', target: 'target', cavity: 'cavity',
    inCavity: 'in cavity', offline: 'Grill unavailable',
    wifi: 'WiFi', cloud: 'Cloud', bluetooth: 'Bluetooth', battery: 'Battery',
    ed: {
      title: 'Card title', name: 'Grill name', variant: 'Look', artwork: 'Artwork',
      cavity_temp: 'Cavity temperature', cavity_target: 'Cavity target', battery: 'Battery',
      wifi: 'WiFi', cloud: 'Cloud', bluetooth: 'Bluetooth', last_alarm: 'Last alert',
      show_status: 'Status icons', animate: 'Smoke animation', alarm_minutes: 'Hide alert after (min)',
      show_gauge: 'Thermostat (gauge)', show_artwork: 'Grill artwork',
      show_glow: 'Cavity glow', show_probe_overlay: 'Probe on artwork',
      glow_cold: 'Cold', glow_warm: 'Warming', glow_hot: 'Hot',
      glow_warm_at: '“Warming” threshold (°C)', glow_hot_at: '“Hot” threshold (°C)',
      ring_w: 'Thermostat width', img_scale: 'Grill size',
      cavity_x: 'Cavity readout ↔', cavity_y: 'Cavity readout ↕', cavity_size: 'Cavity readout — size',
      probe_x: 'Probe ↔', probe_y: 'Probe ↕', probe_size: 'Probe — size',
      glow_x: 'Glow ↔', glow_y: 'Glow ↕', glow_w: 'Glow — width',
      glow_h: 'Glow — height', glow_blur: 'Glow — blur',
      glowSection: 'Glow colours', layoutSection: 'Placement (“Thermostat + grill” look)',
      quick: 'Placement — quick actions', quickHint: 'Applies to the “Thermostat + grill” look.',
      centerAll: 'Centre everything', centerCavity: 'Centre readout',
      centerProbe: 'Centre probe', centerGlow: 'Centre glow',
      resetLayout: 'Default placement', resetGlow: 'Default colours',
      probes: 'Probes', probesHint: 'Pick entities from the list. An empty target hides the progress bar.',
      addProbe: '+ Add probe', del: 'Remove probe',
      pName: 'Name', pTemp: 'Probe temperature', pTarget: 'Probe target',
      language: 'Language',
      vThermo: 'Thermostat + grill', vArtwork: 'Artwork — reading in the corner',
      vCompact: 'Compact — number + grill', vRing: 'Gauge — progress to target',
      vType: 'Typographic — number only', aPhoto: 'Photo', aVector: 'Vector',
      langAuto: 'Follow Home Assistant',
    },
  },
  pl: {
    grill: 'Grill', probe: 'Sonda', target: 'cel', cavity: 'komora',
    inCavity: 'w komorze', offline: 'Grill niedostępny',
    wifi: 'WiFi', cloud: 'Chmura', bluetooth: 'Bluetooth', battery: 'Bateria',
    ed: {
      title: 'Tytuł karty', name: 'Nazwa grilla', variant: 'Wygląd', artwork: 'Grafika',
      cavity_temp: 'Temperatura komory', cavity_target: 'Cel komory', battery: 'Bateria',
      wifi: 'WiFi', cloud: 'Chmura', bluetooth: 'Bluetooth', last_alarm: 'Ostatni alarm',
      show_status: 'Ikony stanu', animate: 'Animacja dymu', alarm_minutes: 'Ukryj alarm po (min)',
      show_gauge: 'Termostat (pierścień)', show_artwork: 'Grafika grilla',
      show_glow: 'Poświata komory', show_probe_overlay: 'Sonda na grafice',
      glow_cold: 'Zimny', glow_warm: 'Rozgrzewanie', glow_hot: 'Gorący',
      glow_warm_at: 'Próg „rozgrzewanie” (°C)', glow_hot_at: 'Próg „gorący” (°C)',
      ring_w: 'Szerokość termostatu', img_scale: 'Wielkość grilla',
      cavity_x: 'Odczyt komory ↔', cavity_y: 'Odczyt komory ↕', cavity_size: 'Odczyt komory — wielkość',
      probe_x: 'Sonda ↔', probe_y: 'Sonda ↕', probe_size: 'Sonda — wielkość',
      glow_x: 'Poświata ↔', glow_y: 'Poświata ↕', glow_w: 'Poświata — szerokość',
      glow_h: 'Poświata — wysokość', glow_blur: 'Poświata — rozmycie',
      glowSection: 'Kolory poświaty', layoutSection: 'Rozmieszczenie (wariant „Termostat + grill”)',
      quick: 'Rozmieszczenie — szybkie akcje', quickHint: 'Działa na wariant „Termostat + grill”.',
      centerAll: 'Wyśrodkuj wszystko', centerCavity: 'Wyśrodkuj odczyt',
      centerProbe: 'Wyśrodkuj sondę', centerGlow: 'Wyśrodkuj poświatę',
      resetLayout: 'Domyślne rozmieszczenie', resetGlow: 'Domyślne kolory',
      probes: 'Sondy', probesHint: 'Wybierz encje z listy. Puste pole celu ukrywa pasek postępu.',
      addProbe: '+ Dodaj sondę', del: 'Usuń sondę',
      pName: 'Nazwa', pTemp: 'Temperatura sondy', pTarget: 'Cel sondy',
      language: 'Język',
      vThermo: 'Termostat + grill', vArtwork: 'Grafika — odczyt w rogu',
      vCompact: 'Kompakt — liczba + grill', vRing: 'Pierścień — wskaźnik celu',
      vType: 'Typograficzny — sama liczba', aPhoto: 'Zdjęcie', aVector: 'Wektor',
      langAuto: 'Zgodnie z Home Assistant',
    },
  },
};

/** Strings for a config + hass pair; `language: auto` follows HA. */
function t(cfg, hass) {
  const pick = (cfg && cfg.language && cfg.language !== 'auto')
    ? cfg.language
    : (hass && hass.language) || 'en';
  return STRINGS[String(pick).slice(0, 2).toLowerCase()] || STRINGS.en;
}

// Cavity glow: three named states rather than one ramp — cold blue, warming
// yellow, hot red. Colours and the two thresholds are editable in the GUI.
const GLOW_DEFAULTS = {
  glow_cold: '#3d7fd6',
  glow_warm: '#f0c23c',
  glow_hot: '#d93a2b',
  glow_warm_at: 90,    // °C where the glow is fully "warming"
  glow_hot_at: 200,    // °C where it is fully "hot"
};

// Layout of the thermo variant, in percent of the artwork box. Defaults were
// measured on the supplied images (lid x 22–78%, y 0–25%, seam at 26%); every
// value is overridable from YAML so the position can be tuned without a rebuild.
const THERMO_LAYOUT = {
  ring_w: 44,        // width of the left gauge column, % of card
  img_scale: 100,    // artwork width, % of its column
  cavity_x: 58,      // right of the Weber badge, which sits left of lid centre
  cavity_y: 13,      // on the lid — below it sits the control panel, where the
                     // number collided with the knobs and the Spirit badge
  cavity_size: 85,
  probe_x: 87,       // probe chip, clear of the artwork's right edge
  probe_y: 46,
  probe_size: 100,
  glow_x: 50,
  glow_y: 24,        // centred on the cook box, seam at 26%
  glow_w: 58,
  glow_h: 26,
  glow_blur: 16,
};

// Artwork sits next to the card file, so the base is derived from where this
// script was loaded from. That way the same build works under /hacsfiles/… after
// a HACS install and under /local/… for a manual one, with no configuration.
// HACS downloads the whole `dist` directory, which is why the images live there.
const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
const DEFAULT_IMAGE_BASE = SELF_SRC
  ? SELF_SRC.replace(/[?#].*$/, '').replace(/[^/]*$/, '')
  : '/hacsfiles/weber-grill-card/';
const IMAGES = { photo: 'grill-photo.png', vector: 'grill-vector.png' };

// Measured on the artwork: the lid occupies x 22–78%, y 0–25%, so the top
// corners are free for the reading and the lid seam sits at ~26% height.
const LID_SEAM = 26;

const DEFAULTS = {
  title: '',
  name: 'Grill',
  variant: 'thermo',
  artwork: 'photo',
  show_status: true,
  show_gauge: true,       // the "thermostat" ring
  show_artwork: true,     // the grill photo/vector
  show_glow: true,
  show_probe_overlay: true,
  animate: true,
  alarm_minutes: 30,
  unit: '°C',
  ...GLOW_DEFAULTS,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mixHex(a, b, f) {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.substr(i, 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(',')})`;
}

function rampColor(stops, t) {
  if (t === null || t === undefined || Number.isNaN(t)) return stops[0][1];
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) return mixHex(c0, c1, (t - t0) / (t1 - t0));
  }
  return last[1];
}

/** Accept both a hex string and the [r,g,b] array HA's colour picker returns. */
function toHex(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) {
    return '#' + v.slice(0, 3).map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())) return v.trim();
  return fallback;
}

/** The three glow colours as [r,g,b], which is what HA's colour picker reads. */
function glowRgbTriplets(cfg = {}) {
  const out = {};
  ['glow_cold', 'glow_warm', 'glow_hot'].forEach((k) => {
    const hex = toHex(cfg[k], GLOW_DEFAULTS[k]);
    out[k] = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
  });
  return out;
}

/** Colour of the glow around the cook box: cold → warming → hot, per config. */
function glowColor(t, cfg = {}) {
  const cold = toHex(cfg.glow_cold, GLOW_DEFAULTS.glow_cold);
  const warm = toHex(cfg.glow_warm, GLOW_DEFAULTS.glow_warm);
  const hot = toHex(cfg.glow_hot, GLOW_DEFAULTS.glow_hot);
  const warmAt = Number(cfg.glow_warm_at ?? GLOW_DEFAULTS.glow_warm_at);
  const hotAt = Math.max(Number(cfg.glow_hot_at ?? GLOW_DEFAULTS.glow_hot_at), warmAt + 1);
  return rampColor([[20, cold], [warmAt, warm], [hotAt, hot]], t);
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
    const cfg = { type: 'custom:weber-grill-card', name: 'Grill', variant: 'thermo', probes: [] };
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
    const legacy = LEGACY_IMAGE_VARIANTS[this._config.variant];
    if (legacy) {
      // An explicit `artwork` in the config wins; otherwise the old look names it.
      if (config.artwork === undefined) this._config.artwork = legacy;
      this._config.variant = 'artwork';
    }
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

  get _t() { return t(this._config, this._hass); }

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
          <span class="nm">${esc(c.name || this._t.grill)}</span>
          ${c.show_status ? this._chips(battery) : ''}
        </div>
        ${this._alarmBanner()}
        ${this._hero(cavity, target)}
        ${this._skipProbeList() ? '' : this._probes()}
        ${online ? '' : `<div class="offline-note">${esc(this._t.offline)}</div>`}
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

  /** In thermo the probe overlay replaces the list, so it is not shown twice. */
  _skipProbeList() {
    const c = this._config;
    return c.variant === 'thermo' && c.show_artwork !== false && c.show_probe_overlay !== false;
  }

  /** Dispatch on the configured variant. */
  _hero(cavity, target) {
    const color = tempColor(cavity);
    const heat = cavity === null ? 0 : clamp((cavity - 45) / 175, 0, 1);
    const pct = (cavity !== null && target) ? clamp((cavity / target) * 100, 0, 100) : null;
    switch (this._config.variant) {
      case 'thermo': return this._heroThermo(cavity, target, color, pct);
      case 'ring': return this._heroRing(cavity, target, color, pct);
      case 'type': return this._heroType(cavity, target, color, pct);
      case 'compact': return this._heroCompact(cavity, target, color, pct, heat);
      case 'artwork': return this._heroImage(this._config.artwork, cavity, target, color, heat);
      default: return this._heroThermo(cavity, target, color, pct);
    }
  }

  _imgSrc(kind) {
    const base = this._config.image_base || DEFAULT_IMAGE_BASE;
    return base + (IMAGES[kind] || IMAGES.photo);
  }

  /** Product artwork with the reading overlaid in the free top corner. */
  _heroImage(kind, cavity, target, color, heat) {
    // Dropped rather than faded to opacity 0: an invisible element still runs the
    // puff animation, which is exactly what the switch was turned off to stop.
    const smoke = (this._config.animate === false || heat <= 0.15) ? null
      : clamp(heat, 0, 0.75).toFixed(2);
    return `<div class="hero img" data-entity="${esc(this._config.cavity_temp)}">
      <img src="${esc(this._imgSrc(kind))}" alt="Weber Spirit" loading="lazy">
      <div class="ember" style="opacity:${(heat * 0.95).toFixed(2)}"></div>
      ${smoke === null ? '' : `<div class="smoke2" style="opacity:${smoke}"><i></i><i></i><i></i></div>`}
      <div class="read">
        <span class="v" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></span>
        ${target === null ? '' : `<span class="t">${esc(this._t.target)} ${Math.round(target)} ${esc(this._config.unit)}</span>`}
      </div>
    </div>`;
  }

  _heroCompact(cavity, target, color, pct, heat) {
    return `<div class="hero compact" data-entity="${esc(this._config.cavity_temp)}">
      <div>
        <div class="big sm" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
        <div class="sub"><span>${esc(this._t.cavity)}</span>${target === null ? '' : `<span>${esc(this._t.target)} ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
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

  /** Gauge on the left, artwork on the right, readings placed over the cook box. */
  _heroThermo(cavity, target, color, pct) {
    const c = this._config;
    const L = { ...THERMO_LAYOUT, ...(c.layout || {}) };
    const glow = glowColor(cavity, c);
    const lit = cavity === null ? 0 : clamp((cavity - 15) / 60, 0.18, 1);
    const probe = (c.probes || [])[0];
    const pt = numState(this._hass, probe?.temp);
    const ptgt = numState(this._hass, probe?.target);

    // Both halves can be switched off; with neither one, fall back to the plain
    // reading so the card never renders as an empty box.
    const gauge = c.show_gauge !== false;
    const art = c.show_artwork !== false;
    if (!gauge && !art) return this._heroType(cavity, target, color, pct);
    const cols = gauge && art ? `${L.ring_w}% 1fr` : '1fr';

    const probeChip = (!probe || c.show_probe_overlay === false) ? '' : `
      <div class="tProbe" style="left:${L.probe_x}%;top:${L.probe_y}%;font-size:${L.probe_size}%">
        <span class="lbl">${esc(probe.name || this._t.probe)}</span>
        <span class="val" style="color:${tempColor(pt)}">${pt === null ? '--' : Math.round(pt)}<i>${esc(this._config.unit)}</i></span>
        ${ptgt === null ? '' : `<span class="tgt">${esc(this._t.target)} ${Math.round(ptgt)}${esc(this._config.unit)}</span>`}
      </div>`;

    const artHtml = !art ? '' : `
      <div class="tArt">
        <div class="tArtInner" style="width:${L.img_scale}%">
          <img src="${esc(this._imgSrc(c.artwork))}" alt="Weber Spirit" loading="lazy">
          ${c.show_glow === false ? '' : `<div class="tGlow" style="
            left:${L.glow_x}%; top:${L.glow_y}%;
            width:${L.glow_w}%; height:${L.glow_h}%;
            filter: blur(${L.glow_blur}px);
            opacity:${lit.toFixed(2)};
            background: radial-gradient(ellipse at center, ${glow} 0%, ${glow}00 70%);"></div>`}
          <div class="tCavity" style="left:${L.cavity_x}%;top:${L.cavity_y}%;font-size:${L.cavity_size}%">
            <span class="val" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<i>${esc(c.unit)}</i></span>
            ${target === null ? '' : `<span class="tgt">${esc(this._t.target)} ${Math.round(target)}${esc(c.unit)}</span>`}
          </div>
          ${probeChip}
        </div>
      </div>`;

    return `<div class="hero thermo" data-entity="${esc(c.cavity_temp)}"
                 style="grid-template-columns:${cols}">
      ${gauge ? `<div class="tGauge">${this._gaugeSvg(cavity, target, color, pct)}</div>` : ''}
      ${artHtml}
    </div>`;
  }

  /** Shared 270° gauge body, used by the ring and thermo variants. */
  _gaugeSvg(cavity, target, color, pct) {
    const ARC = 367;
    const p = pct === null ? 0 : pct;
    return `<svg viewBox="0 0 200 200" role="img" aria-label="Wskaźnik temperatury komory">
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
      <text class="ringLbl" x="100" y="122" text-anchor="middle">${esc(this._config.unit)} ${esc(this._t.inCavity)}</text>
      ${target === null ? '' : `<text class="ringTgt" x="100" y="146" text-anchor="middle">${esc(this._t.target)} ${Math.round(target)}${esc(this._config.unit)}</text>`}
    </svg>`;
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
        <text class="ringLbl" x="100" y="122" text-anchor="middle">${esc(this._config.unit)} ${esc(this._t.inCavity)}</text>
        ${target === null ? '' : `<text class="ringTgt" x="100" y="146" text-anchor="middle">${esc(this._t.target)} ${Math.round(target)}${esc(this._config.unit)}</text>`}
      </svg>
    </div>`;
  }

  _heroType(cavity, target, color, pct) {
    return `<div class="hero type" data-entity="${esc(this._config.cavity_temp)}">
      <div class="big" style="color:${color}">${cavity === null ? '--' : Math.round(cavity)}<sup>${esc(this._config.unit)}</sup></div>
      <div class="sub"><span>${esc(this._t.cavity)}</span>${target === null ? '' : `<span>${esc(this._t.target)} ${Math.round(target)} ${esc(this._config.unit)}</span>`}</div>
      ${this._numTrack(pct, color)}
    </div>`;
  }

  _chips(battery) {
    const c = this._config;
    const chip = (on, icon, label, entity) => (on === null ? ''
      : `<span class="chip ${on ? 'on' : 'off'}" data-entity="${esc(entity)}" title="${esc(label)}"><ha-icon icon="${icon}"></ha-icon></span>`);
    const parts = [
      chip(isOn(this._hass, c.wifi), 'mdi:wifi', this._t.wifi, c.wifi),
      chip(isOn(this._hass, c.cloud), 'mdi:cloud-outline', this._t.cloud, c.cloud),
      chip(isOn(this._hass, c.bluetooth), 'mdi:bluetooth', this._t.bluetooth, c.bluetooth),
    ];
    if (battery !== null) {
      const icon = battery > 90 ? 'mdi:battery'
        : battery > 10 ? `mdi:battery-${Math.round(battery / 10) * 10}` : 'mdi:battery-alert';
      parts.push(`<span class="chip batt ${battery <= 15 ? 'low' : ''}" data-entity="${esc(c.battery)}" title="${esc(this._t.battery)}"><ha-icon icon="${icon}"></ha-icon><b>${Math.round(battery)}%</b></span>`);
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
          <span class="prname"><ha-icon icon="mdi:thermometer-probe"></ha-icon>${esc(p.name || `${this._t.probe} ${i + 1}`)}</span>
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
      /* Only the artwork look has empty space above the grill for smoke to rise
         into; in thermo the image fills its box from the top, so puffs would sit
         on the lit lid, under the readout. Hence the switch is offered there only. */
      .smoke2 { position: absolute; left: 40%; top: 0; width: 20%; height: 26%;
                pointer-events: none; transition: opacity .8s ease; }
      /* Lighter and larger than the first cut: the puffs sit over the lid, which is
         black in both artworks, and at 9px/#93a0b3 they were hard to make out. */
      .smoke2 i { position: absolute; bottom: 0; width: 11px; height: 11px; border-radius: 50%;
                  background: #c3ccd8; filter: blur(1px);
                  opacity: 0; animation: wgPuff 4.5s ease-in-out infinite; }
      .smoke2 i:nth-child(1) { left: 12%; }
      .smoke2 i:nth-child(2) { left: 45%; animation-delay: -1.5s; }
      .smoke2 i:nth-child(3) { left: 74%; animation-delay: -3s; }
      /* The rise is a percentage of the smoke box, not a fixed 46px, so the puffs
         stay inside the artwork whether the box is the tall one of the artwork
         look or the strip between the lid and the card header in thermo. */
      @keyframes wgPuff { 0% { bottom: 0; transform: scale(.7); opacity: 0; }
                          35% { opacity: .62; } 100% { bottom: calc(100% - 14px); transform: scale(1.5); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .smoke2 i { animation: none; } }

      .hero.compact { display: grid; grid-template-columns: 1fr 46%; gap: 10px; align-items: center; }
      .hero.compact .art { position: relative; }
      .hero.compact .art img { width: 100%; height: auto; display: block; }

      /* Thermo: gauge left, artwork right, readings pinned over the cook box.
         Every position comes from the layout option so it is tunable from YAML. */
      .hero.thermo { display: grid; gap: 8px; align-items: center; }
      .hero.thermo .tGauge svg { width: 100%; height: auto; display: block; }
      .hero.thermo .tArt { display: flex; justify-content: center; }
      .hero.thermo .tArtInner { position: relative; container-type: inline-size; }
      .hero.thermo img { width: 100%; height: auto; display: block; }
      .tGlow { position: absolute; transform: translate(-50%, -50%); border-radius: 50%;
               pointer-events: none; mix-blend-mode: screen;
               transition: opacity .8s ease, background .8s ease; }
      .tCavity, .tProbe { position: absolute; transform: translate(-50%, -50%);
                          pointer-events: none; text-align: center; line-height: 1.05;
                          text-shadow: 0 1px 4px rgba(0,0,0,.75); }
      .tCavity .val { display: block; font-size: clamp(20px, 15cqw, 40px); font-weight: 700;
                      letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .tCavity .val i { font-size: .45em; font-style: normal; font-weight: 600; }
      .tCavity .tgt { display: block; font-size: clamp(9px, 5cqw, 12px); color: #eef2f8;
                      opacity: .95; margin-top: 2px; white-space: nowrap; }
      .tProbe { background: rgba(12,16,22,.78); border-radius: 9px; padding: 4px 8px;
                backdrop-filter: blur(2px); text-shadow: none; white-space: nowrap; }
      .tProbe .lbl { display: block; font-size: clamp(8px, 4cqw, 10px); color: #9aa3b2; }
      .tProbe .val { display: block; font-size: clamp(13px, 8cqw, 20px); font-weight: 650;
                     font-variant-numeric: tabular-nums; }
      .tProbe .val i { font-size: .5em; font-style: normal; }
      .tProbe .tgt { display: block; font-size: clamp(8px, 4cqw, 10px); color: #9aa3b2; }

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


const probeLabels = (T) => ({ name: T.ed.pName, temp: T.ed.pTemp, target: T.ed.pTarget });
const PROBE_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  {
    name: '', type: 'grid', schema: [
      { name: 'temp', selector: { entity: { domain: ['sensor', 'number', 'input_number'] } } },
      { name: 'target', selector: { entity: { domain: ['sensor', 'number', 'input_number'] } } },
    ],
  },
];

/** Slider ranges for the thermo layout; also drives the editor's slider list. */
const LAYOUT_RANGES = {
  ring_w: [25, 65, '%'], img_scale: [60, 130, '%'],
  cavity_x: [0, 100, '%'], cavity_y: [0, 100, '%'], cavity_size: [50, 180, '%'],
  probe_x: [0, 130, '%'], probe_y: [0, 100, '%'], probe_size: [50, 180, '%'],
  glow_x: [0, 100, '%'], glow_y: [0, 100, '%'], glow_w: [10, 120, '%'],
  glow_h: [4, 60, '%'], glow_blur: [0, 40, 'px'],
};

const layoutSchema = () => Object.entries(LAYOUT_RANGES).map(([name, [min, max, unit]]) => ({
  name,
  selector: { number: { min, max, step: 1, mode: 'slider', unit_of_measurement: unit } },
}));

const editorSchema = (T, cfg = {}) => [
  {
    name: '', type: 'grid', schema: [
      { name: 'name', selector: { text: {} } },
      {
        name: 'language',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'auto', label: T.ed.langAuto },
              { value: 'pl', label: 'Polski' },
              { value: 'en', label: 'English' },
            ],
          },
        },
      },
    ],
  },
  { name: 'title', selector: { text: {} } },
  {
    name: 'variant',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'thermo', label: T.ed.vThermo },
          { value: 'artwork', label: T.ed.vArtwork },
          { value: 'compact', label: T.ed.vCompact },
          { value: 'ring', label: T.ed.vRing },
          { value: 'type', label: T.ed.vType },
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
          { value: 'photo', label: T.ed.aPhoto },
          { value: 'vector', label: T.ed.aVector },
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
    // show_gauge / show_artwork are deliberately absent: switching either half of
    // the thermo look off is what the other looks already are, so the toggles only
    // duplicated the Look dropdown. Both still work from YAML.
    name: '', type: 'grid', schema: [
      { name: 'show_glow', selector: { boolean: {} } },
      { name: 'show_probe_overlay', selector: { boolean: {} } },
      { name: 'show_status', selector: { boolean: {} } },
      // Smoke exists in the artwork look only, so the switch is offered there
      // only — a control that cannot change anything is worse than none.
      ...(cfg.variant === 'artwork' ? [{ name: 'animate', selector: { boolean: {} } }] : []),
      { name: 'alarm_minutes', selector: { number: { min: 0, max: 720, mode: 'box' } } },
    ],
  },
  {
    // Empty name keeps these flat in the config; `layout` below is genuinely
    // nested, which is why that one carries its name.
    name: '', type: 'expandable', title: T.ed.glowSection,
    schema: [
      {
        name: '', type: 'grid', schema: [
          { name: 'glow_cold', selector: { color_rgb: {} } },
          { name: 'glow_warm', selector: { color_rgb: {} } },
          { name: 'glow_hot', selector: { color_rgb: {} } },
        ],
      },
      {
        name: '', type: 'grid', schema: [
          { name: 'glow_warm_at', selector: { number: { min: 30, max: 200, step: 5, mode: 'slider' } } },
          { name: 'glow_hot_at', selector: { number: { min: 60, max: 350, step: 5, mode: 'slider' } } },
        ],
      },
    ],
  },
  {
    name: 'layout', type: 'expandable', title: T.ed.layoutSection,
    schema: layoutSchema(),
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

  get _t() { return t(this._config, this._hass); }

  setConfig(config) {
    this._config = { ...config };
    // Same migration as the card, so an old `variant: photo` shows up as the
    // artwork look with the right image instead of an empty dropdown.
    const legacy = LEGACY_IMAGE_VARIANTS[this._config.variant];
    if (legacy) {
      if (this._config.artwork === undefined) this._config.artwork = legacy;
      this._config.variant = 'artwork';
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (this._built) this._render();
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
          .probeRow { border: 1px solid var(--divider-color, #ccc); border-radius: 8px;
                      padding: 8px 10px 4px; margin-bottom: 8px; }
          .probeHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
          .probeHead b { font-size: 13px; }
          .probeHead button { border: none; background: none; cursor: pointer; font-size: 14px;
                              color: var(--secondary-text-color); padding: 2px 4px; }
          .probeHead button:hover { color: var(--error-color, #db4437); }
          .add { border: none; border-radius: 4px; padding: 7px 10px; cursor: pointer;
                 background: var(--secondary-background-color); color: var(--primary-text-color); }
          .hint { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 6px; }
          .tools { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
          .tools button { border: none; border-radius: 4px; padding: 7px 11px; cursor: pointer;
                          background: var(--secondary-background-color); color: var(--primary-text-color);
                          font-size: 13px; }
          .tools button:hover { filter: brightness(1.2); }
        </style>
        <div id="form"></div>
        <div class="sec">
          <h4 id="l-quick"></h4>
          <div class="hint" id="l-quickHint"></div>
          <div class="tools">
            <button id="center-all"></button>
            <button id="center-cavity"></button>
            <button id="center-probe"></button>
            <button id="center-glow"></button>
            <button id="reset-layout"></button>
            <button id="reset-glow"></button>
          </div>
        </div>
        <div class="sec">
          <h4 id="l-probes"></h4>
          <div class="hint" id="l-probesHint"></div>
          <div id="probes"></div>
          <button class="add" id="add"></button>
        </div>`;
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => this._t.ed[s.name] || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._config = { ...this._config, ...ev.detail.value };
        this._emit();
      });
      this.shadowRoot.getElementById('form').appendChild(this._form);
      this.shadowRoot.getElementById('add').addEventListener('click', () => {
        const probes = [...(this._config.probes || [])];
        probes.push({ name: `${this._t.probe} ${probes.length + 1}`, temp: '', target: '' });
        this._config = { ...this._config, probes };
        this._emit();
        this._renderProbes();
      });

      const patchLayout = (patch) => {
        this._config = {
          ...this._config,
          layout: { ...THERMO_LAYOUT, ...(this._config.layout || {}), ...patch },
        };
        this._emit();
        this._render();
      };
      const B = (id, fn) => this.shadowRoot.getElementById(id).addEventListener('click', fn);
      B('center-all', () => patchLayout({ cavity_x: 50, probe_x: 50, glow_x: 50 }));
      B('center-cavity', () => patchLayout({ cavity_x: 50 }));
      B('center-probe', () => patchLayout({ probe_x: 50 }));
      B('center-glow', () => patchLayout({ glow_x: 50 }));
      B('reset-layout', () => {
        const cfg = { ...this._config };
        delete cfg.layout;                     // fall back to the card's defaults
        this._config = cfg;
        this._emit();
        this._render();
      });
      B('reset-glow', () => {
        this._config = { ...this._config, ...GLOW_DEFAULTS };
        this._emit();
        this._render();
      });
      this._built = true;
    }
    this._applyEditorStrings();
    this._form.schema = editorSchema(this._t, this._config);
    // Show the effective values, not blanks: every control starts where the card
    // starts. DEFAULTS matters most for the switches — ha-selector-boolean draws
    // `undefined` as off, so an omitted `show_status: true` used to render as a
    // switch that said "off" while the icons were on screen, and toggling it on
    // changed nothing because it already was.
    this._form.data = {
      ...DEFAULTS,
      ...this._config,
      // color_rgb hands its value to rgb2hex(), which indexes it as [r,g,b]; a
      // hex string there yields "#NaNNaNNaN" and <input type=color> falls back to
      // black. Hence hex in the config, triplets in the form.
      ...glowRgbTriplets(this._config),
      layout: { ...THERMO_LAYOUT, ...(this._config.layout || {}) },
    };
    if (this._hass) this._form.hass = this._hass;
    this._renderProbes();
  }

  /**
   * One ha-form per probe, so its temperature and target get real entity
   * pickers instead of a free-text field the user has to type an id into.
   */
  /** Fill the editor's static chrome from the string table. */
  _applyEditorStrings() {
    const T = this._t.ed;
    const set = (id, txt) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.textContent = txt;
    };
    set('l-quick', T.quick); set('l-quickHint', T.quickHint);
    set('l-probes', T.probes); set('l-probesHint', T.probesHint);
    set('center-all', T.centerAll); set('center-cavity', T.centerCavity);
    set('center-probe', T.centerProbe); set('center-glow', T.centerGlow);
    set('reset-layout', T.resetLayout); set('reset-glow', T.resetGlow);
    set('add', T.addProbe);
  }

  _renderProbes() {
    const host = this.shadowRoot?.getElementById('probes');
    if (!host) return;
    const probes = this._config.probes || [];
    host.innerHTML = '';

    probes.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'probeRow';

      const head = document.createElement('div');
      head.className = 'probeHead';
      head.innerHTML = `<b>${esc(p.name || `${this._t.probe} ${i + 1}`)}</b>`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = this._t.ed.del;
      del.addEventListener('click', () => {
        this._config = { ...this._config, probes: probes.filter((_, n) => n !== i) };
        this._emit();
        this._renderProbes();
      });
      head.appendChild(del);
      row.appendChild(head);

      const form = document.createElement('ha-form');
      form.hass = this._hass;
      form.data = { name: p.name || '', temp: p.temp || '', target: p.target || '' };
      form.schema = PROBE_SCHEMA;
      const PL = probeLabels(this._t);
      form.computeLabel = (s) => PL[s.name] || s.name;
      form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const next = [...(this._config.probes || [])];
        next[i] = { ...next[i], ...ev.detail.value };
        this._config = { ...this._config, probes: next };
        this._emit();
        head.querySelector('b').textContent = next[i].name || `Sonda ${i + 1}`;
      });
      row.appendChild(form);
      host.appendChild(row);
    });
  }
}

customElements.define('weber-grill-card', WeberGrillCard);
customElements.define('weber-grill-card-editor', WeberGrillCardEditor);

// Exposed so the preview page can start its sliders from the card's own defaults
// instead of keeping a second copy of the numbers that would drift.
window.WEBER_THERMO_LAYOUT = { ...THERMO_LAYOUT };

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
