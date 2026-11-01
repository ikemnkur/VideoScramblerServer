# VideoScramblerServer (Scramblurr)

Backend for media scrambling/unscrambling, audio steganography, user accounts,
credits, subscriptions, payments, and administration. Some filenames and package
metadata still use the older **KeyChing** name.

**Returning to the project?** Start with the [architecture and development guide](docs/ARCHITECTURE.md).
It explains where the code lives, how a request is processed, and how to refactor
one feature at a time.

## What actually runs

- `npm start` runs [server.cjs](server.cjs), the Express API (default port `3001`).
- The server mounts [server-admin.js](server-admin.js) at `/admin`.
- [python-service.cjs](python-service.cjs) launches Python scripts as child
  processes for the main media-processing routes. These routes do **not** require
  the Flask server in [python/app.py](python/app.py).
- `POST /api/tts/google` still calls a separate HTTP service configured with
  `TTS_SERVER_LINK` (default `http://localhost:5001`).
- MySQL is used through Knex and multiple mysql2 connection pools.

The alternate [server-newapp.js](server-newapp.js) and
[server-admin-newapp.js](server-admin-newapp.js) are not selected by the npm
startup scripts. Do not assume they are safe to delete or edit instead of the
active files.

## Local setup

Run commands from the repository root unless noted otherwise. Use a local/test
database and test-mode service credentials, not production resources.

### 1. Prerequisites and Node dependencies

- Node.js `18+` according to [package.json](package.json); prefer a supported LTS.
- MySQL `8+` and a compatible application schema.
- Python 3 with virtual-environment support for media processing.
- FFmpeg on `PATH` for video/audio processing.

```bash
npm ci
```

### 2. Configure the environment

Create a local `.env` file manually. There is **no tracked `.env.example`**.
Do not commit your environment file or credentials.

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_local_db_user
DB_PASSWORD=your_local_db_password
DB_NAME=video-scrambler
DB_CONNECTION_LIMIT=10

PORT=3001
NODE_ENV=development
JWT_SECRET=replace_with_a_long_random_local_secret
ADMIN_SECRET=replace_with_a_different_long_random_local_secret
FRONTEND_URL=http://localhost:5173

