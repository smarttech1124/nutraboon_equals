# Accessibility

Nutraboom Equals is built first for people who are often left out of nutrition services: Deaf and hard-of-hearing people, blind and low-vision people, and anyone facing barriers of cost, literacy, language or distance. Accessibility is a product requirement, checked on every change, not a feature of one page (ADR-076).

**Target: WCAG 2.2 Level AA** for the main site, the assistant, the portals and n-equals.

## Language and respect

- Say "Deaf people", "hard-of-hearing people", "blind people", "people with low vision", "disabled people" or "people with disabilities", as the person prefers. Avoid "the deaf", "the blind", "suffering from", "confined to a wheelchair".
- Do not treat disabled people as one group. A Deaf sign-language user, a hard-of-hearing person who lip-reads and a deafblind person need different things; offer choices instead of assumptions. Hospital bookings ask what would help ("I prefer to communicate by text", "Please read information aloud"), and the profile lets people save those choices.
- Never put important information in audio only. Every spoken reply is also text; spoken input is always shown as text before sending.

## How the code meets it

| Area               | What we do                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | One `h1` per page, headings in order, landmarks (`header`, `nav` with labels, `main id="main"`, `footer`), a "Skip to content" link on every main-site page                                         |
| Names and images   | Every button, link, input and icon-only control has an accessible name. Informative images have alt text (the logo: "Nutraboom Equals"); decorative shapes and icons are `aria-hidden`              |
| Forms              | Visible labels, hints and errors linked with `aria-describedby`, `aria-invalid` on fields with errors, results announced (`role="status"` or `role="alert"`) and focused after submit               |
| Dynamic content    | Chat and hospital conversations are `aria-live` lists; loading states use `role="status"`; urgent notices use `role="alert"`                                                                        |
| Keyboard           | Everything works with the keyboard; dialogs (the assistant) trap focus while open, make the page behind inert and return focus to the opener; menus close with Escape; no hover-only content        |
| Focus              | A 3 px focus ring in a dedicated `--focus` colour with at least 3:1 contrast on every background                                                                                                    |
| Colour             | All text pairs meet AA contrast in light and dark mode (checked when the palette was chosen, ADR-070); state is never shown by colour alone (badges have text, the current page has `aria-current`) |
| Zoom and text size | Layouts reflow to 320 px wide and to 200% text size without horizontal scrolling; no fixed heights on text containers                                                                               |
| Motion             | Animations respect `prefers-reduced-motion`; no flashing; the hero animation plays once                                                                                                             |
| Voice              | Browser speech input with a review step, replies read aloud on request, never autoplayed (ADR-069)                                                                                                  |
| Sign language      | Demonstration only (ADR-077): sample videos labelled as not translating the reply, which always stays as text. Real translation plan: `docs/signapse-integration.md` (ADR-073)                      |
| Media              | Any future prerecorded audio or video needs captions and a transcript                                                                                                                               |

## Automated checks

- `npm test` runs axe-core on the home page, the assistant, the About page, the site header and footer, the hospital conversation and other UI tests (`tests/ui`). Colour contrast is checked by hand because jsdom cannot render colour.
- Header, menu and session-state behaviour have their own tests (`tests/ui/site.test.tsx`).
- Add an axe check to the UI test of any new page or interactive component.

## Manual checks before each release

1. **Keyboard only:** every journey (chat, sign up and log in, Meal Planner, booking a hospital, requesting a nutritionist session, account dashboard, profile) without a mouse; focus always visible and in a logical order.
2. **Screen readers:** NVDA with Firefox and Chrome on Windows; VoiceOver with Safari on iPhone; TalkBack with Chrome on Android. Check headings, landmarks, form errors and live chat replies.
3. **Zoom:** 200% browser zoom and 320 px width on the same journeys.
4. **Reduced motion and dark mode:** set the operating system preferences and recheck the home page.
5. **People:** test with Deaf, hard-of-hearing, blind and low-vision users in Nigeria, on the phones and networks they use. Automated checks cannot replace this.
