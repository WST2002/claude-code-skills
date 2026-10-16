# PRD template

````markdown
# <Feature name> — PRD

- Status: Draft | In review | Approved
- Owner: <name>
- Last updated: <date>

## 1. Summary

Two or three sentences: the problem, who has it, and what we will do about it.

## 2. Problem

- Who is affected and how often.
- What it costs users and the business.
- Evidence: <data, quotes, tickets, with source>.
- Assumption: <anything not backed by evidence, and how we will validate it>.

## 3. Goals and success metrics

| Goal | Metric | Baseline | Target | Time frame |
|---|---|---|---|---|

Guardrail metrics that must not get worse: <e.g. page load time, refund rate>.

## 4. Non-goals

- <What this release will not do.>

## 5. Users

| Persona | Job to be done | Priority |
|---|---|---|

## 6. Requirements

| ID | User story | Priority | Acceptance criteria |
|---|---|---|---|
| R1 | As a <user>, I want <capability> so that <outcome>. | Must | Given <context>, when <action>, then <observable result>. |

## 7. Edge cases

- Empty state, errors, permissions, limits, concurrency, slow or offline network, existing data.

## 8. Dependencies and risks

| Item | Type | Impact | Mitigation |
|---|---|---|---|

## 9. Rollout and measurement

- Release plan: <flag, beta group, percentage rollout>.
- Measurement: <dashboard, events to track, when we review>.
- Rollback trigger: <metric threshold or incident type>.

## 10. Open questions

| Question | Owner | Decide by |
|---|---|---|
````