# Needed at startup because the main server constructs a Stripe client.
# Use your own Stripe test-mode secret key.
STRIPE_SECRET_KEY=replace_with_your_stripe_test_secret_key
```

`JWT_EXPIRES_IN` defaults to `7d`. `PROXY` defaults to an empty string and prefixes
many, but not all, API routes. `HOST` is not read by the main server's
`listen` call. The CORS allowlist is currently in [server.cjs](server.cjs);
setting `FRONTEND_URL` does not automatically update that list.

Additional settings depend on the feature you use:

| Feature | Settings |
| --- | --- |
| SMTP email | `SES_SMTP_HOST`, `SES_SMTP_PORT`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME` |
| Stripe webhooks | `STRIPE_PAYMENT_WEBHOOK_SECRET`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` |
| Subscription prices | `VITE_BASIC_PRICE_ID`, `VITE_STANDARD_PRICE_ID`, `VITE_PREMIUM_PRICE_ID` |
| Google Cloud uploads | `GCP_PROJECT_ID`, `GCP_SA_KEYFILE`, `GCS_BUCKET`, `GCS_PREFIX` |
| Google TTS HTTP service | `TTS_SERVER_LINK` |
| Crypto integrations | `BTC_ESPLORA`, `LTC_ESPLORA`, `ETHERSCAN_API_KEY`, `SOLANA_RPC_URL`, `TATUM_API_KEY` |
| Verification | `VERIFICATION_CODE_EXPIRY_MINUTES` (default `30`) |

These are a guide to the active code, not a complete environment template.

### 3. Prepare a development database

[DB/](DB/) contains schema fragments, incremental SQL changes, and historical
dumps. There is not yet a single verified, ordered migration sequence for a
fresh installation. The older [DB/KeyChingDB.sql](DB/KeyChingDB.sql) alone should
not be assumed to cover the current application.

Obtain a known-good **sanitized** development schema and confirm which incremental
changes it needs before importing anything. Review dumps and scripts for data
and destructive statements; do not blindly import all files or use production
customer data. Match the database name to `DB_NAME`.

### 4. Prepare Python for media processing

The Node adapter currently requires the exact interpreter path
`python/venv/bin/python3` on Linux:

```bash
python3 -m venv python/venv
python/venv/bin/python3 -m pip install -r python/requirements.txt
# Additional packages imported by the media scripts and Node adapter:
python/venv/bin/python3 -m pip install opencv-python Pillow pydub edge-tts
ffmpeg -version
```

[python/requirements.txt](python/requirements.txt) is not a complete dependency
manifest for every script. The commands above cover common media imports, not
every experiment or the separately configured Google Cloud TTS service. Dependency
consolidation and reproducible Python setup remain follow-up work.

### 5. Start the API

Logging expects a writable `logs` directory:

```bash
mkdir -p logs
npm start
# Or, for automatic restart during development:
npm run dev
```

The server tests database connectivity during startup and exits if that check
fails. It also creates Python input/output directories. Do not import
[server.cjs](server.cjs) into a unit test: importing it starts the application.

The old [run.sh](run.sh) and [dev_start.sh](dev_start.sh) describe Flask workflows,
not the recommended startup path for current media routes.

## Finding API routes

The following are representative routes, **not** a complete API specification.
Paths assume `PROXY` is empty. Consult the handler for authentication, body shape,
response format, and side effects before calling it.

| Area | Example route |
| --- | --- |
| Accounts | `POST /api/auth/login`, `POST /api/auth/register` |
| Password recovery | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Two-factor authentication | `POST /api/auth/2fa/setup` |
| Wallet | `POST /api/wallet/balance/:username` |
| Notifications | `GET /api/notifications/:username` |
| Media | `POST /api/scramble-photo`, `POST /api/unscramble-video` |
| Fingerprints | `POST /api/fingerprint/save` |
| Downloads | `GET /api/download/:filename` |
| Subscriptions | `POST /api/subscription/create-checkout` |
| Payments | `POST /api/stripe-purchase/create-checkout` |
| Webhooks | `POST /api/payments/webhook`, `POST /api/subscription/webhook` |
| Administration | `GET /admin/login` |

There is **no `/health` route in the main Node server**. A response from `/`
checks HTTP serving only; it is not a database or media-processing readiness
check. Static pages can respond before the startup database check finishes.

```bash
curl -i http://localhost:3001/
```

## Tests and safe refactoring

```bash
npm test
node --check server.cjs
```

The Node tests use the built-in `node:test` runner, with no database, Python
process, or external service required. They currently cover only the extracted
SQL insert builder; they are not end-to-end coverage of the server.

Python test scripts and browser tools in [test-files/](test-files/) are separate
manual/feature-specific tools. Do not run them against production resources.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the refactoring sequence and
[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) before deployment.

## Troubleshooting

- **Missing Node module:** install the declared dependencies with `npm ci`.
  The active code imports `uuid`, but it is not declared directly in
  [package.json](package.json); resolving that dependency explicitly is follow-up
  work, not something to rely on transitively.
- **Database connection fails:** verify MySQL, the development schema, credentials,
  and port. [config/db.js](config/db.js) currently does not apply `DB_PORT`, unlike
  the other database configurations.
- **Python cannot start:** check that `python/venv/bin/python3` exists; a virtual
  environment named `.venv` will not match the adapter's current path.
- **Missing `cv2`, audio libraries, or FFmpeg:** check dependencies inside the
  Python environment, and FFmpeg availability on the server's `PATH`.
- **Log write errors:** create `logs` and ensure the application can write there.
  Current files are named `logs/universal_<ISO timestamp>.log`.
- **Browser CORS error:** check the allowlist in [server.cjs](server.cjs).
- **Google TTS fails:** check the separate HTTP service and its own configuration;
  the main media adapter does not replace this endpoint.
