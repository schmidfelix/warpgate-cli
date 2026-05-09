# Publication Checklist

Before making this repository public:

- Add real screenshots or remove the README TODO placeholders for the demo GIF, picker screenshot, and database submenu screenshot.
- Run `npm publish --dry-run` before the first release.
- Confirm the final package name is available on npm and rename if needed.
- Publish with `npm publish` after logging in with `npm login`.
- Create a GitHub release and tag matching `package.json` version.
- Inspect git history for secrets, private domains, personal names, tokens, generated binaries, or config files before pushing.
- Check untracked and ignored files with `git status --short` and `git status --ignored --short`.
- Confirm no local config or database files under `~/.config/warpgate-cli` are accidentally copied into the repo.
- Add release instructions if users should install a prebuilt binary instead of building locally.
