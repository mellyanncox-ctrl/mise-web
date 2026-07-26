#!/bin/bash
# Double-click this to publish whatever is in this folder to your phone.
cd "$(dirname "$0")" || exit 1
echo "Publishing Mise…"
git add -A
git commit -m "update" >/dev/null 2>&1 || echo "(nothing new to commit)"
git push origin main || { echo; echo "Push failed — scroll up for the reason."; }
echo
echo "Done. Give GitHub about a minute, then open:"
echo "   https://mellyanncox-ctrl.github.io/mise-web/"
echo
echo "You can close this window."
