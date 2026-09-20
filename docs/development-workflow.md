# Development workflow

Use an Issue for objectives and blockers, a work branch and PR for changes and verification, and docs for accepted design. Preserve unrelated local changes. Push work branches only and merge normally after the current PR head has passing CI and no unresolved review findings. Never force-push or bypass checks.

Use the existing [Development HQ](https://github.com/users/SHOHE001/projects/1): In Progress while implementing, Review once the PR is ready, and Done only after merge and acceptance checks. Three documented unsuccessful attempts on one unresolved problem require a blocker update and Blocked status; continue unrelated work.

## Setup status (2026-09-21)

- Repository: [esp32-csi-radar-3d](https://github.com/SHOHE001/esp32-csi-radar-3d); default branch `main`.
- Guidance: `AGENTS.md`; `CLAUDE.md` delegates to it.
- Templates: `.github/ISSUE_TEMPLATE/{bug,feature,blocker}.yml` and `.github/pull_request_template.md`; the `blocked` label is available.
- CI: `.github/workflows/ci.yml`, `checks (ubuntu-latest)` and `checks (windows-latest)`: Python synthetic-fixture tests, browser behavior tests, JavaScript syntax, and Windows PowerShell parsing.
- Branch protection: not configured (protection API returned 404; rulesets returned an empty list). Settings remain unchanged pending separate authorization. PR and green-CI requirements are the development procedure, not server-enforced protection.
- Project: existing Development HQ, updated and read back at each milestone.

## Local validation

The viewer and its tests use only the Python standard library. The browser tests use Node's built-in test runner. Installing the GUI/device dependencies in `requirements.txt` is unnecessary for these checks.

```sh
python -m unittest discover -s radar3d -p "test_*.py" -v
node --test radar3d/test_app.cjs
node --check radar3d/static/app.js
```

PowerShell files are parsed by CI on Windows without executing them. Do not run setup, flash, restore, hotspot, or Wi-Fi configuration scripts as part of routine validation. Hardware behavior is a separate check and is not established by fixture tests.

Only synthetic fixtures belong in Git. Real observations, device backups, credentials, generated firmware and private execution records remain local. Do not publish them in Issues or PRs.
