---
name: bug-fix-regression-workflow
description: 'Fix bugs in the CTJ workspace with a reproduce-fix-prove workflow. Use when a defect, failing test, broken flow, or regression needs to be reproduced, isolated, fixed minimally, and validated with evidence so the bug is not only patched but proven resolved.'
argument-hint: 'Describe the bug, where it appears, and whether you already have a failing test or reproduction steps.'
user-invocable: true
---

# Bug-Fix Regression Workflow

Use this skill when the goal is not just to change code, but to **prove a bug is fixed**.

The workflow is:
**reproduce → isolate → fix → verify → widen regression confidence**

## When to Use

Use this skill when:
- a user reports broken behavior
- a test is failing and you need to fix the root cause
- a regression appeared after a refactor or generated change
- a UI flow works inconsistently
- auth, session, messaging, trading, charting, or extension behavior is broken

Use it across both repos:
- `crypto-futures-jn`
- `crypto-web3-extension`

## Required Outcome

A bug is not complete until you can show:
1. how it was reproduced
2. what caused it
3. what changed
4. what evidence proves the fix works

## Workflow

### 1. Capture the symptom precisely
Write down:
- where the bug happens
- expected behavior
- actual behavior
- whether it is deterministic or intermittent
- whether there is already a failing test, log, or stack trace

Avoid fixing a vague impression. Pin the defect down first.

### 2. Reproduce before editing
Prefer one of these forms of reproduction:
- existing failing automated test
- new regression test that fails first
- exact manual steps
- exact API request/response failure
- exact console/runtime error

If the issue cannot be reproduced, state that clearly and reduce uncertainty before patching.

### 3. Define the smallest broken surface
Classify the failure:
- pure logic
- component/UI behavior
- API/server behavior
- auth/session flow
- extension messaging/bridge flow
- build/config/versioning
- integration across layers

This tells you what to inspect and what tests matter.

### 4. Find the root cause, not just the symptom
Investigate the actual cause by checking:
- recent changes touching the same flow
- mismatch between contract and usage
- stale assumptions in tests
- bad guards, branching, or state transitions
- SSR-only vs browser-only execution issues
- missing validation, auth, or synchronization steps

If needed, add temporary logging or focused assertions to confirm the failure path.

### 5. Prefer a failing automated regression test when feasible
If the bug is testable, capture it with a test before or alongside the fix.
This is especially valuable for:
- pure logic
- API handlers
- hooks/components
- extension controllers/core modules
- previously regressed flows

If no automated test is practical, preserve a precise manual reproduction checklist.

### 6. Implement the minimal correct fix
Apply the smallest fix that addresses the root cause.
Avoid unrelated refactors unless they are necessary to make the fix safe or testable.

Good fixes are:
- specific
- easy to explain
- consistent with existing architecture
- safe against the same class of regression

### 7. Re-run the exact reproduction first
After the fix:
- re-run the failing test, if there is one
- or repeat the exact manual reproduction steps
- or repeat the exact API/message flow that previously failed

Do not widen validation before confirming the original failure is gone.

### 8. Add adjacent regression coverage
Once the original failure is fixed, broaden confidence based on risk.

#### Main app common checks
- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run test:vitest`
- `npm run validate`
- `cd engine && npm test`

#### Extension common checks
- `npm run type-check`
- `npm run lint`
- `npm run test:unit`
- `npm run validate`
- `npm run test:e2e`
- `npm run test:e2e:security`
- `npm run test:e2e:a11y`

Use E2E only for high-risk flows or when explicitly requested.

### 9. Prove the fix in plain language
Finish with a proof summary:
- bug reproduced by: ...
- root cause: ...
- fix applied: ...
- evidence: ...
- broader checks run: ...
- remaining risk or skipped checks: ...

## Decision Shortcuts

### If the bug already has a failing test
Start there. Make that test pass, then widen only as needed.

### If the bug is user-facing UI behavior
Capture exact reproduction steps, then validate with the smallest relevant test surface before considering E2E.

### If the bug touches auth, wallet, session, or extension messaging
Treat it as high-risk integration work.
Use targeted tests plus selective flow validation.

### If the bug is intermittent
Focus on narrowing conditions and collecting a repeatable signal before fixing.

### If the “fix” requires lots of unrelated edits
Pause and re-check whether the root cause has actually been identified.

## Quality Bar

A strong bug fix should:
- remove the real cause, not just hide the symptom
- preserve or improve regression coverage
- keep the patch as small as practical
- produce evidence the failure is gone
- explain any remaining uncertainty honestly

## Example Requests

- `/bug-fix-regression-workflow fix a failing auth flow and prove it no longer regresses`
- `/bug-fix-regression-workflow reproduce, fix, and validate a chart persistence bug`
- `/bug-fix-regression-workflow handle a broken extension message path with regression proof`
- `/bug-fix-regression-workflow turn this failing test into a verified fix`
