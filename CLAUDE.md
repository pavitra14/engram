@AGENTS.md

Claude Code reads this file; everything project-specific lives in `AGENTS.md` so every agent shares one source of truth. Keep this file to the import above plus Claude-only notes.

## Claude-only notes

- The Expo plugin is enabled in `.claude/settings.json`; prefer its skills for Expo questions.
- In Claude Code cloud sessions, pushing git tags and writing through the GitHub API are blocked. Release by pushing a `release/vX.Y.Z` branch (see Releasing in `AGENTS.md`). Read-only `gh api` calls work; `gh` GraphQL commands such as `gh release view` do not, so use `gh api repos/pavitra14/engram/...` instead.
- Watch CI with `gh run list -R pavitra14/engram` and `gh run view <id> -R pavitra14/engram --log`. Artifact downloads are blocked; screenshots are on the `smoke-shots` branch instead.
