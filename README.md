# mise-web

Static host for the Mise web app. One self-contained HTML file — fonts embedded,
no build step, no dependencies to install.

Served at <https://mellyanncox-ctrl.github.io/mise-web/>

## No secrets live here

The file contains a Supabase **publishable** key. That key identifies the
project; it does not grant access. Row-level security decides what any signed-in
user can read or write, and the default is deny. Nothing else in here is
sensitive — which is why this repo can be public while the source repo stays
private.

## Deploying a change

Replace `index.html`, then:

```bash
git add -A && git commit -m "Update app" && git push
```

GitHub Pages redeploys in about a minute. Hard-refresh on the phone if the old
version lingers (Settings → Safari → Clear History, or just wait).
