---
name: clarify-before-assume
description: Use when the user explicitly asks to avoid assumptions or drift, or when ambiguity could change architecture, APIs, schemas, business rules, integrations, destructive actions, user-visible behavior, or scope. Ask short blocking questions for contract-changing uncertainty; otherwise state working assumptions and continue while preserving documented architecture and code-quality constraints.
---

# Clarify Before Assume

Prevent silent drift without turning every task into a questionnaire. Ask when uncertainty changes the contract, risk, or meaning of the work. Otherwise make explicit local assumptions and continue.

## Blocking ambiguity

Ask the user before proceeding when ambiguity could change any of these:

- architectural boundaries, invariants, layering, ownership split, or whether code and docs must both change
- public or integration contracts: APIs, payloads, schemas, field semantics, migrations
- business behavior: rules, pricing, permissions, auth, security, user-visible behavior, acceptance criteria, scope
- destructive or production-facing operations: deploys, data handling, rollout targets, approval boundaries
- exact required metadata such as owner, assignee, milestone, or labels when the task depends on them

If any of the above is unclear, do not pick a plausible interpretation and continue silently.

## Non-blocking ambiguity

Proceed and state explicit `Working assumptions` when the uncertainty is all of the following:

- local to the current change
- reversible with low rework cost
- consistent with repo precedent
- not architecture- or contract-changing
- not destructive

Typical examples: helper names inside an established module, file placement where one pattern is dominant, test fixtures, small copy or naming choices, and internal implementation details behind unchanged behavior.

## Question rules

- Ask the minimum number of questions needed to unblock the work.
- Prefer one short grouped block over many scattered questions.
- Ask concrete questions, not broad invitations to restate the task.
- Briefly explain the blocking edge when it is not obvious.
- If the repo, ADRs, or architecture documents already define the answer, use them as the source of truth instead of asking.

## Response format

When blocked, start with:

```text
Blocking questions
- ...
- ...
```

Then wait for the answer.

When not blocked but assumptions remain, start with:

```text
Working assumptions
- ...
- ...
```

Then continue the work.

## Implementation discipline

- Preserve established architecture before introducing new patterns.
- Prefer small, explicit changes with clear names and single-purpose units.
- Reduce duplication when it improves clarity, but avoid speculative abstractions and incidental redesign.

## Drift guardrails

- Do not silently widen scope beyond the user request.
- Do not convert approved constraints into tentative assumptions.
- Do not bypass documented architectural invariants or ADR-level decisions by treating them as optional implementation details.
- Do not invent exact required values such as acceptance criteria, labels, owners, or milestones.
- Do not ask questions whose answers are already derivable from local context.
- If two readings are plausible and one would create materially different work, stop and ask.

## Trigger examples

This skill is a good fit for prompts such as:

- "If something is unclear, ask instead of guessing."
- "Do not make assumptions here; I want to avoid drift."
- "Preserve the architecture and keep the implementation clean."
