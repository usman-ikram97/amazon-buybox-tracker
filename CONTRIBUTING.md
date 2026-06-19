# Contributing

This is a personal portfolio project. Contributions, suggestions, and issue reports are welcome.

## Reporting Issues

Open a GitHub Issue and include:

- Which marketplace(s) are affected
- The ASIN (if public / non-sensitive)
- The Notes column value returned
- Any debug files generated in `debug/` (redact personal data before sharing)
- Node.js version (`node --version`) and OS

## Proposing Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test against at least one Amazon marketplace
5. Open a Pull Request with a clear description of what changed and why

## Development Setup

See [docs/setup-guide.md](docs/setup-guide.md) for full local setup instructions.

## Code Style

- CommonJS modules (`require`/`module.exports`)
- `async/await` throughout — no raw Promise chains
- Keep scrape logic in `scrape.js`, orchestration logic in `run.js`
- Add multilingual detection strings when extending marketplace support

## Security

Never commit `credentials.json`, `token.json`, browser `profiles/`, or any file containing API keys or OAuth tokens. See `.gitignore`.
