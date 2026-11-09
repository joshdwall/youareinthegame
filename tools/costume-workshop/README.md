# Local costume workshop

Source-controlled local tooling for the shared costume bundle contract. No paid APIs are enabled.

Run `node workshop.mjs doctor`, `prompts`, `run`, `export`, `ingest` or `batch`. Place machine-specific engine/model paths in ignored `config.local.json`, or set `COSTUME_GENERATOR_EXE` and `COSTUME_GENERATOR_MODEL`. Ollama supplies optional suggestions; a separate local diffusion runtime creates artwork.

Exports include `costume.bundle.json` and `upload-manifest.json`. In Cambio, import the bundle, upload its listed PNGs, preview, then save a draft. Artwork needs visual review.

Full workflow and operator gates: [knowledge-hub plan](https://github.com/joshdwall/knowledge-hub/blob/costume/scalable-workflow-plan/plans/site-hub/YouAreInTheGame-Scalable-Costume-Workflow-Plan.md).

Stable Diffusion runtime: https://github.com/leejet/stable-diffusion.cpp (MIT). Model: https://huggingface.co/second-state/stable-diffusion-v1-5-GGUF (CreativeML Open RAIL-M). Downloaded binaries, models, job data and generated candidates stay outside git.

### Publish and share a character

Import the Workshop bundle and upload its listed assets in production Cambio.
Review the costume in Cambio, save it, then enable Live in the character list
when publication is requested. Use Direct Link instead for a public review
outside the regular rotation. The public registry populates automatically from
the saved list. New costume uploads do not need a developer deployment or URL.

Share the production URL with the bare alphanumeric character name, such as
`https://youareinthegame.com/?showgirl`. For an ID with hyphens, omit the hyphens
in the URL. Open the link and trigger two rounds to verify the selected costume.
