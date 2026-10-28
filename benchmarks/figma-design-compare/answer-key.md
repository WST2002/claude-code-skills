# figma-design-compare answer key

Figma: [Proffy Web, frame "Home"](https://www.figma.com/design/GHGS126t7WYjnPZdRKChJF/Proffy-Web?node-id=81-666) (node 81:666, 1440×820), by Rocketseat, MIT. The fixture is a static build of that frame. Before seeding, every box matched Figma within 2 px (logo, heading, illustration, both buttons, both icons, counter, heart).

10 seeded mismatches:

| # | Element | Property | Figma | Built | Where |
|---|---|---|---|---|---|
| 1 | Heading "Sua plaforma de estudos online." | font-size | 36px | 32px | styles.css `.intro h1` |
| 2 | Heading | color | #D4C2FF | #C1BCCC (hard-coded, not the token) | styles.css `.intro h1` |
| 3 | Heading | gap below logo | 8px | 24px (`margin-top`) | styles.css `.intro h1` |
| 4 | Buttons | font family | Archivo 700 | Poppins (bold) | styles.css `.button` |
| 5 | Buttons | border radius | 8px | 4px | styles.css `.button` |
| 6 | Buttons | gap between them | 16px | 24px | styles.css `.buttons` |
| 7 | Button icons | gap icon → label | 24px | 16px | styles.css `.button img` |
| 8 | "Estudar" button | background | #9871F5 | #916BEA (hard-coded, not the token) | styles.css `.button.study` |
| 9 | Counter text | font-size | 12px | 14px | styles.css `.connections` |
| 10 | Purple heart after the counter | missing element | present (14×12) | missing | index.html `.connections` |

Not a defect (decoy): the counter says "200" in the build and "285" in Figma. That is real data, not design.
