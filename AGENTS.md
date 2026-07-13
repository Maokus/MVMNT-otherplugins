# Plugin authoring brief

Use this file for a concise, stable contract when creating or changing a plugin under `src/plugins/`.

1. Read `docs/plugin-api-v1.md` and import only from `@mvmnt/plugin-sdk`; do not use internal host aliases.
2. Declare the capabilities you need with `getRequiredPluginApi`, and return its fallback if unavailable.
3. Derive animation purely from `targetTime` and timeline event data. Do not store frame-to-frame animation state.
4. **Always use the stable layout rectangle pattern.** Return one fixed, transparent `Rectangle` as the only object with layout participation. Call `.setLayoutParticipation('exclude')` on every other object—backgrounds, labels, media, effects, and animated content. Size the anchor for the maximum configured visual extent, never the current animation frame.
5. Put user-facing configuration in `getConfigSchema()`. Use `visibleWhen` to hide dependent controls, such as manual palette colours until the manual palette is selected.
6. Use `prop.font` with `parseFontSelection` and `ensureFontLoaded` for configurable text fonts.

Before handoff run `npm run test`, `npm run build`, and `npm run compile`. `src/plugins/*` is ignored by default, so verify the intended files directly as well as with Git status.
