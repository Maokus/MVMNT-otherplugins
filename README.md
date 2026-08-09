# MVMNT plugin collection

Each top-level plugin folder is an independent SDK 2 project. Dependencies point at the sibling
`MVMNT` checkout so this collection follows the current SDK and plugin tooling during development.

Run the complete workflow from the plugin you are changing:

```sh
cd midipack1
npm install
npm run check
npm run dev
```

`npm run dev` starts the development plugin server and watches that plugin's source, manifest, and
assets. Connect to it from **Scene Settings → Debug** in a development build of MVMNT. Use
`npm run build` to write the distributable `.mvmnt-plugin` archive under that plugin's `dist/`
folder, and `npm run typecheck` when only a fast TypeScript pass is needed.

The projects also contain a small local `sdk-compat.ts` module for their class-based renderers. It
adapts those existing implementations to the current `definePluginElement()` lifecycle without
reintroducing SDK-level compatibility APIs; capabilities remain declared only in `plugin.json`.
