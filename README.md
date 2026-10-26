# Genie Ops Center v2

Status: in development. Beads and the ticket evidence under `docs/tickets/` hold the current state of each section.

Genie Ops Center is an enterprise application platform: one repository, one Dockerfile, a shared core, and business modules. Every customer runs its own deployment from its own image, which carries core plus only that customer's modules, with one database and one identity realm, on Genie's servers or in the customer's own infrastructure.

Read in this order:

1. `docs/core/vision.md`: the platform, its decisions, and open questions.
2. `docs/core/roadmap.md`: core sections in dependency order, each with a definition of done.
3. `docs/core/tech-stack.md`: every runtime, library, and service, with the reason it is there.
4. `docs/architecture/data-shape.md`: the deployment tables, the core tables, and the rules module tables follow.
4a. `docs/architecture/module-contract.md`: every extension point a module may use, what core provides, and how the contract grows.
4b. `docs/architecture/repository-layout.md`: the monorepo tree, the per-customer configuration folders, and the eight levels at which a customer requirement is met.
5. `docs/modules/README.md`: the module catalogue, then the module you are working on.
6. `docs/architecture/diagrams/`: interactive diagrams of the deployment topology and the sign-in flow. Open the HTML files in a browser. The `.json` files beside them are the sources.

`docs/adr/` holds the architecture decision records: why one database per customer, why one Keycloak realm per customer, why modules live in one repository, why authorization lives in the application, how the database migrates on release, how Keycloak and Better Auth divide identity from session, and why every customer runs its own deployment from its own image.

`docs/README.md` maps every folder, including the ones that fill in later: design, specs, tickets, runbooks.

## Local development

One command starts Postgres 18 in Docker and the application with `next dev` on your machine. Sign-in uses the shared `genie-dev` realm on `https://sso.001.gs`.

### Before you start

- Install Node 26 and pnpm 12.4.2. Node 26 does not ship Corepack, so install pnpm with `npm install -g pnpm@12.4.2`.
- Install Docker. The integration and end-to-end tests also need it.
- Get three items from the project owner: a dump of a dev database that is already set up, the `BETTER_AUTH_SECRET` of that database, and the `genie-ops-center` client secret of the `genie-dev` realm. Never commit them.

### Start the server

1. Install the dependencies:

   ```bash
   pnpm install
   ```

2. Create your settings file from the template, then fill in the two secrets:

   ```bash
   cp apps/genie/.env.example apps/genie/.env.local
   ```

   Git ignores `.env.local`, and `next dev` reads it. `docs/architecture/environment-contract.md` lists the optional variables and their defaults.

3. Start the database only, the first time, so that you can load the dump before the application runs:

   ```bash
   docker compose -f deploy/stack/compose.dev.yaml up -d --wait
   ```

4. Restore the dump into it:

   ```bash
   docker compose -f deploy/stack/compose.dev.yaml exec -T database \
     pg_restore -U genie -d genie --no-owner --no-acl < genie-dev.dump
   ```

5. Start the database and the application with one command. It also generates the module files that the build does not commit:

   ```bash
   pnpm nx run @genie/app:dev
   ```

6. Open `http://localhost:3000` and sign in through `sso.001.gs`.

From then on, step 5 alone starts everything. Press Ctrl+C to stop the application. The database keeps running until you run `docker compose -f deploy/stack/compose.dev.yaml stop`.

### What to know

- Port 3000 must be free. The realm accepts only `http://localhost:3000` as the return address after sign-in.
- The first request applies any pending migrations to the dev database.
- The background worker does not run, so queued emails stay unsent.
- The database keeps its data in a named Docker volume. `docker compose -f deploy/stack/compose.dev.yaml down` removes the container but keeps the data. Adding `-v` deletes the data.
- Do not run `genie-ops setup` against an empty database with these values. The command runs only inside the built image today, and its realm step writes the shared `genie-dev` realm. Bead `genie-ops-center-v2-xok3.20` tracks one command that sets up an empty database without touching the realm.
- To work on components without a database, run Storybook with `pnpm nx run @genie/storybook:storybook` and open `http://localhost:6006`.
- Before you push, run `pnpm gate:fast`. Before a merge into `develop`, run `pnpm gate:merge`.
