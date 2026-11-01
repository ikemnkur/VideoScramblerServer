# Architecture and development guide

## Start here

This is a map of the current code, followed by a gradual cleanup approach. It is
not a claim that the whole application has already been reorganized.

If you have been away from the project:

1. Read [the setup guide](../README.md).
2. Read the imports and startup code in [server.cjs](../server.cjs).
3. Pick one feature and find its route by searching for its URL.
4. Follow the route into its database queries or Python service call.
5. Run `npm test` before changing code, then add coverage for the behavior you
   intend to preserve.

## Repository map

| Location | Current responsibility |
| --- | --- |
| [server.cjs](../server.cjs) | Active entrypoint: configuration, middleware, logging, analytics, most API handlers, startup/shutdown |
| [server-admin.js](../server-admin.js) | Express router factory for admin pages and operations, mounted at `/admin` |
| [python-service.cjs](../python-service.cjs) | Runs Python/FFmpeg, manages media paths, and cleans up old input/output files |
| [AmazonSESemailService.cjs](../AmazonSESemailService.cjs) | SMTP transport and HTML template rendering; configuration still uses SES names |
| [email-templates/](../email-templates/) | HTML templates used by the email service |
| [middleware/auth.js](../middleware/auth.js) | Verifies bearer JWTs and sets `req.user` |
| [config/knex.js](../config/knex.js) | Shared Knex instance for MySQL queries |
| [config/db.js](../config/db.js) | Additional mysql2 connection pool; the main entrypoint also creates a pool |
| [lib/db/build-insert.cjs](../lib/db/build-insert.cjs) | Extracted pure SQL insert builder |
| [tests/](../tests/) | Automated Node unit tests, currently covering the insert builder |
| [public/](../public/) | Static browser pages served by Express |
| [python/](../python/) | Media algorithms, CLI scripts, Flask alternatives, sample media, and Python tests |
| [python/tts/](../python/tts/) | TTS scripts and the separate Flask TTS server |
| [test-files/](../test-files/) | Manual browser tools and integration experiments, not the npm unit suite |
| [DB/](../DB/) | SQL fragments and historical database dumps, not yet an ordered migration system |
| [deploy/](../deploy/) | Deployment shell script and Nginx configuration |
| [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) | Remote deployment trigger for `main` and manual runs |

[server-newapp.js](../server-newapp.js) and
[server-admin-newapp.js](../server-admin-newapp.js) are alternate copies, not the
npm-selected entrypoints. Establish their history and any external consumers
before archiving them. Likewise, filenames containing `old`, `copy`, or `backup`
are not enough evidence that a Python script or sample is unused.

## How requests move through the system

### Typical API request

```text
Client
  -> Express in server.cjs
  -> applicable middleware (CORS, parsing, request tracking, route authentication)
  -> route handler
  -> MySQL via Knex or mysql2 / an external service
  -> HTTP response
```

Middleware order matters. Static serving is installed before request analytics.
Some routes are prefixed with `PROXY`; others, including `/admin`, are not.
Authentication is attached per route, not uniformly to every `/api` endpoint.
Always inspect the actual handler rather than assuming a consistent policy.

### Photo/video processing

```text
Multipart upload
  -> route's Multer upload middleware
  -> file in python/inputs
  -> python-service.cjs constructs command arguments
  -> python/venv/bin/python3 executes a media CLI script
  -> output in python/outputs
  -> response and subsequent download request
```

The adapter uses `execFile`, not an HTTP request to Flask, for these operations.
For example, the standard photo path calls
[scramble_photo_v2.py](../python/scramble_photo_v2.py), while pro photo processing
calls [scramble_photo_pro.py](../python/scramble_photo_pro.py).

Input/output files are temporary: the cleanup worker checks for inactivity and
removes older files. They should not be treated as permanent storage. There is
also a `python/public_audio` directory for generated audio.

### Registration

The registration handler builds a user record, serializes selected JSON fields,
calls [buildInsert](../lib/db/build-insert.cjs), and executes the returned SQL
and bindings with `knex.raw`.

