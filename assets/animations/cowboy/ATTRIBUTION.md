# Placeholder art candidates for YAITG cowboy MVP

Downloaded 2026-10-30 to `/workspace/yaitg-placeholders/`. Not committed to the site repo yet.

## Recommended set (separate pieces, recolorable)

| Piece | File | Source URL | License | Notes |
|-------|------|------------|---------|-------|
| Hat | `game-icons/western-hat.svg` | https://game-icons.net/1x1/delapouite/western-hat.html | CC BY 3.0 (Delapouite / game-icons.net) | Best fit: single hat silhouette, scalable, recolor to muted blue-grey + dark outline |
| Mustache | `game-icons/mustache.svg` | https://game-icons.net/1x1/delapouite/mustache.html | CC BY 3.0 (Delapouite) | Flat mustache; may include tiny hat in glyph — crop/edit for bill-only |
| Pistol (x2, mirror) | `game-icons/revolver.svg` | https://game-icons.net/1x1/delapouite/revolver.html | CC BY 3.0 (Delapouite) | One revolver; flip for left/right hand |

Attribution required for CC BY 3.0: credit Delapouite / game-icons.net in site credits or README.

## Alternate / combined

| Piece | File | Source URL | License | Notes |
|-------|------|------------|---------|-------|
| Cowboy hat face (emoji) | `openmoji/cowboy-hat-face.svg` | https://github.com/hfg-gmuend/openmoji (1F920) | CC BY-SA 4.0 | Full face+hat; not separate props — useful style reference only |
| Twemoji cowboy | `openmoji/twemoji-cowboy.svg` | https://github.com/twitter/twemoji (1f920) | CC BY 4.0 | Same caveat |
| OpenMoji mustache-person | `openmoji/mustache.svg` | OpenMoji 1F9D4-200D-2642-FE0F | CC BY-SA 4.0 | Bearded face, not a mustache prop |

## Remote candidates not downloaded (CDN 404 / page scrape)

| Name | URL | License | Notes |
|------|-----|---------|-------|
| Cowboy Hat With Mustache Silhouette | https://svgitem.com/svg/cowboy-hat-with-mustache-silhouette | CC0 1.0 | Combined hat+mustache; download via site UI |
| Western Cowboy Hat and Revolver | https://svgitem.com/svg/western-cowboy-hat-and-revolver | CC0 1.0 | Combined composition |
| Comic Cowboy With Two Guns | https://opensvg.org/2149/comic-cowboy-with-two-guns/ | Public Domain (OpenClipart) | Full character; extract hat/guns manually |

## Style match vs live character

Live character (`img/mushroom-platypus.png`): posterized flat-shaded cartoon, dark outlines, muted blue/grey/tan on sage `#7ab5a0`.

- **Best placeholders for MVP:** game-icons SVGs — recolor fill to slate/navy, add 3–4px dark stroke, keep transparent BG. Closest to "flat + outline" without generating new art.
- **Generated-art option (later):** prompt a flat vector sticker of cowboy hat / mustache / revolver matching the platypus palette (sage, slate blue, tan, black outline, no gradients), export PNG @2x, replace placeholders. Keep license provenance in `assets/animations/cowboy/ATTRIBUTION.md`.

## Generated-art prompt sketch (optional)

```
Flat cartoon sticker icon, posterized, limited palette (slate blue #4a6a8a, muted grey #6b7c8a, tan #c4a882, black outline 4px), no gradients, transparent background, [cowboy hat | handlebar mustache | revolver pistol side view], matching mushroom-platypus game art style
```
