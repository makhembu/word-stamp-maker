# Stamp Maker — floating overlay stamps for Microsoft Word

A **modern Office Add-in** (task pane + Word JavaScript API) that lets you design rubber-stamp
style stamps — **APPROVED**, **CONFIDENTIAL**, **RECEIVED**, official seals, date stamps,
signature stamps, custom text — and drop them onto any Word document **without the stamp
pushing, reflowing, or rearranging the surrounding text**.

Stamps are inserted as **real floating Word shapes** wrapped *In Front of Text*. They behave
like a physical stamp pressed onto a printed page: they sit on top of paragraphs, tables,
images, and margins; you can drag, resize, and rotate them; and they stay with the document
when you save, close, print, or export to PDF — no external service is involved at any point.

---

## Requirements

| Requirement | Value |
|---|---|
| Word | **Desktop** Word for **Windows or Mac**, Microsoft 365 (current channel) |
| Office.js API set | `WordApiDesktop 1.2` (floating shapes) — **desktop only** |
| Not supported | Word for the web, Word 2013/2016/2019 perpetual, iPad |

The add-in checks support at startup and shows a friendly message instead of the UI when the
Shape API is unavailable.

> Why desktop-only? Floating shapes with text wrapping are part of the **WordApiDesktop**
> requirement set. Microsoft's docs state these APIs are production APIs on Word for Windows
> and Mac, and preview/unavailable elsewhere. This is a platform limitation, not something an
> add-in can work around.

---

## Quick start (development)

```bash
cd word-stamp-maker
npm install
npm run certs          # one-time: installs the localhost dev certificate (trust it if prompted)
```

Then, in **two terminals**:

```bash
# Terminal 1 — build + serve the task pane over https://localhost:3000
npm run dev-server

# Terminal 2 — register the add-in with Word and open Word
npm run start          # or: npm run start:desktop
```

Word opens with **Stamp Maker** available. In the ribbon, go to the **Home** tab → **Stamp
Maker** group → **Design Stamp**, or open it via *Insert → Add-ins → My Add-ins*.

Stop everything with `npm run stop`.

You can also preview all stamp designs without Word at all:

```bash
npm run smoke        # renders every design headlessly + writes sample-stamps.png
npm run gallery      # regenerates the 15 landing-page gallery PNGs (assets/gallery/)
```

Open `sample-stamps.png` to eyeball the built-in designs and edge cases.

### Manual sideloading (no CLI)

1. Run `npm run dev-server` and keep it running.
2. In Word: **File → Options → Trust Center → Trust Center Settings → Trusted Add-in
   Catalogs** → add `https://localhost:3000` as a **URL** catalog → OK, then restart Word.
3. **Insert → Add-ins → My Add-ins → Shared Folder** → **Stamp Maker**.

### Certificates

`npm run certs` (via `office-addin-dev-certs`) generates a self-signed certificate for
`localhost` in `%USERPROFILE%\.office-addin-dev-certs`. Add-ins require HTTPS; the dev server
uses that certificate automatically. If the task pane shows a certificate warning, install
the cert into *Trusted Root Certification Authorities* once.

### Production deployment

The build bakes the public URL into the manifest automatically. Set `BUILD_URL` and run
`npm run build` — the emitted `dist/manifest.xml` has every `https://localhost:3000`
rewritten to your origin, so the built folder is directly deployable.

```bash
BUILD_URL=https://yourname.github.io/stamp-maker npm run build
# dist/  ← task pane, landing page (index.html), icons, and a ready manifest.xml
```

If `BUILD_URL` is omitted, the build warns and keeps the localhost URLs (dev-only).

#### Option A — GitHub repo + GitHub Pages (recommended: hosting *and* discoverability)

The repo already ships with a Pages workflow (`.github/workflows/pages.yml`):