The helper does not connect to MySQL, serialize objects, or validate SQL
identifiers. Table/column names must be trusted application constants. User
values belong in bindings, never in concatenated SQL. The extraction preserves
the original helper's output and errors; it does not add input validation.

### Admin and logging

[server-admin.js](../server-admin.js) exports a function that creates a router
using shared dependencies supplied by the entrypoint: pool, analytics, log
entries, database configuration, and a callback for the current log path.
This existing router-factory pattern is a useful model for future extractions.

The main server overrides console methods twice: once for an in-memory buffer
and then for file logging. Changing or moving this code can affect both the
admin views and terminal/file output; cover both before refactoring it.

### Text-to-speech

Not all Python-related behavior goes through the media adapter:

- `/api/tts/username-audio` fetches audio from Google Translate.
- `/api/tts/google` calls the separate service at `TTS_SERVER_LINK`.
- The Python adapter also contains direct TTS-related functionality.

Treat these as distinct paths when investigating a TTS issue. The older Python
guides describe individual features and may contain stale paths or dependency
instructions; use the active call site as the source of truth.

## First refactor: what changed and why

The insert builder moved from [server.cjs](../server.cjs) into
[lib/db/build-insert.cjs](../lib/db/build-insert.cjs), with the registration call
left unchanged. This is a deliberately small first step:

- A **pure function** returns a result without opening a database, writing a
  file, or starting a server.
- It can be tested without application credentials or external services.
- Tests capture exact SQL, binding order, special values, and existing errors.
- `npm run dev` now watches `lib` so editing the extracted helper restarts Node.

`npm test` runs [tests/build-insert.test.cjs](../tests/build-insert.test.cjs) with
Node's built-in test runner. It does not run the Python or manual browser tests.
There is no new test dependency.

## Refactor gradually

Keep each step reviewable and behavior-preserving. A refactor changes how code is
arranged, not what clients observe.

1. **Establish a baseline for one feature.** Record its route, HTTP method,
   authentication, input fields, response status/body, and side effects. Add
   tests before moving complicated logic.
2. **Extract pure helpers.** Start with formatting or calculations that do not
   need the running server. Place shared helpers in `lib`, and avoid making a
   giant miscellaneous utility module.
3. **Extract one router.** Follow the admin router factory: accept dependencies
   explicitly rather than importing the entrypoint. Preserve registration order,
   `PROXY` handling, authentication, and upload middleware order.
4. **Separate HTTP from business logic.** A route reads the request and sends a
   response; a service performs the operation. Extract a database repository
   only where it genuinely clarifies repeated queries.
5. **Consolidate configuration carefully.** Reconcile the multiple database
   pools and their defaults/port behavior with regression tests, rather than
   swapping every connection at once.
6. **Improve reproducibility.** Build a verified schema/migration sequence and
   complete Python dependency manifest. Confirm which alternate files and
   fixtures are needed before moving or removing them.

Possible future structure, **not directories already wired into the app**:

```text
server.cjs          # startup and composition
routes/             # HTTP handlers grouped by feature
services/           # operations shared by routes
repositories/       # database access where useful
middleware/         # authentication and request middleware
config/             # environment and connection setup
lib/                # small shared helpers
tests/              # automated Node tests
docs/               # architecture and development documentation
python/             # media CLI implementations
```

Do not rename every file or move every folder at once. Python script paths,
email template paths, static assets, npm watchers, deployment scripts, and
external process configurations all depend on the current layout.

## Before finishing a change

- Run the smallest tests covering the changed behavior, and `npm test` for the
  current small Node suite.
- Syntax-check changed JavaScript modules with `node --check`.
- For route changes, verify actual status codes and response shapes using a
  development database and safe fixtures.
- Keep credentials, customer data, and generated media out of test commits.
- Update the related setup/architecture documentation.
- Inspect `git diff` for accidental edits and generated output.

Current unit coverage is narrow. A passing helper test does not establish that
registration, payment processing, Python execution, or deployment works
end-to-end.
