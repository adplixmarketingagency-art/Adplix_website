# Portal design direction

Applied ui-ux-pro-max searches: internal SaaS task dashboard, accessible authentication error messages, responsive keyboard forms, category comparison bar charts. The first creative-agency search returned a marketing-storytelling pattern; it was rejected. The narrower dashboard search supports restrained surfaces, dense spacing, and low motion. Marketing hero/CTA patterns are not appropriate to this authenticated workspace.

- Adplix identity: warm off-white canvas, charcoal sidebar, vermilion action accent, actual existing logo. Do not change the public site's visual language.
- Portal typography: Geist with system fallbacks; headings compact, readable, no marketing-sized six-line headlines.
- Layout: persistent desktop sidebar, clear top bar, compact metrics strip, central task surface, secondary updates/notes. Mobile drawer plus stacked content, no horizontal document overflow.
- Spacing: 4/8px rhythm, 16–32px content gaps, consistent 44px minimum interactive targets.
- Colour: normal text >=4.5:1, visible focus ring; red overdue panels include text labels. States never rely on colour alone.
- Charts: directly labelled bars and trends with accessible data tables; show zero-data states, never fabricated production figures.
- Forms: real labels, password-manager autocomplete, paste allowed, retained values after failure, alert/live feedback, disabled pending submissions, confirmation on destructive account actions.
- Motion: small GSAP entrance transitions only, disabled for reduced motion. No scroll-pinned task tables or continuously animated dashboard.
- Data: authentic API loading/errors/empty states; no client-stored fake credentials, role switcher, or pretend successful writes.

Implementation approval: user requested direct portal implementation. No external design generation or source upload is needed for this local workflow.
