#!/bin/bash
# Double-click this to publish whatever is in this folder to your phone.
cd "$(dirname "$0")" || exit 1

# Claude works on this folder through a sandbox that can create git lock files
# but not remove them. A leftover lock makes every later git command fail with
# "Another git process seems to be running". This runs natively on your Mac,
# where deleting them is allowed — so clear them first, every time.
if ls .git/*.lock >/dev/null 2>&1; then
  echo "Clearing leftover git locks…"
  rm -f .git/*.lock
fi
rm -rf _gitlock_moved _to_delete

echo "Publishing Mise…"
git add -A
git commit -m "update" >/dev/null 2>&1 || echo "(nothing new to commit — publishing what's already committed)"
git push origin main || { echo; echo "Push failed — scroll up for the reason."; exit 1; }
echo
echo "Done. Give GitHub about a minute, then hard-refresh:"
echo "   https://mellyanncox-ctrl.github.io/mise-web/"
echo
echo "You can close this window."
