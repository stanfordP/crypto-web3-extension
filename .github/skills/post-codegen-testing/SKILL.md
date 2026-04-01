---
name: post-codegen-testing
description: 'Test and validate generated or newly edited code in the CTJ workspace. Use when code has just been added, refactored, fixed, or scaffolded and you need a disciplined post-codegen workflow: choose the right repo, run the smallest relevant checks first, widen coverage only as needed, triage failures, and finish with explicit completion gates for the main app and extension.'
argument-hint: 'Describe what changed, which repo(s) were touched, and whether you want targeted or broad validation.'
user-invocable: true
---

# Post-Codegen Testing

Use this skill after generating, editing, or refactoring code in the CTJ workspace.

It is designed for **both repositories** in this workspace:
- `crypto-futures-jn` — main CTJ app
- `crypto-web3-extension` — CTJ authentication bridge extension

The goal is simple: **test the right things in the right order**.
Start with the narrowest relevant validation, fix failures, then widen coverage until the change is appropriately verified.

## When to Use

Use this skill when:
- New code was generated and needs validation
- A bug fix was applied and you want regression confidence
- You changed business logic, API routes, UI, auth, charts, trading code, or extension behavior
- You need to decide between targeted tests, full validation, or E2E coverage
- You want a repeatable “done means tested” workflow

Do **not** use this as a generic repo overview skill. It is specifically for **post-change testing and validation**.

## Core Rules

1. **Test the smallest relevant surface first.**
   Do not jump straight to the broadest suite unless the change is cross-cutting.
2. **Use repo-aware commands.**
   The main app and extension have different test runners and command shapes.
3. **Fix before widening.**
   If targeted checks fail due to the new change, fix the issue before running broader suites.
4. **Escalate intentionally.**
   Move from type-check/lint → targeted tests → broader validation → E2E only for high-risk changes or when explicitly requested.
5. **End with explicit completion gates.**
   A change is not “done” until the relevant checks pass and any skipped checks are called out clearly.

## Step 1: Identify the Change Surface

Classify the change before running anything.

### Main app (`crypto-futures-jn`)
- **Types/config only**: TypeScript types, schemas, utility signatures, config wiring
- **Pure logic**: calculations, services, helpers, AI handlers, analytics, fees, engine-safe utilities
- **UI/component**: React components, hooks, pages, charts, forms, client state
- **API/server**: route handlers, server utilities, auth, Supabase integration, middleware
- **Engine code**: anything under `engine/`
- **Cross-cutting**: shared types, large refactors, multiple domains touched

### Extension (`crypto-web3-extension`)
- **Pure logic/core**: core modules, services, adapters, controllers
- **UI**: popup/auth views, reviewer UX, accessibility behavior
- **Auth flow**: messaging, session storage, SIWE bridge, wallet flow
- **Build/release/config**: manifest, version sync, webpack, packaging
- **Cross-cutting**: multiple subsystems or protocol changes

## Step 2: Pick the Minimum Useful Validation

Choose the first checks based on what changed.

### Main app command ladder

| Change type | Start here | Widen if needed |
|---|---|---|
| Types/config | `npm run type-check` | `npm run lint` |
| Pure logic | `npm run type-check` + targeted Jest/Vitest | `npm run test` or `npm run test:vitest` as appropriate |
| UI/component | `npm run type-check` + targeted tests | `npm run lint`, then targeted E2E only if the flow is high-risk or specifically requested |
| API/server | `npm run type-check` + targeted tests | `npm run lint`, then broader tests if auth/data flow changed |
| Engine code | `cd engine && npm test` | include root `npm run type-check` if shared contracts changed |
| Cross-cutting | `npm run type-check` + `npm run lint` | `npm run validate` |

