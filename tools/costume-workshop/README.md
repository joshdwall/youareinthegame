# Local costume workshop

Source-controlled local tooling for the shared costume bundle contract. No paid APIs are enabled.

Run `node workshop.mjs doctor`, `prompts`, `run`, `export`, `ingest` or `batch`. Place machine-specific engine/model paths in ignored `config.local.json`, or set `COSTUME_GENERATOR_EXE` and `COSTUME_GENERATOR_MODEL`. Ollama supplies optional suggestions; a separate local diffusion runtime creates artwork.

Exports include `costume.bundle.json` and `upload-manifest.json`. In Cambio, import the bundle, upload its listed PNGs, preview, then save a draft. Artwork needs visual review.

Full workflow and operator gates: [knowledge-hub plan](https://github.com/joshdwall/knowledge-hub/blob/costume/scalable-workflow-plan/plans/site-hub/YouAreInTheGame-Scalable-Costume-Workflow-Plan.md).

Stable Diffusion runtime: https://github.com/leejet/stable-diffusion.cpp (MIT). Model: https://huggingface.co/second-state/stable-diffusion-v1-5-GGUF (CreativeML Open RAIL-M). Downloaded binaries, models, job data and generated candidates stay outside git.
