---
name: design-review
description: Use when reviewing or critiquing a UI design, screen, mockup, wireframe, Figma frame or screenshot, asking "what's wrong with this design", "give me design feedback", a UX or heuristic review, checking visual hierarchy, consistency or usability before handoff.
---

# Design Review

## Overview

Give the feedback a senior designer would: what blocks the user from reaching their goal, why it matters, and the exact change that fixes it. Every finding points to a specific element on the screen and a principle, not to taste.

## Inputs

- The design: screenshots, exported frames, a Figma link (via the Figma MCP server if connected) or a live URL.
- Context, if given: who the users are, what the screen is for, the platform (web, iOS, Android), and the stage (wireframe, high fidelity, built).
- If the goal of the screen is unclear and the answer would change the review, ask once. Otherwise state your assumption and continue.

## Method

1. **Understand the screen.** Write one sentence each: who is here, what they came to do, and what the single primary action is.
2. **Five-second test.** From a first look: what stands out first, second and third? Is that the right order for the goal? Is the primary action obvious?
3. **Usability pass** with the heuristics below. For each problem, name the element and what the user will do wrong because of it.
4. **Visual pass:** hierarchy, alignment and grid, spacing rhythm, type scale, colour use, consistency between similar elements, density.
5. **Accessibility pass:** text and icon contrast, touch target size, text size, meaning carried only by colour, missing labels, focus and error states.
6. **Missing states:** empty, loading, error, partial data, very long text, first-time use, disabled, success.
7. **Report** using the format below, most severe first. Keep it to the 15 most useful findings.

## Usability heuristics

| Heuristic | Look for |
|---|---|
| Visibility of system status | No feedback after an action, no progress, unclear current step or page |
| Match with the real world | Internal jargon, unfamiliar icons without labels, illogical order |
| User control and freedom | No back, undo, cancel or close; destructive actions with no confirmation |
| Consistency and standards | The same thing looks or is named differently; platform conventions broken |
| Error prevention | Free text where a picker fits, no constraints, easy-to-hit destructive buttons |
| Recognition over recall | Users must remember information from a previous screen; hidden options |
| Flexibility and efficiency | No shortcuts or defaults for frequent tasks |
| Minimalist design | Competing calls to action, decoration that hides the content |
| Error recovery | Errors that do not say what went wrong or how to fix it |
| Help | No hint where a task is unfamiliar or high stakes |

## Accessibility thresholds

| Check | Threshold |
|---|---|
| Body text contrast | 4.5:1 (large text, 18px+ or 14px+ bold: 3:1) |
| Icons, borders of inputs, focus rings | 3:1 against what is next to them |
| Touch targets | 44×44 pt (iOS), 48×48 dp (Android), 24×24 px minimum on web |
| Body text size | 16px on web and mobile; nothing below 12px |
| Colour | Never the only way to show state, error or category |

Contrast read from a screenshot is an estimate: give the sampled hex values and say it is sampled. Use exact values when Figma or code provides them.

## Report format

```
## Design review: <screen name>

**Verdict:** <ready / ready after fixes / needs rework> — <one sentence why>
**Goal of this screen:** <who> wants to <do what>; primary action: <action>

### Fix these first
1. <the change with the biggest effect on the goal>
2. ...
3. ...

### Findings
| # | Severity | Where | Problem | Why it matters | Fix |
|---|---|---|---|---|---|
| 1 | Blocker | "Pay now" button, bottom of card | Grey on grey, sampled #9E9E9E on #BDBDBD ≈ 1.4:1 | Users with low vision cannot find the main action | Use the primary colour; reach 4.5:1 |

### Missing states
- <state>: <what the user sees today, what it should show>

### What works
- <2–3 specific things to keep, so they survive the next iteration>
```

Severity:
- **Blocker:** a user cannot complete the goal, or an accessibility failure.
- **Major:** the goal is slower, error-prone or confusing for many users.
- **Minor:** inconsistency or friction with an easy workaround.
- **Polish:** visual refinement with no effect on task success.

## Rules

- Point at the exact element ("the second filter chip", "the card title at 14px"), never "the layout feels off".
- Tie each finding to a user consequence. If you cannot name one, it is Polish or it is taste; leave taste out.
- Give a concrete fix: a value, a reorder, a copy change, a component swap. Show alternatives only when the trade-off is real.
- Respect the brand and the design system. Do not restyle the product to your preference.
- Never invent user research or analytics. "Users will..." is a prediction; say "likely" and what would confirm it.
- If several screens are given, review the flow between them too: steps that could be merged, dead ends, inconsistent patterns.

## Common mistakes

- A long list of nitpicks with the one blocker buried in the middle.
- "Increase contrast" without the colours, the ratio or the target.
- Reviewing only the happy path and never asking what an empty or error state looks like.
- Rewriting the design instead of improving it.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [More skills](https://github.com/WST2002/claude-code-skills)
