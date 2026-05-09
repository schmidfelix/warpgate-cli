# Remaining Publication Checklist

Completed locally:

- MIT license added.
- README and user-facing code strings converted to English.
- npm package metadata added and `private` removed.
- `npm publish --dry-run` passes.
- npm package name `warpgate-cli` is currently available.
- Current files and reachable git history were scanned for personal and private environment references.
- Tests and type-check pass.

Remaining manual steps:

- Add real screenshots or remove the README TODO placeholders for the demo GIF, picker screenshot, and database submenu screenshot.
- Log in with `npm login`, then publish with `npm publish`.
- Create a GitHub release and tag matching `package.json` version.
- Force-push the rewritten branch when publishing the repository, because old local history was rewritten.
