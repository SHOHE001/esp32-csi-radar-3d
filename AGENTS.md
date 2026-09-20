# Development

- Read docs/development-workflow.md. Track objectives/blockers in Issues, code and validation in PRs, and durable design in docs.
- Preserve unrelated changes. Work on a branch and merge through a PR only after all checks on its current head pass. Never directly push to main, force push, or bypass checks.
- For Python changes run `python -m unittest discover -s radar3d -p "test_*.py" -v`. For browser changes run `node --test radar3d/test_app.cjs` and `node --check radar3d/static/app.js`. CI also parses all PowerShell scripts on Windows.
- Use synthetic temporary CSV data and loopback-only HTTP tests. Hardware testing, firmware flashing, Wi-Fi credentials/settings, and hotspot changes require an explicit task. Do not execute setup/flash/network scripts as a syntax check.
- Keep device backups, firmware, real observations, credentials, and local execution notes out of Git and Issues. Keep measured signal data clearly separate from synthetic position/pose.
- After three meaningful failed attempts on one unresolved problem, record the hypotheses, checks and results in its existing Issue; mark the Issue and Project Blocked and continue independent work.
- Use the existing Development HQ Project. Report any unsynchronized status and any checks or hardware verification that were not performed.
