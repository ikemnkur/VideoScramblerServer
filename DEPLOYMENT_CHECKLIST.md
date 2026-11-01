# VideoScramblerServer deployment checklist

This is a verification checklist, not a claim that the current deployment
automation is ready for a fresh installation. Start with [README.md](README.md)
for current configuration and known setup gaps.

## Before deployment

- [ ] Run `npm test` and `node --check server.cjs`.
- [ ] Verify the target revision and obtain a database backup using your existing
  operational process.
- [ ] Verify a compatible database schema and review incremental changes in
  [DB/](DB/); there is no verified ordered migration sequence yet.
- [ ] Confirm Node, MySQL, Python, and FFmpeg availability.
- [ ] Confirm production credentials are supplied outside version control:
  database, JWT/admin secrets, Stripe, and any enabled email/cloud integrations.
- [ ] Confirm the desired `PORT`, CORS origins, frontend URL, and webhook URLs.
- [ ] Confirm the database port works for every active connection configuration;
  [config/db.js](config/db.js) does not currently read `DB_PORT`.
- [ ] Prepare `python/venv/bin/python3` and the dependencies for the media features
  being deployed. The Python requirements file is incomplete for all features.
- [ ] Ensure `logs` is writable and runtime upload/output directories have
  appropriate permissions and storage.

## Review automation before running it

- [ ] Check [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it runs on
  pushes to `main` and manual dispatch, and invokes
  `/root/VideoScramblerServer/deploy.sh` on the remote host.
- [ ] Confirm the remote script exists and matches the intended revision. The
  tracked script is [deploy/deploy.sh](deploy/deploy.sh), not a root-level script.
- [ ] Review [deploy/deploy.sh](deploy/deploy.sh) before execution: it pulls code,
  installs dependencies, restarts PM2 processes, and copies/reloads Nginx config.
  Do not run it as a local setup command.
- [ ] Confirm PM2 process names and whether the separately managed Flask process
  is still needed. Main media routes now use direct Python child processes.
- [ ] If Google TTS is enabled, verify the separate `TTS_SERVER_LINK` service and
  its dependencies independently.
- [ ] Review [deploy/nginx-videoscrambler.conf](deploy/nginx-videoscrambler.conf)
  for the correct domain, TLS, routing, and upload limits.

## Verify the running application

- [ ] Check process status and logs; confirm the startup database check succeeded.
- [ ] Request `/` to check HTTP serving. The Node API does **not** implement
  `/health`, and serving a static page is not proof of database readiness.
- [ ] Test login with a dedicated test account.
- [ ] Exercise a small media upload and download with known test fixtures.
- [ ] Check an authenticated database-backed route.
- [ ] Verify enabled payment/email/TTS features using the appropriate safe test
  procedure; avoid unintended charges or customer emails.
- [ ] Confirm firewall, HTTPS, access restrictions, monitoring, and rollback
  procedures before exposing the deployment.

## Useful commands

```bash
curl -i http://localhost:3001/
# For the process name used by the tracked deployment script:
pm2 status
pm2 logs video-scrambler-node --lines 50 --nostream
```

Application file logs use `logs/universal_<ISO timestamp>.log`, not
`logs/server.log`. Use the actual current file when inspecting logs.
