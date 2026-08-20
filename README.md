# Weber Grill Card

Lovelace card for a Weber grill: an SVG gas grill whose lid carries the cavity
temperature, probe rows with progress bars underneath, and a banner for
cook-session alerts.

Built for the entities published by [weber-bridge](https://fg.iwanus.eu/jiwanus/grill-weber),
but every entity is configurable — any temperature sensor works.

## Features

- **Grill drawn inline (SVG)** — no external images; scales, follows the theme,
  and the cavity reading sits on the lid where you'd look for it.
- **Colour follows heat** — the reading interpolates cold blue → ember red, so a
  glance tells you the state before you read the number.
- **Smoke above the lid** once the cavity is genuinely hot (not on a cold grill),
  and it respects `prefers-reduced-motion`.
- **Probes** with target and progress bar; a probe at or past its target gets a
  green outline.
- **Alert banner** fed by the bridge's alert sensor, auto-hiding after
  `alarm_minutes`.
- **Status chips** — WiFi / cloud / Bluetooth / battery, each opening more-info.
- **Offline handling** — the card dims and says so, rather than presenting the
  last known number as if it were current.
- **GUI editor** on native `ha-form` entity pickers, and **auto-detection**: the
  card picker pre-fills every field from existing grill entities, so it works the
  moment you select it.

## Install

### HACS (recommended)

1. HACS → three-dot menu → **Custom repositories**
2. Repository `https://github.com/jrx-code/weber-grill-card`, type **Dashboard**
3. Install, then reload the browser.

HACS downloads the whole `dist` directory, so the artwork comes with the card and
the resource is registered automatically.

### Manual

1. Copy the contents of `dist/` (the `.js` **and** both `.png` files) to
   `/config/www/weber-grill-card/`.
2. Add a Lovelace resource: `/local/weber-grill-card/weber-grill-card.js`, type
   **module**.

Either way the card finds its artwork on its own: the image base is derived from
where the script itself was loaded from, so `/hacsfiles/…` and `/local/…` both
work with no configuration. Override with `image_base` only if you move the files
apart.

Then add the card from the GUI gallery — it appears as **Weber Grill Card** with a
live preview.

## Configuration

Everything is optional except a temperature entity; missing entities simply hide
their part of the card.

| option | type | default | meaning |
|---|---|---|---|
| `name` | string | `Grill` | label above the grill |
| `title` | string | — | card header (omit for none) |
| `cavity_temp` | entity | — | cavity temperature |
| `cavity_target` | entity | — | cavity target |
| `battery` | entity | — | battery percentage |
| `wifi` / `cloud` / `bluetooth` | entity | — | connectivity chips |
| `last_alarm` | entity | — | alert sensor (state = title, attrs `text`, `when`) |
| `probes` | list | `[]` | `{name, temp, target}` per probe |
| `show_image` | bool | `true` | grill graphic vs. plain big readout |
| `show_status` | bool | `true` | status chips |
| `animate` | bool | `true` | smoke animation |
| `alarm_minutes` | number | `30` | hide the alert banner after N minutes (0 = never) |
| `unit` | string | `°C` | displayed unit |

```yaml
type: custom:weber-grill-card
name: Spirit EX325
cavity_temp: sensor.spirit_ex325_temperatura_komory
cavity_target: sensor.spirit_ex325_cel_komory
battery: sensor.spirit_ex325_bateria
wifi: binary_sensor.spirit_ex325_wifi
cloud: binary_sensor.spirit_ex325_chmura
bluetooth: binary_sensor.spirit_ex325_bluetooth
last_alarm: sensor.spirit_ex325_ostatni_alarm
probes:
  - name: Sonda 1
    temp: sensor.spirit_ex325_sonda_1
    target: sensor.spirit_ex325_sonda_1_cel
```

## Preview page

`poc/grill-karta.html` renders the production card file in four states (cold,
heating, alert, offline) with live sliders. Deployed to
`/local/panel-salon-sekcje/grill-karta.html` and listed in that directory's index.

## Prior art

[`ha-bbq-card`](https://github.com/wpbezemer/ha-bbq-card) (HACS) covers similar
ground with a round gauge and preset targets, but drives its thresholds through
`input_number` / `input_boolean` helpers and has no notion of the bridge's alert
entity — hence this card rather than a fork.
