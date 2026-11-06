# hexcite

Play at https://hexcite.jamesloper.com/.

Edit the app in `src/`. Install development dependencies with `npm install`.

- `npm run dev` (or `npm run serve`) starts Vite at http://localhost:5173. Source edits automatically update the browser.
- `npm run build` bundles the publishable PWA into `dist/`, with hashed assets.
- `npm run preview` serves the production build locally for checking before publication.
- `npm run deploy` builds and publishes the game to Cloudflare Workers Static Assets.
- `npm test` checks the game rules against the source.

Practice mode includes all 50 original boards, with converted placements, original inventories, scores, and starting players. Select any board from the title screen. Win to mark it cleared and advance; draws and losses offer a retry. Completion marks and the current match are saved locally. Practice uses the web game's computer opponent.

The native records and geometry tables are in `reference/practice-mode/configurations.json`. Run `node tools/convert-practice.mjs` to regenerate `src/practice-boards.json`; the ROM is not required to build or play. `tools/extract-practice.py` can regenerate the native records from the supported ROM when supplied its path and an output JSON path.

Static icons and the install manifest live in `src/public/` and are copied unchanged during builds. Publish the contents of `dist/` to a static HTTPS host. Generated files in `dist/` are excluded from Git.

Cloudflare deployment uses `wrangler.jsonc`, including the `hexcite.jamesloper.com` custom domain. Run `npx wrangler login` once to authorize your account, then `npm run deploy`. Production HTML and the install manifest revalidate on each visit, while hashed assets are cached long-term through `src/public/_headers`.

For automatic cloud builds, connect `lemontron/hexcite` in the Worker's **Settings → Builds** with these settings:

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run ci`
- Deploy command: `npx wrangler deploy`

Cloudflare installs the locked dependencies, runs all tests, builds the assets, and deploys only if the build succeeds. `.nvmrc` selects Node.js 24. Pushes to `main` trigger the pipeline; deployment does not depend on the local development server.

