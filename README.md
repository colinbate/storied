<p align="center">
  <img src="marketing/storied-mark.svg" width="72" height="72" alt="Storied logo">
</p>

<h1 align="center">Storied</h1>

<p align="center">
  A self-hosted home for the books, conversations, and people that make a reading community.
</p>

<p align="center">
  <a href="https://storied.bate.dev">Website</a> ·
  <a href="https://github.com/colinbate/storied">Source</a>
</p>

Storied is community software for book clubs that want more permanence and context than a group chat can offer. It brings reading plans, discussions, a shared catalog, and member tools together in a private space that runs on your own Cloudflare account.

This is not a hosted SaaS or a one-click install—at least not yet. Storied is an early, open-source project for technically curious readers who are comfortable configuring Cloudflare resources and adapting a deployment to suit their club.

## What Storied does

- **Thoughtful discussions.** Start threaded conversations, write in Markdown, mention other readers, attach images, and return to ideas later through search.
- **Reading sessions.** Schedule upcoming reads or meetings, organize them around themes, collect RSVPs, and keep the main discussion connected to the session. It is worth noting that Storied was built around a theme-based club, not one that assigns specific books.
- **A library with context.** Browse books, authors, series, and genres alongside the club history and conversations connected to them.
- **A quieter community space.** Member profiles, private messages, notifications, and moderation tools support a focused, small-group experience.
- **Reader-friendly choices.** Responsive layouts, dark mode, timezone-aware dates, and an optional OpenDyslexic typeface help members read comfortably.
- **Your infrastructure and data.** Run the application at the edge in a Cloudflare account you control.