1. Create an empty GitHub repo, e.g. `word-stamp-maker`.
2. In this folder: `git init && git add . && git commit -m "Stamp Maker add-in"`
   and push to your repo (`git remote add origin <url> && git push -u origin main`).
3. GitHub → repo **Settings → Pages → Source: GitHub Actions**. The first push already
   ran the workflow and deployed.
4. Your add-in is live at `https://<username>.github.io/<repo>/` — the landing page,
   plus `manifest.xml` there for anyone to download and install.

That same workflow rebuilds and redeploys on every future push.

#### Option B — any static HTTPS host (no GitHub)

1. `BUILD_URL=https://your.host/path npm run build`
2. Upload the contents of `dist/` to any HTTPS host — Netlify (drag-and-drop on
   netlify.com), Cloudflare Pages, Vercel, Azure Static Web Apps, your own server.
3. Share `https://your.host/path/manifest.xml` with users.

#### Installing for end users (one click, no XML)

The Pages build also generates **`stamp-maker-setup.zip`** (`scripts/make-installer.mjs`
after `npm run build`), a download-only zip for regular users:

* **`install-windows.bat`** — registers the add-in in the Windows registry
  (`HKCU\Software\Microsoft\Office\Word\Addins\StampMaker`, `Manifest` = hosted URL,
  `LoadBehavior` = 3), so it appears in Word automatically.
* **`install-mac.command`** — copies the manifest into Word's wef folder
  (`~/Library/Containers/com.microsoft.Word/Data/Documents/wef`) so it shows under
  *Home → Add-ins*.
* **`README-SETUP.txt`** — plain-language guide with troubleshooting and uninstall steps.
* **`manifest.xml`** — kept in the zip only as a manual fallback.

Manual fallback (no installer):

* **Windows Word desktop:** *Insert → Add-ins → My Add-ins → Upload My Add-in* → pick
  the manifest file.
* **Mac Word desktop:** no upload button — copy the manifest into
  `~/Library/Containers/com.microsoft.Word/Data/Documents/wef` and restart Word.
* **Organization:** Microsoft 365 admin center → *Settings → Integrated apps* → upload
  the manifest and assign to users/groups (Centralized Deployment).

#### Search-engine visibility (GitHub route)

* Repo **Description** (shown in search results): `Free Word add-in for rubber stamps — APPROVED, CONFIDENTIAL, seals, date & signature stamps that overlay text without reflowing it. Install in Word: Insert → Add-ins → Upload My Add-in.`
* Repo **Topics**: `office-add-in`, `word-add-in`, `microsoft-word`, `office-js`, `typescript`, `rubber-stamp`, `stamp`, `word`.
* The landing page (`index.html`) already ships with title, description, Open Graph, Twitter cards, and JSON-LD structured data — it's indexed automatically via GitHub Pages.

---

## How stamp positioning works (no reflow)

The critical requirement — *zero text reflow* — is achieved natively, not by a hack:

1. **The add-in renders the stamp** (double borders, arcs, wavy dividers, ink color/opacity,
   fonts) on an HTML canvas in the task pane and exports a high-resolution transparent PNG.
2. **`range.insertPictureFromBase64(...)`** (WordApiDesktop 1.2) inserts the image as a
   **floating shape** — Word's "anchor" model, not inline content. The anchor is placed at
   the beginning of the paragraph containing the cursor, but the object itself is positioned
   independently.
3. **`shape.textWrap.type = "Front"`** — the Word equivalent of *In Front of Text*. Floating
   shapes with this wrapping occupy **no space in the text flow**: no paragraphs are added,
   no blank lines appear, paragraph spacing and page breaks are untouched, tables keep their
   dimensions, and nothing gets pushed to another page.
4. **Positioning** — a stamp inserted at the cursor is a normal floating Word drawing that
   you drag anywhere (margins, over tables, anywhere on the page). The API also supports
   absolute page positioning (`relativeHorizontalPosition/relativeVerticalPosition = Page`
   plus `top/left` in points), which the add-in uses internally to preserve a stamp's
   exact spot when you edit or duplicate it.
