# AfriTalent Final Polish QA Checklist

Date: 2026-04-28

## Accessibility

| Area | Steps | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- |
| Skip link | Load any major page, press Tab once, press Enter on skip link | Focus moves to `main-content` | Ready for manual QA | Existing layout supports this globally |
| Focus visible | Tab through nav, CTAs, filters, cards, forms, save buttons | Clear green focus ring appears | Ready for manual QA | Global style added |
| Keyboard actions | Use Tab, Shift+Tab, Enter, Space on job cards and interview controls | No trap; controls are reachable | Ready for manual QA | Interview detail toggle has explicit button |
| Icon-only buttons | Inspect save/helpful controls | Accessible labels or pressed state present | Ready for manual QA | Job save button updated |
| Reduced motion | Enable reduced motion in OS/browser | Animations become minimal | Ready for manual QA | CSS fallback added |

## Browsers

| Browser | Pages | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- |
| Chrome | Home, Jobs, Salaries, Interviews, Learning, Dashboard | No layout breakage | Pending manual QA | Use desktop and mobile widths |
| Safari | Home, Jobs, Salaries, Interviews | Focus ring and cards render correctly | Pending manual QA | Watch Recharts sizing |
| Firefox | Jobs, Interviews, Salaries | Buttons and selects remain usable | Pending manual QA | Validate keyboard navigation |
| Edge | Home, Jobs, Dashboard | No interaction regressions | Pending manual QA | Validate CTA hover/focus |

## Mobile

| Device | Steps | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- |
| iPhone-sized | Browse home, jobs, salaries, interviews | Cards stack cleanly, buttons fit | Pending manual QA | Check fixed interview share button |
| Android-sized | Use filters and salary forms | Inputs are readable and tappable | Pending manual QA | Verify no horizontal overflow |
| Tablet | Browse card grids | Cards use 2-column layout where available | Pending manual QA | Verify skeleton layout |

## Product Workflows

| Flow | Steps | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- |
| Job save | Click save job twice quickly | Saved state toggles once per interaction and avoids rapid duplicate action | Ready for manual QA | Local UI state only |
| Interview helpful | Click Helpful on sample scenario | Count increments once and disables repeat vote locally | Ready for manual QA | Uses localStorage fallback |
| Salary guidance | Open Salaries page | Guidance is clearly labeled as market estimate/sample | Ready for manual QA | No fake reports on empty API |
| Homepage proof | Open Home page | No fake testimonials or fake fallback growth metrics | Ready for manual QA | Early-access proof block appears |
| Empty salary reports | Disable/empty salary API response | Page shows honest no-data state | Ready for manual QA | No mock top-paying report list |

## Known Limitations

- Manual screen-reader testing is still required.
- Real backend save-job persistence should be verified separately if implemented elsewhere.
- Salary charts still include educational sample distribution data and are labeled as such.
- Browser QA should be repeated after deployment because App Runner/CDN behavior can differ from local builds.
