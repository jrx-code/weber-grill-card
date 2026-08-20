# Weber Grill Card

[![hacs][hacs-badge]][hacs-url] [![release][release-badge]][release-url]

Karta Lovelace do grilla Weber: temperatura komory, sondy, łączność i alarmy
sesji pieczenia. Powstała dla encji publikowanych przez
[weber-bridge](https://fg.iwanus.eu/jiwanus/grill-weber), ale każda encja jest
konfigurowalna — zadziała z dowolnym źródłem temperatury.

🇬🇧 [English version of this file](README.md)

![Weber Grill Card](docs/preview-thermo.png)

## Co potrafi

- **Termostat obok grilla** — temperatura komory na pierścieniu 270° i drugi raz
  na pokrywie grilla, czyli tam, gdzie się jej szuka wzrokiem.
- **Komora świeci** na niebiesko gdy zimna, żółto przy rozgrzewaniu, czerwono gdy
  gorąca. Trzy kolory i oba progi są edytowalne.
- **Prawdziwa grafika produktowa** — render fotograficzny albo płaski wektor,
  przełączalne.
- **Sondy** z celem i postępem; sonda po osiągnięciu celu jest oznaczana.
- **Pasek alarmu** z encji alarmu mostka, chowa się sam po zadanym czasie.
- **Ikony stanu** — WiFi, chmura, Bluetooth, bateria; każda otwiera szczegóły.
- **Grill niedostępny** — karta przygasa i mówi to wprost, zamiast pokazywać
  ostatnią znaną liczbę jak aktualną.
- **Pięć wyglądów**, różnica to jedna opcja: `thermo`, `artwork`, `compact`,
  `ring`, `type` — a pod każdym z nich zdjęcie albo wektor.
- **Polski i angielski**, zgodnie z językiem Home Assistant albo ustawiony
  sztywno per karta.

## Instalacja

### HACS

1. HACS → menu z trzema kropkami → **Własne repozytoria**
2. Repozytorium `https://github.com/jrx-code/weber-grill-card`, typ **Dashboard**
3. Zainstaluj i przeładuj przeglądarkę.

HACS pobiera cały katalog `dist`, więc grafika przyjeżdża razem z kartą.

### Ręcznie

Skopiuj zawartość `dist/` (plik `.js` **oraz** oba `.png`) do
`/config/www/weber-grill-card/`, a potem dodaj zasób Lovelace
`/local/weber-grill-card/weber-grill-card.js` typu **module**.

W obu przypadkach karta sama znajdzie swoją grafikę — ścieżka wylicza się z
miejsca, z którego załadował się skrypt, więc `/hacsfiles/…` i `/local/…`
działają bez konfiguracji. Opcji `image_base` użyj tylko wtedy, gdy rozdzielisz
pliki.

## Konfiguracja

Wszystko ustawia się w GUI: pickery encji (również osobny na każdą sondę),
wygląd, przełączniki, kolory poświaty z progami, suwak na każdą współrzędną
rozmieszczenia oraz przyciski wyśrodkowania i resetu. Poniższy YAML to dokładnie
to, co zapisuje edytor.

```yaml
type: custom:weber-grill-card
name: Spirit EX325
variant: thermo          # artwork | compact | ring | type
artwork: photo           # photo | vector
language: auto           # auto | pl | en
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

### Opcje

| opcja | typ | domyślnie | znaczenie |
|---|---|---|---|
| `name` | tekst | `Grill` | podpis nad grafiką |
| `title` | tekst | — | nagłówek karty (pomiń, by go nie było) |
| `variant` | tekst | `thermo` | wygląd; zdjęcie/wektor to `artwork`, nie wygląd |
| `artwork` | tekst | `photo` | `photo` albo `vector` |
| `language` | tekst | `auto` | `auto` idzie za Home Assistant |
| `cavity_temp` / `cavity_target` | encja | — | temperatura komory i cel |
| `battery` | encja | — | poziom baterii |
| `wifi` / `cloud` / `bluetooth` | encja | — | ikony łączności |
| `last_alarm` | encja | — | encja alarmu (stan = tytuł, atrybuty `text`, `when`) |
| `probes` | lista | `[]` | `{name, temp, target}` na sondę |
| `show_gauge` / `show_artwork` | tak/nie | `true` | połówki wyglądu `thermo` |
| `show_glow` / `show_probe_overlay` | tak/nie | `true` | poświata, sonda na grafice |
| `show_status` | tak/nie | `true` | ikony stanu |
| `animate` | tak/nie | `true` | animacja dymu |
| `alarm_minutes` | liczba | `30` | ukryj pasek alarmu po N minutach (0 = nigdy) |
| `glow_cold` / `glow_warm` / `glow_hot` | kolor | niebieski / żółty / czerwony | kolory poświaty |
| `glow_warm_at` / `glow_hot_at` | liczba | `90` / `200` | progi °C między nimi |
| `layout` | obiekt | patrz niżej | rozmieszczenie, w % grafiki |
| `unit` | tekst | `°C` | wyświetlana jednostka |
| `image_base` | tekst | wyliczana | gdzie leży grafika |

### `layout`

Wszystkie wartości to procenty pola grafiki, więc trzymają się jej niezależnie od
szerokości karty. Domyślne zmierzono na grafice: pokrywa zajmuje x 22–78%,
y 0–25%, a szczelina pokrywy wypada na 26%.

| klucz | domyślnie | klucz | domyślnie |
|---|---|---|---|
| `ring_w` | 44 | `img_scale` | 100 |
| `cavity_x` | 58 | `cavity_y` | 13 |
| `cavity_size` | 85 | `probe_x` | 87 |
| `probe_y` | 46 | `probe_size` | 100 |
| `glow_x` | 50 | `glow_y` | 24 |
| `glow_w` | 58 | `glow_h` | 26 |
| `glow_blur` | 16 | | |

## Podziękowania

Grafika: render produktowy i wektor Weber Spirit EX-335, dostarczone przez
użytkownika. Weber i Spirit są znakami towarowymi Weber-Stephen Products LLC;
ten projekt nie jest z nimi powiązany ani przez nich firmowany.

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://github.com/hacs/integration
[release-badge]: https://img.shields.io/github/v/release/jrx-code/weber-grill-card
[release-url]: https://github.com/jrx-code/weber-grill-card/releases
