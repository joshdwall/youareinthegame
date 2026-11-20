# Costume and animation authoring standards

## Reuse and generation

Capture the public catalog once and run `node tools/costume-workshop/audit.mjs snapshot.json report.json`. An authenticated Cambio export is required to include private drafts. The audit is read-only. Its findings distinguish invalid records from legacy representations that need a deliberate migration.

Write one compact brief with character ID, reference, item operations, existing asset references, fit requirements, and review decisions. Agent Sands is recorded in `briefs/agent-sands.json`. Briefs are planning inputs. Executable recipes continue to use `costume.schema.json` and runtime bundles use the shared contracts.

Choose reuse, derive, or generate for each item. Reuse immutable asset versions and copy approved placement explicitly. A placement change alone must preserve the artwork fingerprint. Search the catalog before requesting more artwork. Mirrored boots can share a bitmap with separate placements. Joining garment pieces is justified when their seam must move as one unit.

Run `node workshop.mjs plan <recipe>` before generation. It checks all source/guide paths and generator availability and reports cached artwork, preparation jobs, and generation calls. `run` executes the same preflight before acquiring the generation lock. Missing inputs fail before any generation. Model integrity is still verified by the existing runner. Prompt preparation is deterministic and calls no model by default. Use `prompts <recipe> --suggestions` only when suggestions are wanted.

## Artwork normalization

Use the approved Mushroom Platypus illustration as the visual reference. Each bitmap contains a standalone front-facing accessory with the complete silhouette and transparent background after preparation. Preserve texture, outline weight, lighting, and proportions of approved adjacent pieces. Omit text, watermarks, scenery, wearers, human anatomy, and hidden rear surfaces. Garments fit the platypus silhouette and leave its face clear. The film still supplies costume cues and is not an uploadable sprite.

Current workshop exports assume a 512-square prepared image. Do not stretch arbitrary non-square inputs through that path. A future native-dimension exporter must preserve aspect ratio, source dimensions, pivot, and manifest dimensions together. Runtime contracts permit other dimensions, so 512-square is a workshop constraint rather than a global runtime rule.

Before accepting artwork, inspect transparency, edge contact/cropping, stray pixels, visible area, and composition on the rig. Numeric checks cannot certify likeness or garment fit. Generate one candidate for a missing piece, inspect it, and target the specific failed region for a revision. Automatic process retries are distinct from visual revisions. Keep visual revisions explicit and bounded.

## Placement and layers

Use `mushroom-platypus@1` and named attachments with explicit offsets, normalized object pivot, scale relative to character width, rotation, mirror flag, layer, and ordering. Runtime contracts own allowed fields and ranges. Preserve existing absolute/manual placements when reading legacy records. New authoring should have one authoritative placement representation. Never silently replace a manually approved position with a rig default.

Separate rear hair, backpieces, boots, and garment areas from foreground items according to the approved composition. Stormchaser's shirt currently uses behind-character at scale 0.62 on mouth. Deadbybong's boots use behind-character at scale 0.36 with opposite rotations and mirroring. These are reference-specific settings, not defaults for every costume.

## Actions and lifecycle

Use the existing action catalog and shared validation for action types, phases, origins, durations, counts, trajectories, and target behavior. Reuse choreography by behavior and preserve item IDs used to inherit Costume 1 actions into Costume 2. The runtime owns equip, idle, activation, exit, and reset lifecycle. Verify natural completion of spores, lighting returning to normal, and immediate next-click eligibility. Do not add costume-specific copies of lifecycle logic.

Inspect both primary and secondary costumes. Validate projectile origins at the actual prop muzzle or release point. Check animation at normal and small viewport sizes and in two consecutive rounds. Static rig fit alone cannot verify choreography or reset behavior.

## Bundle and publication

Use versioned assets with source hash, dimensions, bytes, pivot, and provenance. Run `compileBundle` before upload and verify uploaded hashes through Cambio. Reuse the existing importer and revision check. No alternate script should write a whole runtime catalog to install one costume.

Review the combined rig composition before enabling a direct link. Save and publish through production Cambio, then verify the character link and two rounds. Live rotation and direct-link visibility are separate saved settings. Runtime code releases use the repository's existing deployment workflow. Data-only costume updates do not require a site rebuild.

## Coverage and next implementation

The audit checks returned animations and variants, duplicate item IDs, source reuse, version references, placement authority, layers, named anchors, and action contracts. It does not download bitmap pixels, inspect private drafts, or prove browser lifecycle behavior. Existing image-budget, costume-contract, placement, and reset tests remain necessary.

Next automation should add pixel QA using the existing sharp dependency, native-dimension export, an authenticated catalog reader, and a single dry-run/import command that calls the existing Cambio validation. Implement those against the same contracts. Keep provider credentials out of briefs and reports.
