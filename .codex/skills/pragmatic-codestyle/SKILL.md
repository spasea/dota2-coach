---
name: pragmatic-codestyle
description: Apply when writing, refactoring, or testing code. Enforces clean, self-documenting code, immutable-first state management, composition over inheritance, DDD boundaries, and intent-driven testing while preventing over-engineering and premature abstraction.
---

# Pragmatic Codestyle

Write readable, predictable, and resilient code. Design implementations where the architecture is never more complex than the task itself. Balance domain-driven separation with logical locality, and ensure both code and tests focus on behavior and intent.

## Core Principles

### 1. Self-Documenting over "Ninja" Code

- **Readability over brevity:** Avoid clever "ninja" one-liners or overly dense, obscure method chaining (e.g., hard-to-read `map/filter/reduce` pipelines).
- **Balanced verbosity:** Do not split every single operation into a new line with obvious comments, but write code that reads like prose. Let well-named variables, functions, and types tell the story.
- **No noise:** Code must be clean and self-explanatory. Comments should explain _why_ something is done (if non-obvious), never _what_ is being done.

### 2. Immutable-First, Fail-Fast

- **Prefer Immutability:** Keep variables and data structures immutable by default. Avoid in-place mutations and state reassignments unless dealing with local, performance-critical hot paths.
- **Fail-Fast:** Validate inputs and preconditions immediately. Throw explicit errors or exit early the moment an invariant is violated, instead of letting invalid states propagate deeper.
- **Flat Control Flow:** Keep the happy path left-aligned and unindented. Let guards handle errors at the top, leaving the core business logic clean at the bottom.

### 3. Intent-Driven Architecture (DDD Conscious)

- **Proportional design:** The architecture must not be more complex than the problem it solves. Do not build abstractions, generic wrappers, or layers for "future-proofing."
- **Pragmatic abstractions:** Introduce interfaces and abstractions primarily to define strict architectural and domain boundaries (e.g., decoupling Domain contracts from Infrastructure implementations in DDD).
- **Locality of Reference:** Keep local, non-shared elements (like internal state types of a specific use-case or short-lived helper types) within the same file. Do not fragment the codebase by exporting them.

### 4. Intent-Driven Testing (TDD Mindset)

- **Test the "What", not the "How":** Focus on covering the developer's intent and business behavior (Intent Coverage), rather than chasing 100% synthetic line coverage.
- **Red-Green-Refactor Flow:** Define the expected behavior and failing state (Red), implement the simplest solution to make it pass (Green), and only then clean up the structure (Refactor).
- **Keep tests lightweight:** Avoid bloated mock setups or over-isolated unit tests if a simple integration-style test covers the actual intent more reliably.

## Anti-Patterns to Avoid (What NOT to Do)

- **Speculative Helper Extraction:** Do not extract code blocks into helper functions or separate utility files unless they are used **strictly 3 or more times** (Rule of Three). Keep local logic inline until then.
- **Deep Inheritance Trees:** Do not use class inheritance for code reuse. **Use composition exclusively.** Rely on function delegation, dependency injection, or trait/interface implementation instead.
- **File Over-Fragmentation:** Do not create separate files for small, internal-only types, interfaces, or helpers that are only used within a single component or use-case. Keep them local.
- **Misplaced Layered Components:** While keeping local types inline, do not violate DDD boundaries. Never put infrastructure details (like database queries) into domain interface files, and vice versa.
- **Redundant Interfaces:** Do not write interfaces for internal application services or local utilities that have only one concrete implementation and do not cross any architectural or boundary layers.

## Trigger Examples

This skill is a good fit for prompts such as:

- "Implement this feature and write tests for it."
- "Refactor this logic to make it more robust and readable."
- "Help me design the architecture for this new module."
- "Write a clean, testable implementation for this task."
