# hexcite

Edit the app in `src/`. Install development dependencies with `npm install`.

- `npm run dev` (or `npm run serve`) starts Vite at http://localhost:5173. Source edits automatically update the browser.
- `npm run build` bundles the publishable PWA into `dist/`, with hashed assets.
- `npm run preview` serves the production build locally for checking before publication.
- `npm run deploy` builds and publishes the game to Cloudflare Workers Static Assets.
- `npm test` checks the game rules against the source.

Static icons, the install manifest, and the cleanup service worker live in `src/public/` and are copied unchanged during builds. Publish the contents of `dist/` to a static HTTPS host. Generated files in `dist/` are excluded from Git.

Cloudflare deployment uses `wrangler.jsonc`. Run `npx wrangler login` once to authorize your account, then `npm run deploy`. The public site uses a `workers.dev` address; custom domains can be configured later. Production HTML and the install manifest revalidate on each visit, while hashed assets are cached long-term through `src/public/_headers`.

For automatic cloud builds, connect `lemontron/hexcite` in the Worker's **Settings → Builds** with these settings:

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run ci`
- Deploy command: `npx wrangler deploy`

Cloudflare installs the locked dependencies, runs all tests, builds the assets, and deploys only if the build succeeds. `.nvmrc` selects Node.js 24. Pushes to `main` trigger the pipeline; deployment does not depend on the local development server.