### Main app standard commands
- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run test:vitest`
- `npm run test:e2e`
- `npm run validate`
- `cd engine && npm test`

### Extension command ladder

| Change type | Start here | Widen if needed |
|---|---|---|
| Types/build/config | `npm run type-check` | `npm run lint` + `npm run check-version` if versioning touched |
| Pure logic/core | `npm run type-check` + `npm run test:unit` | `npm run lint` |
| UI | `npm run type-check` + `npm run test:unit` | `npm run test:e2e:a11y` or targeted E2E only for high-risk UX changes or explicit requests |
| Auth flow | `npm run type-check` + `npm run test:unit` | `npm run test:e2e` and possibly `npm run test:e2e:security` for high-risk changes or explicit requests |
| Cross-cutting | `npm run validate` + `npm run test:unit` | `npm run test:e2e:all` |

### Extension standard commands
- `npm run type-check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:security`
- `npm run test:e2e:a11y`
- `npm run test:e2e:all`
- `npm run validate`
- `npm run check-version`

## Step 3: Prefer Targeted Tests Before Full Suites

When the codebase already contains relevant tests, run the most targeted slice first.

Examples:
- For a specific Jest area in the main app, prefer forwarding a file or pattern instead of running the entire suite immediately.
- For Vitest-backed newer code in the main app, use the narrowest applicable invocation.
- For the extension, run targeted unit or specific Playwright specs when the change is localized.

Use broad suites only when:
- Shared contracts changed
- Multiple modules were edited
- Auth/session flow changed
- Build or packaging behavior changed
- The targeted failure suggests wider regression risk
- The user explicitly asked for full validation

## Step 4: Run, Read, and Triage Failures

For every failure, sort it into one of these buckets:

### A. Direct regression from the new change
Fix it immediately, then re-run the same narrow test.

### B. Test expectation drift
If behavior changed intentionally, update the test only if the new behavior is correct and aligned with the feature intent.

### C. Unrelated pre-existing failure
Document it clearly and continue only if it does not invalidate the current change.
Do not silently treat unrelated failures as “good enough.”

### D. Environment/setup issue
If the failure is caused by missing setup, invalid env, or unavailable browser/runtime requirements, record the blocker and choose the nearest meaningful alternative check.

## Step 5: Escalate Coverage Intelligently

Escalate when any of the following is true:
- The change affects multiple files or layers
- Auth/session logic changed
- Data-fetching or API behavior changed
- UI behavior changed in a user-visible way
- A reusable shared utility changed
- The patch touched both repos

Suggested escalation order:
1. Type-check
2. Lint
3. Targeted unit/integration tests
4. Broader repo validation
5. E2E or accessibility/security tests only when the change is high-risk or the user explicitly asks for them

## Step 6: Repo-Specific Completion Gates

### Main app is sufficiently verified when
- TypeScript checks pass for relevant changes
- Relevant Jest and/or Vitest coverage passes for touched logic
- Lint passes if affected files fall under linted rules or code style changes matter
- E2E was run only for high-risk UI/auth/navigation/user flow changes or because it was explicitly requested
- `engine/` tests ran for engine-only edits
- `npm run validate` was used for broad or cross-cutting main app work

### Extension is sufficiently verified when
- `npm run type-check` passes
- `npm run lint` passes when applicable
- `npm run test:unit` passes for code changes
- E2E/auth/security/a11y checks run when the change is high-risk in those areas or explicitly requested
- `npm run check-version` runs if version/manifest/release files changed

## Step 7: Report Results Clearly

Always finish with a concise testing summary containing:
- **Repo(s) tested**
- **What changed**
- **Checks run**
- **Checks passed**
- **Checks skipped and why**
- **Any remaining blockers or follow-ups**

Good summary pattern:
- Targeted checks passed
- Broader validation was or was not needed
- Any skipped E2E/security/a11y tests are explicitly justified
- Remaining risk is stated plainly

## Decision Shortcuts

### If only a small utility changed
Run the smallest relevant type-check and targeted test first.

### If a page, form, or interaction changed
Run type-check plus relevant tests, then add E2E only if the flow is high-risk or explicitly requested.

### If auth, wallet, session, or extension messaging changed
Treat it as high-risk: use type-check + unit coverage, then add flow-oriented E2E when the risk justifies it or the user asks for it.

### If shared contracts or multiple layers changed
Skip the tiny-only approach and move to broader validation.

### If the change spans both repos
Validate each repo separately with its own command ladder, then report a combined result.

## Quality Bar

A strong post-codegen validation run should:
- Catch the most likely regression quickly
- Avoid wasting time on irrelevant full-suite runs too early
- Escalate when the risk profile increases
- Distinguish genuine regressions from unrelated noise
- End with explicit confidence, not vague optimism

## Example Requests

- `/post-codegen-testing validate a new chart hook in the main app with targeted checks first`
- `/post-codegen-testing test a Bybit API route change and decide whether E2E is needed`
- `/post-codegen-testing validate an extension auth-flow fix across unit, security, and a11y layers`
- `/post-codegen-testing run the right tests after edits in both CTJ repos`
