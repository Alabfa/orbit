# Bundled UI fonts

Arabic uses **Noto Sans Arabic** (Arabic subset). It includes
U+0686 (cheh) and U+06AF (gaf), plus their contextual joining forms. Readex Pro
does not contain these letters, so using it for Arabic caused device-specific
fallback fonts within Iraqi words.

**Readex Pro** is retained for Latin text and numbers through its Latin-only
subset. Both files are served locally; no Google Fonts request is needed at runtime.
The shared `--font-ui` stack in `styles.css` is used by screens and mini-games.

Google Fonts WOFF2 sources:

- Noto Sans Arabic: https://fonts.gstatic.com/s/notosansarabic/v33/nwpCtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlj4wv4r4xA.woff2
- Readex Pro: https://fonts.gstatic.com/s/readexpro/v27/SLXYc1bJ7HE5YDoGPuzj_dh8uc7wUy8ZQQyX2IwwZEw.woff2

Noto Sans Arabic is instantiated at weights 400, 500, and 600 using FontTools
`varLib.instancer.instantiateVariableFont(font, {'wght': weight})`. Static
instances avoid variable-weight rendering differences in WebKit. Glyph outlines,
character coverage, and Arabic shaping rules are retained. Readex Pro is unmodified.

Both fonts use the SIL Open Font License; the accompanying OFL files retain
their copyright notices and license terms.
