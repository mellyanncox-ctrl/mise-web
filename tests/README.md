# Tests

Headless Chromium, no network. Each file is standalone.

    npm i playwright
    node tests/sync-status-boot.mjs      # 10 — the boot window tells the truth
    node tests/sync-status-settle.mjs    #  7 — the status card settles by itself
    node tests/access-password.mjs       # 29 — email + password, and the merge guard

`executablePath` points at a local Chromium; change it if yours lives elsewhere.

## Two traps worth knowing before editing these

**Playwright routes apply in reverse registration order.** Register the
catch-all first and the specific override last, or the override never fires.
`sync-status-boot.mjs` depends on this: it *hangs* the Supabase CDN rather than
aborting it, because an abort settles in milliseconds and closes the very window
under test.

**The intro screen appears whenever `onboarded` is false, and that flag is not
part of the restored state slice** — so it can reappear after a reload and there
is no tab bar until it is dismissed. Every helper here tolerates both cases.
