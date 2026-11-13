# Documentation figure provenance

These are documentation illustrations, not live UI screenshots.

| File | Basis | Meaning |
|---|---|---|
| architecture.svg | Current Node/Python/frontend code | Shared collection and consumption path |
| energy-example.svg | Documented reference vector from model tests | Calculated example, not measured campus demand |
| thermal-model.svg | Thermal regression and its test vector | Model output, not temperature |
| grid-map-preview.svg | Bus coordinates and line edges in src/lib/grid.ts | Study topology, with all meter placements unverified |
| inverter-waveform.svg | Analytic sine/triangle example | Illustrative SPWM context, not a hardware trace |

The transformer picture in the README is public/models/transformer-exterior.png, an existing rendered project asset. The interactive model is in public/models/ and its React components are in src/components/three/.

The figures can be regenerated with `python scripts/build-doc-figures.py` using the standard library. Browser capture was unavailable for this update. Actual screenshots may be added later with their capture date and measured/simulated status preserved.