5. **After insertion it's a normal Word drawing**: drag it anywhere, resize with the corner
   handles, rotate with the rotation handle, or layer it over images and tables. Because it's
   a real Word object, it **persists in the .docx** — saving, reopening, printing, and
   exporting to PDF all keep it exactly where you put it.

Every inserted stamp is tagged (`shape.name = "StampMaker::<id>"` and the full design
parameters in `shape.altTextDescription`), which is how the **Stamps** tab can list, select,
edit, duplicate, and delete the stamps this add-in created.

---

## Using the add-in

### Design tab
1. **Choose a design** — APPROVED, REJECTED, CONFIDENTIAL, URGENT, PAID, RECEIVED, COPY,
   ORIGINAL (double circle), DRAFT, OFFICIAL SEAL, DATE, SIGNATURE, DIAGONAL, and CUSTOM.
2. **Text** — fixed designs use text, second line, date, reference number, department,
   and name fields as applicable. Date-bearing templates (RECEIVED, DATE, DRAFT,
   SIGNATURE) default to **"Today's date"**: the stamp re-stamps with the current date
   every time it is inserted, duplicated, or edited, so a RECEIVED stamp always shows
   the day it was actually applied. Untick "Today's date" to type a fixed date instead.
3. **CUSTOM builder** — the real design-your-own tool:
   - pick the outline **shape**: rectangle, rounded rectangle, circle, double circle,
     ellipse, diamond, hexagon, or octagon;
   - add **any number of text lines**, each with its own size, vertical position (0–96%),
     alignment, bold/italic/underline, and **letter spacing** (stretch or condense, in
     points — the classic official-seal look) — so you can build e.g. a two-line office
     stamp, a centered seal with small text around it, or a bordered box with text at the
     top and bottom, each line styled independently;
   - tick **Today** on any line to make it an auto date: it re-fills with the current
     date whenever the stamp is inserted or duplicated;
   - tick **"Wavy divider line"** to separate lines, and save the whole design with
     **Save design** — saved designs appear in the gallery (dashed chips) and in the
     custom section, ready to load, edit, and delete anytime (stored on this machine);
   - **share designs with the whole office**: **Export all** (or the export icon on a
     single saved design) downloads a small `.stamp` file, and **Import** loads one or
     more of those files — anyone else gets the exact same stamp, e.g. the OCS stamp
     built once and imported on every station machine (designs with the same name are
     updated, not duplicated);
4. **Style** — ink color (presets + custom picker), size (Small/Medium/Large/custom width),
   font, bold/italic/underline, alignment, border style (single/double), border thickness,
   opacity, rotation (or "Random tilt" for a hand-stamped look). Text-line sizes are set
   per block in the custom builder.
5. **Preview** updates live as you type.
6. **INSERT STAMP** — the stamp drops in at your cursor as a floating shape and is left
   selected, so you can drag it anywhere and rotate it with Word's rotation handle.

### Stamps tab
Lists every stamp this add-in created in the open document, with size, rotation, position,
and its wrap mode. Per stamp: **Select**, **Edit** (opens the Design tab pre-loaded; changes
apply in place, preserving position and rotation), **Duplicate** (creates an offset copy),
**Delete**.

### Test tab
Runs the automated in-Word test suite (below). It inserts and removes test stamps and
scaffolding; your document is left exactly as it was.

---

## Known Word API limitations

- **Desktop only.** Floating shapes are not available in Word for the web (`WordApiDesktop`
  requirement set). The add-in detects this and explains it instead of half-working.
- **No outline control on JS shapes.** `Word.Shape` exposes fill and text-wrap properties but
  not line/outline color or weight. That's why stamps are rendered as images on a canvas —
  it gives full control over borders, double rings, arcs, and ink texture. Downside: stamp
  text is part of the image, not selectable text. Editing a stamp re-renders and replaces it
  in place (position, size, and rotation are preserved).
