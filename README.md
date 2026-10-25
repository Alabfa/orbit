# Orbit / مدار

Static game: publish the project directory to HTTPS hosting, including GitHub
Pages at `/orbit/`. No server or runtime build service is required.

## Home-screen installation

- Android: the home screen's install button offers the browser's native prompt
  when available, and browser-menu instructions otherwise.
- iPhone/iPad: the same button explains Share → Add to Home Screen and the
  Open as Web App option. Safari does not expose the Android install-prompt API.
- Installed windows hide the install entry. No permanent installed flag is
  saved, so uninstalling does not leave the button permanently hidden.
- PNG home-screen icons are derived from `favicon.svg`, including a separate
  maskable Android icon and an opaque 180×180 Apple touch icon.

## Offline files and updates

After changing any app files, run:

```sh
node scripts/build-pwa.cjs
```

Commit/deploy the generated `manifest.webmanifest` and `sw.js` together with the
app, `icons/`, and `fonts/`. The build reads all displayed installation text from
`texts.js` and fingerprints the complete offline shell. Relative paths support
both a domain root and a GitHub Pages subdirectory.

The service worker downloads the entire shell before it becomes active. Open
the installed app online once to prepare offline play. Game rounds remain in
memory; closing/reloading still ends the current game.

Updates install in the background and wait until existing app windows close.
There is no forced reload during a game. Each release serves one consistent
cached set of files; caches belonging to other sites on the same origin are
untouched. Browser storage eviction can require another online visit.

Use HTTPS or a localhost HTTP server for testing. Service workers and native
install prompts are unavailable when opening `index.html` as a `file://` URL;
the game itself still works there.
