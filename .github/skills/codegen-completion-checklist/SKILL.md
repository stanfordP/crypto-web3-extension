---
name: codegen-completion-checklist
description: 'Complete generated code in the CTJ workspace with a disciplined checklist that pairs code generation with review, cleanup, targeted validation, and final completion gates. Use after scaffolding, AI-generated code, refactors, or large edits that need to be checked, polished, and proven before calling the work done.'
argument-hint: 'Describe what was generated, which repo was touched, and how broad the change is.'
user-invocable: true
---

# Codegen Completion Checklist

Use this skill after code has been generated or heavily rewritten and you want to turn “the code exists” into “the change is actually ready.”

This checklist pairs **generation + review + validation**.

## When to Use

Use this skill when:
- AI generated a new file, component, hook, route, test, or workflow
- A scaffold or boilerplate was added and must be integrated properly
- A large refactor produced multiple related edits
- You want a reusable “before I declare this done” checklist

Use it for both repositories in this workspace:
- `crypto-futures-jn`
- `crypto-web3-extension`

## What Success Looks Like

A completed codegen task should end with:
- the generated code aligned to repo conventions
- placeholders, TODO junk, and accidental scaffolding leftovers removed or justified
- relevant type-checks and tests run
- skipped validation called out clearly
- a short summary of what changed and how it was verified

## Checklist

### 1. Restate the intended outcome
Before trusting generated code, confirm:
- what feature, fix, or artifact was supposed to be produced
- which repo and subsystem were touched
- what “done” means for this specific task

If the output does not clearly match the intended result, correct scope before polishing details.

### 2. Inspect the generated files for structural quality
Check the generated output for:
- wrong file placement
- incorrect naming
- broken imports or path aliases
- duplicated logic that should reuse existing modules
- accidental dead code, commented-out experiments, or placeholder text
- public API changes that were not intentional

Prefer small, targeted cleanup over broad rewrites.

### 3. Align with CTJ repo conventions
For `crypto-futures-jn`, verify the code follows the repo’s patterns:
- SSR-safe browser access
- feature flag awareness where relevant
- React hook rules
- existing state/query patterns
- Zod validation and auth/rate-limit requirements for API routes
- no unnecessary Web3 client imports in the main app

For `crypto-web3-extension`, verify:
- DI/controller/adapter structure is respected
- no Chrome APIs leak into pure core modules
- terminology stays “authentication bridge” rather than implying a standalone wallet
- message validation and origin validation expectations are preserved

### 4. Remove or resolve codegen leftovers
Look specifically for:
- placeholder variable names
- fake sample values accidentally kept in production code
- unfinished branches or `TODO` comments
- unused imports or dead exports
- generic comments that add no real value
- missing env variable placeholders when the generated code introduces required secrets or API keys

If new environment variables are required and a project root env file is missing, create a placeholder env file and note it in the summary.

### 5. Choose the minimum useful validation
Pick checks based on the change surface.

#### Main app quick command set
- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run test:vitest`
- `npm run validate`
- `cd engine && npm test`

#### Extension quick command set
- `npm run type-check`
- `npm run lint`
- `npm run test:unit`
- `npm run validate`
- `npm run test:e2e`
- `npm run test:e2e:security`
- `npm run test:e2e:a11y`

Prefer narrow validation first. Use broader checks only when the change is cross-cutting, high-risk, or explicitly requested.

### 6. Run the right validation and fix obvious regressions
After inspection, run the relevant checks and fix issues that are direct consequences of the generated code.

If a check fails, classify it:
- introduced by this change
- expected behavior change requiring test updates
- unrelated pre-existing issue
- environment/setup blocker

Re-run the narrowest failing check before escalating.

### 7. Check integration points, not just syntax
Generated code often “compiles” but still fails integration.
Confirm:
- imports resolve correctly
- route handlers use the expected request/response patterns
- new symbols are exported where needed
- new UI surfaces are wired into existing flows
- persistence/auth/state interactions match current architecture
- the change does not bypass existing safety/security boundaries

### 8. Apply completion gates
Before calling the task done, verify:
- code structure is clean
- validation is appropriate to the risk level
- any skipped tests are justified
- the result matches the original user request
- follow-up work is clearly separated from the completed change

### 9. Report completion clearly
End with:
- what was generated or changed
- what cleanup was needed
- what checks were run
- what passed
- what was intentionally not run and why
- any follow-up suggestions

## Decision Shortcuts

### If generation produced a small local change
Use type-check plus the smallest targeted test surface.

### If generation touched multiple layers
Treat it as integration work, not just code output.
Run broader validation.

### If generation changed auth, wallet, messaging, or trading behavior
Treat it as high risk and validate more deeply.

### If generation created tests too
Still inspect the generated tests for realism and alignment; passing weak tests are not proof.

## Example Requests

- `/codegen-completion-checklist review and finish a generated chart component`
- `/codegen-completion-checklist turn this AI-generated API route into a done-quality CTJ change`
- `/codegen-completion-checklist clean up and validate generated extension messaging code`
- `/codegen-completion-checklist complete a refactor across both CTJ repos`
