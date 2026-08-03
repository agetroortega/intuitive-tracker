# Daily Log

A single-page habit and measurement tracker that installs to your Android home
screen as a PWA. No build step, no framework toolchain, no accounts, no server
component. Your data is stored in IndexedDB on the phone and never leaves it —
the only thing on the internet is the code.

## Files

```
index.html            markup + script tags
app.js                everything: state, storage, charts   ← the file you'll edit
styles.css            design tokens and layout
sw.js                 service worker (offline shell cache)
manifest.webmanifest  PWA metadata
vendor/               preact + hooks + htm, vendored so nothing loads from a CDN
icons/                192, 512, and a maskable 512
```

Total weight is about 40 KB. It works offline after the first load.

## Putting it online

GitHub Pages, one time:

1. Create a repo. Note that repo visibility and *site* visibility are separate:
   on the free plan, making the repo private unpublishes the Pages site
   entirely, and even on Pro (which does allow Pages from a private repo) the
   published site is still public. Truly private Pages needs Enterprise Cloud.
   None of that matters much here — the repo holds code, never data — but see
   "Making the URL private" below if you want the page itself gated.
2. Push these files to the root of the `main` branch.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
4. Wait ~60 seconds, then open `https://<user>.github.io/<repo>/` on your phone.

HTTPS is what makes the install prompt and service worker work, which is the
only reason a host is involved at all.

Netlify or Cloudflare Pages work identically — drag the folder into the deploy
box and you're done.

## Installing it

In Chrome on Android, open the URL → ⋮ menu → **Add to Home screen** → Install.
You'll get an icon, no address bar, and offline launch.

The first time it runs it asks the browser for persistent storage, which stops
Chrome from evicting your data when space runs low.

## Where the data lives

IndexedDB under the origin, with a localStorage copy as a fallback. That means:

- Uninstalling the PWA or clearing site data for that origin **deletes it**.
- Redeploying new code does **not** touch it — different storage.
- It does not sync between devices. One phone, one log.

So export periodically. **Export data** opens the Android share sheet (or drops
a `daily-log-YYYY-MM-DD.json` in Downloads if sharing isn't available). Put it
in Drive, or send it to yourself. **Import** merges a backup back in — days that
already exist on the device win, so importing an old file can't clobber recent
entries.

## Updating it

Edit `app.js`, push, and bump the cache version in `sw.js`:

```js
const CACHE = "daily-log-v2";   // was v1
```

Without that bump the service worker may serve the old file for a launch or two.
Your logged data survives updates untouched.

## Handing it back for changes

To get changes made: send `app.js` (and `styles.css` if the look is involved).
To get analysis: send the exported `.json`. The two are completely separate —
you never have to share your data to get a code change.

## Filling a day from a chat

You can have an agent (a Claude conversation, a script) produce a day's entry and
hand it to the app. Nothing is ever written silently — every route ends at a
confirmation screen showing each field, what it would replace, and Apply / Discard.

Three ways in:

1. **Share sheet.** Once installed, "Daily Log" appears in Android's share menu.
   Select the JSON in a chat, share it to the app.
2. **Link.** `https://YOUR-URL/#patch=<base64 of the JSON>` — tappable from
   anywhere, opens the installed app.
3. **Paste entry.** Button at the bottom of the app. Paste the JSON, tap Read it.

All three tolerate the JSON being wrapped in surrounding prose, so "here's your
day: {...}" works.

### Patch format

Paste this spec into a chat to get correctly-shaped output back:

```json
{
  "date": "2026-08-02",
  "weight": "181.4",
  "meals": [
    { "before": 4, "after": 2, "quality": 3, "note": "eggs and toast" },
    null,
    { "before": 5, "after": 3, "quality": 2 }
  ],
  "exercise": { "minutes": 30, "kind": "walk" },
  "custom": { "sleep": 7.5 }
}
```

- `date` is required and must be `YYYY-MM-DD`. Everything else is optional.
- `meals` is up to three entries, in order. Use `null` to skip one, or key it by
  name instead: `{"Meal 3": {"before": 5}}`.
- `before`, `after`, `quality` are 1–5 and get clamped to that range.
- `custom` keys that aren't fields yet are added automatically.
- Unknown keys are ignored rather than stored.

### How it merges

Field-level: only the fields the patch names are touched, and incoming values
win. Anything else already logged on that day is left alone. This is deliberately
different from **Import**, where whole days already in the app win — that one is
for restoring old backups without clobbering recent entries.

The confirmation screen strikes through any value being replaced, so an
overwrite is visible before you accept it.

## Notes on the data model

```jsonc
{
  "entries": {
    "2026-08-02": {
      "weight": "72.4",
      "meals": [ { "before": 3, "after": 5, "quality": 4, "note": "" } ],
      "exercise": { "minutes": "30", "kind": "run" },
      "custom": { "sleep hours": "7" }
    }
  },
  "fields": ["sleep hours"]
}
```

Days are local dates, so there's no timezone drift. Numbers are stored as
strings exactly as typed and coerced at read time — nothing is rounded or
normalised on the way in. The weight average is a trailing 7-day mean over the
days that actually have a weight, so skipped days don't drag it.

## Making the URL private

Worth separating two things:

- **Your data** is already private. It lives in IndexedDB on your phone. A
  stranger who guesses the URL gets a blank tracker with their own empty
  storage — there is nothing of yours on the server to see.
- **The page itself** is public by default. If you want the URL gated anyway,
  host on Cloudflare Pages and put Cloudflare Access in front of it (Zero Trust
  free tier, up to 50 users). Add a self-hosted application covering
  `*.your-project.pages.dev`, set the policy to *Emails* → your address, and
  enable One-time PIN as a login method. You then get an email-code prompt
  before the app loads. Set a long session duration (24h+) so it doesn't
  interrupt daily logging.

Neither protects against someone holding your unlocked phone. For that you want
the stored payload encrypted behind a passphrase, which is a change to `app.js`
rather than a hosting choice.