See the static project page at [storied.bate.dev](https://storied.bate.dev). Its self-contained source lives in [`marketing`](marketing) and is intentionally kept outside the application's deployed static assets.

## Private member space and public site

Storied currently acts as the private, signed-in companion to a separate public-facing book-club site. The public site is not included in this repository. In the original installation, it presents public session information, provides a membership form, and receives canonical RSVP links from Storied.

A club can run Storied without a public site, but that is not yet a first-class configuration mode. The member application itself does not require a public homepage; however, a private-only deployment should review or avoid the current integration points:

- `PUBLIC_ORIGIN` in `shared/brand.ts` supplies the public membership-form redirect and public RSVP URLs.
- `POST /auth/join` is designed to receive the separate public site's membership form.
- `GET /api/v1/sessions` and `GET /api/v1/sessions/:id/subjects` are unauthenticated, allow cross-origin reads, and return only sessions explicitly marked public.
- Sessions should not be marked public until the operator is comfortable exposing their selected session and subject fields through those endpoints.

There is currently no single switch that removes these public integration surfaces. Adding an explicit private-only mode—or deciding whether the public and private experiences should live together—is a future architectural consideration rather than part of the present setup.

## Stack

The main application is built with SvelteKit 5 and TypeScript. The Cloudflare deployment uses:

- Workers and the Cloudflare SvelteKit adapter
- D1 for application data and migrations
- R2 for uploaded images
- Queues and a companion Worker for background work
- Email bindings for passwordless sign-in and notifications
- Cron triggers for scheduled notification work

UI styling uses Tailwind CSS and a small set of local components built on Bits UI. Drizzle provides the database schema and query layer.

## Local development

You will need Node.js 22 or newer, pnpm, and a Cloudflare account with Wrangler authenticated.

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

The local migration command uses Wrangler's local D1 state. The application also expects the bindings declared in `wrangler.toml`; features backed by email, R2, queues, or the companion Worker need their corresponding local or remote resources.

Before deploying your own instance, replace the deployment-specific values in both `wrangler.toml` files. The checked-in configuration currently includes the resource IDs, domains, routes, asset host, sender address, and service names used by the original installation.

Useful commands:

```sh
pnpm check              # Svelte and TypeScript checks
pnpm lint               # Prettier and ESLint checks
pnpm build              # Production build
pnpm db:migrate:prod    # Apply D1 migrations remotely
pnpm launch:worker      # Run the companion Worker locally
```

## Project status

Storied grew out of a real book-club installation called **The Archive**, part of the [Bermuda Triangle Society](https://bermudatrianglesociety.com) book club. The product is being separated from that first deployment, but some names, copy, domains, and Cloudflare resource identifiers are still specific to it. Treat the current repository as a working reference implementation rather than a generic installer.

Page titles, notification sender names, and other reusable identity strings read from `shared/brand.ts`. Files that run before the application or define Cloudflare infrastructure cannot import that module, so they still need a manual pass for each installation.

## New-instance customization checklist

- [ ] **Set the shared identity.** Update the organization, full and short application names, hostnames, public origin, notification identity, and restricted-access label in `shared/brand.ts`.
- [ ] **Choose the public-site model.** If the club has a separate public site, set `PUBLIC_ORIGIN` and review its join and RSVP integration. For a private-only deployment, avoid the public join flow, do not mark sessions public, and review or restrict the public API endpoints described above.
- [ ] **Configure the main Cloudflare application.** In `wrangler.toml`, replace the D1 database names and IDs, `FILE_BASE_URL`, R2 bucket, custom-domain routes, companion Worker service name, and allowed sender address. Review `ALLOW_SIGNUP` and `SEND_EMAILS` for the desired launch mode.
- [ ] **Configure the companion Worker.** In `workers/storied-worker/wrangler.toml`, replace `DIGEST_BASE_URL`, the D1 database, queue names, sender address, and any cron schedule that should differ for the new club.
- [ ] **Set trusted web origins.** Replace the production domains in `svelte.config.js` under `kit.csrf.trustedOrigins`.
- [ ] **Update installable-app metadata.** Change the Apple web-app title in `src/app.html` and the `name`, `short_name`, colors, and icon references in `static/site.webmanifest`. Replace the favicon and web-app icon files in `static/` if the new instance uses a different mark.
- [ ] **Decide whether to keep the restricted catalog.** The `/restricted` route, challenge code, achievement, member triangle marker, and its fiction are specific to The Archive. Customize them together or remove the feature across `src/routes/restricted`, `src/lib/server/achievements.ts`, `src/lib/components/member-name.svelte`, `src/routes/+layout.server.ts`, `src/hooks.server.ts`, `src/app.d.ts`, and the achievements migration. For an existing database, remove schema through a new migration rather than editing an applied migration.
- [ ] **Replace the themed error copy.** The 404 message in `src/routes/+error.svelte` references the Bermuda Triangle.
- [ ] **Review the static-site deploy hook.** The admin dashboard action and `DEPLOY_HOOK_URL` binding are part of the original installation's supporting-site workflow; configure or remove them if the new instance does not need that integration.
- [ ] **Run a final installation-name search.** Search for the old app, organization, domains, resource names, and sender address before deploying.

For the current installation, a useful final check is:

```sh
rg -n -i "the archive|bermuda triangle|bermudatrianglesociety|archive\.bermuda|notify@archive" . \
  --glob '!node_modules/**' --glob '!.git/**' --glob '!marketing/**'
```

## Repository layout

```text
src/                       SvelteKit application
shared/                    Code shared with the companion Worker
migrations/                D1 database migrations
workers/storied-worker/    Queue, cron, search, and notification worker
static/                    Application assets
marketing/                 Separately hosted, framework-free marketing page
```

## AI-assisted development

A substantial portion of the Storied codebase was developed with assistance from ChatGPT using OpenAI's GPT-5.5 and GPT-5.6 models. The resulting code has been reviewed, adapted, and maintained as part of the project rather than accepted as unreviewed generated output.

## Contact and community

- For private questions about setting up or adapting Storied, email [storied@bate.dev](mailto:storied@bate.dev).
- For bugs and concrete fixes, [open a GitHub issue](https://github.com/colinbate/storied/issues/new).
- For broader ideas, questions, and collaboration, [start or join a GitHub Discussion](https://github.com/colinbate/storied/discussions).

## License

Storied is open-source software available under the [MIT License](LICENSE).
