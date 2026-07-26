# Tests

Headless Chromium, no network. Each file is standalone.

    npm i playwright
    node tests/sync-status-boot.mjs      # 10 — the boot window tells the truth
    node tests/sync-status-settle.mjs    #  7 — the status card settles by itself
    node tests/access-password.mjs       # 29 — email + password, and the merge guard
    node tests/desktop-and-signin.mjs    # 22 — the sign-in route, and desktop vs phone

68 assertions. `executablePath` points at a local Chromium; change it if yours
lives elsewhere.

## Traps worth knowing before editing these

**Playwright routes apply in reverse registration order.** Register the catch-all
first and the specific override last, or the override never fires.
`sync-status-boot.mjs` depends on this: it *hangs* the Supabase CDN rather than
aborting it, because an abort settles in milliseconds and closes the very window
under test.

**"A tab bar exists" does not mean "we are in the app."** Since the desktop rail
landed, the tab elements are rendered on every route and only hidden with CSS.
Any readiness check written as `querySelector('.tab')` will silently skip the
intro screen and fail several steps later. Poll for screen copy instead.

**The intro screen reappears whenever `onboarded` is false**, and that flag is not
part of the restored state slice — so it can come back after a reload even though
the recipes survived.

**Viewport matters now.** The desktop layer switches on at `min-width:1000px`, and
Playwright's default page is 1280×720 — i.e. desktop. Pass an explicit viewport
when you mean to test the phone.
