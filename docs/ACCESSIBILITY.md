# Accessibility

Darbak is built for people who find hospitals hardest to navigate: older patients, wheelchair users, people with low vision, and visitors who do not read the local language well. Accessibility is a requirement, not a mode.

## What is in place

**Getting around**

- Three mobility profiles. Wheelchair and stroller routes are computed on a graph with no stair edges, and a test checks every destination.
- Wheelchair users are told about the widest lift.
- One-tap routes to the nearest restroom, prayer room, water and exit.

**Seeing**

- Three text sizes (100%, 115%, 130%) that scale the whole interface, map labels included.
- A high-contrast theme (black, white, yellow) and a dark theme; the default follows the device.
- Text meets WCAG AA contrast in the light and dark themes. Colour never carries meaning alone: the destination has a pin, the current floor a dot, completed steps a tick.
- Pictograms on every place, step and button, each paired with a text label.

**Hearing and reading**

- Every step is spoken through the Web Speech API, preferring a Saudi (`ar-SA`) voice, with slow, normal and fast speeds and a Repeat button.
- Directions are short, verb-first sentences in everyday Saudi Arabic, with distances rounded to 5 m.
- Voice search, so nobody has to type an Arabic department name.

**Assistive technology**

- Semantic HTML: real buttons, links, headings, lists, `<dialog>`, labelled form fields.
- The current step sits in an `aria-live` region; page changes move focus to the page heading.
- Radio groups, switches, tabs and the progress bar use the matching ARIA roles and keyboard patterns (arrow keys in radio groups).
- Map rooms are keyboard-focusable buttons with a full name and floor, and every map has a list alternative beside it.
- A skip link and a visible focus ring everywhere.
- ESLint runs `eslint-plugin-jsx-a11y` in CI.

**Motor**

- Touch targets are at least 44 × 44 px; the main actions are 60 px tall and sit at the bottom of the screen.
- The screen stays awake during a route (Screen Wake Lock API), so nobody has to unlock the phone between steps.
- A short vibration confirms each step.
- `prefers-reduced-motion` turns off map animation and the route flow.

## Testing checklist for contributors

- [ ] Arabic (RTL) and English (LTR)
- [ ] Large text and extra-large text: nothing clipped or overlapping
- [ ] High contrast
- [ ] Keyboard only: every action reachable, focus always visible
- [ ] Screen reader (VoiceOver or TalkBack): the current step is announced
- [ ] 320 px wide screen: no horizontal scrolling
