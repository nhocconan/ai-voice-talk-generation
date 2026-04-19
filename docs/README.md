# YouNet Voice Studio — Documentation Index

This directory is the single source of truth for product, architecture, and delivery.

| Document | Purpose | Audience |
|---|---|---|
| [PRD.md](./PRD.md) | Product Requirements — problem, users, scope, success metrics | All |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data model, provider abstraction | Engineers |
| [TECH_STACK.md](./TECH_STACK.md) | Chosen technologies + rationale + versions | Engineers |
| [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) | Best practices per language/framework | Engineers |
| [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md) | What "done" means for every task | All |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) | Test pyramid, tooling, coverage expectations | Engineers |
| [WORKFLOW.md](./WORKFLOW.md) | Task lifecycle: pick → build → test → review → mark done | All |
| [TASKS.md](./TASKS.md) | Phased task list with checkboxes, owners, DoD links | All |
| [DESIGN_TOKENS.md](./DESIGN_TOKENS.md) | Concrete design tokens derived from `DESIGN.md` | Designers, FE |

## Reading order

1. **Product people**: PRD → TASKS → DESIGN_TOKENS
2. **Engineers onboarding**: PRD → ARCHITECTURE → TECH_STACK → CODING_GUIDELINES → DEFINITION_OF_DONE → WORKFLOW → TASKS
3. **Reviewers**: DEFINITION_OF_DONE → TESTING_STRATEGY → WORKFLOW

## Living docs

All documents are living. When a decision changes:

1. Update the relevant doc **in the same PR** that implements the change.
2. Note the change in the doc's `## Changelog` footer with date + PR link.
3. If a task in `TASKS.md` is affected, update its DoD.

A PR that changes behavior without updating the corresponding doc fails review.
