# Contributing Guide

## Git Workflow

1. **Branch from `main`**: `git checkout -b feature/<name> main`
2. **Commit with conventional commits**: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
3. **Push branch**: `git push origin feature/<name>`
4. **Open PR** against `main` with description and checklist
5. **Squash merge** after review

## Running Tests

```bash
# TypeScript (88 tests)
npm test

# Python (20 tests)
cd backend && python -m pytest tests/ -v

# All tests must pass before merging
```

## Code Standards

- **TypeScript**: Strict types via `src/lib/types/index.ts`. No `any` in agent logic.
- **Python**: Type hints on all tool functions. Return `dict` with structured keys.
- **Agents**: Business logic in pure functions. LLM calls only for OCR, letter gen, and semantic audit.
- **Tests**: Every new tool or agent function requires unit tests.

## Architecture Rules

- Agents **never** perform math — all calculations delegated to deterministic tool functions
- Every AI-dependent operation must have a mock/fallback path
- State transitions only via the orchestrator's `reflect()` function
- No outputs generated without explicit human approval (HITL gate)
