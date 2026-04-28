# AfriTalent Accessibility Notes

Date: 2026-04-28

## Implemented

- Global skip-to-content support is present through the root layout and targets `main-content`.
- Global `:focus-visible` styling now uses a consistent, high-contrast focus ring and soft outer ring.
- Buttons, links, inputs, selects, and textareas have consistent transitions without removing focus outlines.
- Disabled controls use reduced opacity and `not-allowed` cursor.
- Reduced-motion users receive minimized animation and transition behavior.
- Interview detail expansion now has an explicit keyboard-reachable button.
- Job save button exposes `aria-pressed` and action-specific aria labels.

## Manual QA Required

- Screen-reader spot check on Home, Jobs, Interviews, Salaries, Learning, and Candidate Dashboard.
- Keyboard-only navigation on modal/dialog flows.
- Color contrast spot check on badges, trust labels, warning states, and disabled buttons.
- Mobile keyboard behavior for forms on iOS Safari and Android Chrome.

## Accessibility Risk Register

- Some legacy card-level click handlers remain for mouse convenience; each critical action should also have a native button or link.
- Third-party chart rendering needs browser-level review for accessible alternatives.
- Form validation quality varies by page and should be standardized in a future pass.