- **Rotation is applied to the shape, not the pixels**, so a stamp can be un-rotated or
  re-rotated by dragging its rotation handle in Word, and the design stays crisp at any angle.
- **Selection of shapes isn't exposed** by the JS API (no selection events for floating
  objects), so editing uses the Stamps tab list rather than a "right-click" flow.
- **Headers/footers** aren't scanned by the Stamps list (stamps are inserted into the body).

---

## Test checklist

Automated (Test tab → **Run test suite**) — each asserts *the surrounding content did not
move*:

1. ✅ Stamp over a paragraph → paragraph count & body text unchanged; wrap = **Front**.
2. ✅ Stamp over a table → table dimensions and cell text unchanged.
3. ✅ Stamp on a long multi-page document (300 paragraphs) → no reflow.
4. ✅ Rotation is applied to the floating shape.
5. ✅ Metadata round-trips (stamps are editable later).
6. ✅ Design export/import round-trips through the .stamp file.
7. ✅ Design import accepts single/array files and rejects garbage.
8. ✅ Dynamic date re-fills with today's date.
9. ✅ Manual date is preserved when dynamic is off.
10. ✅ Custom auto-date block re-fills; other blocks untouched.
11. ✅ Dynamic-date stamp round-trips through Word carrying today's date.
12. ✅ Edit-in-place preserves position, stamp count, and updates text.
13. ✅ Duplicate creates an offset copy.
14. ✅ Delete removes only the targeted stamp.
15. ✅ Quick-position preset lands inside the page.

Manual checklist (do these once in Word):

- [ ] Insert a stamp over a paragraph mid-document → paragraph does not move; no blank line.
- [ ] Insert over a table → table rows/columns unchanged.
- [ ] Insert near a page boundary → page break does not shift.
- [ ] Drag the stamp anywhere (including into the margin) → text stays put.
- [ ] Resize and rotate the stamp → surrounding content unaffected.
- [ ] Save, close, reopen → stamp is exactly where you left it.
- [ ] Print / export to PDF → stamp prints at its on-screen position.
- [ ] Stamps tab → Select / Edit / Duplicate / Delete all work.
- [ ] Edit a stamp's text → position and rotation are preserved.
- [ ] Undo (Ctrl+Z) after an insert → the stamp disappears cleanly.

---

## Project structure

```
word-stamp-maker/
├── manifest.xml               # Office add-in manifest (Word, task pane, Home ribbon button)
├── package.json / webpack.config.js / tsconfig.json
├── scripts/gen-icons.mjs      # pure-Node PNG icon generator (no image deps)
├── assets/                    # generated icons (16/32/80)
└── src/
    ├── taskpane.html/.ts      # UI markup, styles, wiring, tabs, toasts
    ├── commands.html/.ts      # ribbon function file
    ├── core/
    │   ├── types.ts           # StampParams, RenderResult, StampRecord, QuickPosition
    │   ├── templates.ts       # 15 template definitions, colors, fonts, sizes
    │   ├── renderer.ts        # canvas stamp renderer → high-res transparent PNG
    │   └── document.ts        # insert/list/edit/duplicate/delete + page geometry
    └── test/suite.ts          # in-Word automated no-reflow test suite
```

## Troubleshooting

- **"Shape API not available"** — you're in Word for the web, an old perpetual Word, or iPad.
  Open the same document in the Word desktop app (Microsoft 365) and reopen the add-in.
- **Task pane won't load** — the dev server isn't running (`npm run dev-server`), or the
  dev certificate isn't trusted (`npm run certs`).
- **Stamp Maker missing from My Add-ins** — re-run `npm run start`, or sideload the manifest
  manually (see above).
- **Insert seems to do nothing** — check the toast at the bottom of the task pane; errors
  there include the exact Word message.
