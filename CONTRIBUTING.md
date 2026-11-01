# Contributing

## Prerequisites

Make sure you have everything installed before starting:

- Node.js ≥ 18 and [pnpm](https://pnpm.io)
- Rust ≥ 1.77 (via [rustup](https://rustup.rs))
- On Linux: `build-essential`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`

## Setup

```bash
git clone <repo-url>
cd privolent
pnpm install
```

## Development

Run the relay server first, then the desktop app:

```bash
pnpm relay       # relay at http://localhost:3001
pnpm tauri dev   # desktop app with HMR
```

The collector PWA is served by the relay at `http://localhost:3001/collector/`. You can also open `collector-pwa/index.html` directly in a browser.

## Testing

```bash
pnpm test                                           # all suites
cargo test --manifest-path src-tauri/Cargo.toml    # Rust only
pnpm test:relay                                     # relay only
pnpm test:pwa                                       # PWA only
```

All tests must pass before opening a pull request.

## Building

```bash
pnpm build
pnpm tauri build
```

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

**Format:**

```
<type>: <description>
```

Keep the entire commit message on the first line. Do not add a body or footer unless the change genuinely requires it (e.g. referencing a breaking change or a bug report). Avoid scopes.

**Allowed types:**

| Type | When to use |
|------|-------------|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `refactor` | Code restructuring without behaviour change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, build system, dependencies |
| `perf` | Performance improvements |

**Examples:**

```
feat: add collector login session persistence
fix: correct missed-day fine calculation on prepaid boundary
test: add edge case for remainder slot installment
docs: update relay API endpoints in AGENTS.md
chore: upgrade Tauri to 2.1
```

Not like this:

```
feat(relay): add endpoint                   ← no scopes
feat: add endpoint for collector login and update PWA sync logic and fix fine calc  ← too much in one commit
WIP: stuff                                  ← not a valid type
```

## Code style

- **Rust**: `cargo fmt` before committing. Clippy warnings are treated as errors in CI.
- **TypeScript/JS**: No formatter is enforced yet, but follow the existing style (2-space indent, no semicolons in the PWA).
- **No dead code**: Remove unused imports, variables, and commented-out blocks before committing.

## Pull requests

- Keep PRs focused on one thing.
- If your change touches the loan calculation engine (`engine.rs`), include or update the relevant unit tests — the worked examples in the tests are derived directly from the product spec and are not optional.
- If you're changing the relay API, update `AGENTS.md` and the relay test suite.

## License

By contributing, you agree that your changes will be licensed under the same [GPL v3 license](LICENSE) as the rest of the project.
