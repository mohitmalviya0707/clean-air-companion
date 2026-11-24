# 🌫️ Clean Air Companion

A GenAI-powered assistant that helps families and communities get through severe winter smog. Given a household's AQI reading, location, commute, cooking and heating, and who lives there, it suggests **low-emission daily routines**, **indoor air quality hacks** and **sustainable alternatives**, and explains the **direct impact** of every choice.

## Problem statement alignment
| Requirement | How it is met |
|---|---|
| Low-emission daily routines | Time-of-day, commute and activity advice that changes with AQI and household (`buildPlan`) |
| Indoor air quality hacks | Filtration, sealing, ventilation timing, cleaning and cooking tips |
| Sustainable alternatives | Clean cooking/heating, transit, plus community actions (street pledges, reporting burning) |
| Tailored to location and lifestyle | City, AQI band, vulnerable members, commute, fuel, home type; the AI prompt also uses city and season |
| Explains direct impact | Every item has a reason and an impact estimate, and an interactive exposure simulator compares your choices |
| GenAI | Claude personalises the plan through a server-side function; the rule-based plan is the offline fallback |

## Architecture
```
index.html        semantic page, strict CSP
src/engine.js     pure logic: validation, rules, impact model (shared by UI, API, tests)
src/prompt.js     builds the model prompt from validated data only
src/validate.js   validates and bounds model output
src/app.js        DOM wiring (textContent only, no innerHTML)
api/plan.js       serverless endpoint (Vercel); holds the API key
tests/            node:test unit and API tests (zero dependencies)
```

## Security
- The API key lives only in a server environment variable; the browser never sees it.
- The client sends a **structured profile, not a prompt**. The server re-validates it with allowlists, strips unexpected characters from free text, and builds the prompt itself. The prompt marks user data as data to resist prompt injection.
- Model output is parsed, length-capped and shape-checked before use, and rendered with `textContent` (no XSS sink).
- Per-IP rate limiting (in-memory, best effort), request timeout, generic error messages, `no-store` caching, CORS closed unless `ALLOWED_ORIGIN` is set.
- Strict Content-Security-Policy (meta tag and `vercel.json`), plus `nosniff`, `no-referrer` and a restrictive Permissions-Policy.
- No cookies, no analytics, no storage. Nothing the user enters is saved.

## Accessibility
Skip link, semantic landmarks and headings, labelled inputs, grouped checkboxes in `fieldset/legend`, error text tied with `aria-describedby` and `role="alert"`, live status messages, focus moved to the results heading, 44 px touch targets, visible focus rings, light and dark themes, reduced-motion support, and AQI shown as text as well as colour. Built to follow WCAG 2.1 AA practices; not formally audited.

## Efficiency
No framework, no build step, no runtime dependencies. About 20 KB total, native ES modules, one network call only when the user asks for AI.

## Testing
```bash
npm test      # Node 20+, no installs needed
```
15 tests cover AQI boundaries, input sanitisation and injection attempts, tailoring rules, the impact model, API validation, rate limiting, CORS, error hiding and AI output validation. CI runs them on Node 20 and 22 (`.github/workflows/ci.yml`).

## Run and deploy
- Local: `npm start`, then open http://localhost:8080 (the built-in plan works without AI).
- With AI: import the repo into Vercel and set `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, `ALLOWED_ORIGIN`).
- GitHub Pages: the page works, but the AI button needs the Vercel function. Set `data-endpoint` on the AI button to the full function URL, add that origin to `connect-src` in the CSP, and set `ALLOWED_ORIGIN` to your Pages URL.

## Limitations
AQI is entered manually (no live feed). Impact figures are rough, typical ranges rather than measurements. This is general guidance, not medical advice.

## License
MIT
# clean-air-companion
