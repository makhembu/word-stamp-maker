// Builds the "no XML required" installer bundle into dist/setup/.
//
// Reads the emitted dist/manifest.xml, extracts the real public origin
// (e.g. https://user.github.io/repo), and generates:
//   setup/install-windows.bat     - registers the add-in in the Windows registry
//   setup/uninstall-windows.bat   - removes that registration
//   setup/install-mac.command     - copies the manifest into Word's wef folder on macOS
//   setup/README-SETUP.txt        - plain-language setup guide
//   setup/manifest.xml            - copy of the built manifest (manual fallback)
//
// Usage: node scripts/make-installer.mjs   (run AFTER `npm run build`)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const outDir = join(dist, "setup");

const manifestPath = join(dist, "manifest.xml");
let manifest;
try {
  manifest = readFileSync(manifestPath, "utf8");
} catch {
  console.error("dist/manifest.xml not found. Run `npm run build` first.");
  process.exit(1);
}

// Extract the full public base including any sub-path (e.g. /user/repo on GitHub
// Pages), not just the hostname. We do this by finding the SourceLocation URL
// (always present — it points to the hosted taskpane.html) and stripping the
// filename, so https://host/repo/taskpane.html becomes https://host/repo.
const srcMatch = manifest.match(/SourceLocation\s+DefaultValue="(https:\/\/[^">]+)"/);
if (!srcMatch) {
  console.error("Could not find SourceLocation URL in dist/manifest.xml.");
  process.exit(1);
}
const base = srcMatch[1].replace(/\/[^\/]*$/, ""); // strip /taskpane.html
const manifestUrl = `${base}/manifest.xml`;

console.log(`Installer bundle will register: ${manifestUrl}`);

mkdirSync(outDir, { recursive: true });
copyFileSync(manifestPath, join(outDir, "manifest.xml"));

const windowsBat = `@echo off
setlocal
title Stamp Maker for Word - Installer
cd /d "%~dp0"

echo.
echo  ============================================================
echo    Stamp Maker  -  Microsoft Word add-in installer
echo  ============================================================
echo.
echo  This adds the "Stamp Maker" add-in to Microsoft Word on this
echo  computer (Word for Windows, Microsoft 365).
echo.
echo  Requirements:
echo    - Microsoft Word desktop (Microsoft 365 subscription)
echo    - Internet access the first time you open the add-in
echo.
echo  Tip: close Microsoft Word before continuing, then open it
echo  again after this finishes.
echo.
set /p GO=Press Enter to install, or close this window to cancel...

echo.
echo  Registering Stamp Maker with Word...
reg add "HKCU\\Software\\Microsoft\\Office\\Word\\Addins\\StampMaker" /v Manifest /t REG_SZ /d "${manifestUrl}" /f >nul
reg add "HKCU\\Software\\Microsoft\\Office\\Word\\Addins\\StampMaker" /v LoadBehavior /t REG_DWORD /d 3 /f >nul
reg add "HKCU\\Software\\Microsoft\\Office\\Word\\Addins\\StampMaker" /v FriendlyName /t REG_SZ /d "Stamp Maker" /f >nul
reg add "HKCU\\Software\\Microsoft\\Office\\Word\\Addins\\StampMaker" /v Description /t REG_SZ /d "Design and insert floating document stamps into Microsoft Word." /f >nul
if errorlevel 1 (
  echo.
  echo  Something went wrong writing the registration.
  echo  Try again by right-clicking this file and choosing
  echo  "Run as administrator".
  echo.
  pause
  exit /b 1
)

echo.
echo  Done!  Stamp Maker is installed.
echo.
echo  Next steps:
echo    1. Open Microsoft Word (close it first if it was open).
echo    2. On the Home tab you will see a "Stamp Maker" group with
echo       a "Design Stamp" button.
echo    3. No button? Open Word, then go to:
echo         Insert  -  Add-ins  -  My Add-ins
echo       and choose "Stamp Maker" from the list.
echo.
pause
`;

const uninstallBat = `@echo off
setlocal
title Stamp Maker for Word - Uninstaller
echo.
echo  This removes the Stamp Maker add-in from Microsoft Word.
echo.
set /p GO=Press Enter to uninstall, or close this window to cancel...
reg delete "HKCU\\Software\\Microsoft\\Office\\Word\\Addins\\StampMaker" /f >nul 2>&1
echo.
echo  Done. Stamp Maker has been removed from Word.
echo  (Close and reopen Word to finish.)
echo.
pause
`;

const macCommand = `#!/bin/bash
# Stamp Maker - Microsoft Word add-in installer (macOS)
cd "$(dirname "$0")"

echo ""
echo "============================================================"
echo "  Stamp Maker  -  Microsoft Word add-in installer"
echo "============================================================"
echo ""
echo "  This adds the Stamp Maker add-in to Microsoft Word on this"
echo "  Mac (Word for Mac, Microsoft 365)."
echo ""
echo "  Tip: close Microsoft Word before continuing, then open it"
echo "  again after this finishes."
echo ""
read -p "Press Enter to install, or close this window to cancel... "

WEF_DIR="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
mkdir -p "$WEF_DIR"
cp manifest.xml "$WEF_DIR/stamp-maker.xml"

echo ""
echo "  Done!  Stamp Maker is installed."
echo ""
echo "  Next steps:"
echo "    1. Open Microsoft Word (close it first if it was open)."
echo "    2. Open a document, then click:"
echo "         Home  -  Add-ins"
echo "    3. Choose Stamp Maker from the menu."
echo ""
read -p "Press Enter to close... "
`;

const readme = `STAMP MAKER - Setup guide
=========================

Stamp Maker is a Microsoft Word add-in (a small program that runs
inside Word). This folder adds it to Word on this computer in one
step. You never need to touch the XML manifest file.

WHAT IS IN THIS FOLDER
  - install-windows.bat    Windows installer (double-click it)
  - install-mac.command    Mac installer (double-click it)
  - uninstall-windows.bat  Windows uninstaller (optional)
  - manifest.xml           the add-in manifest, kept here only as a
                           manual fallback (you normally don't need it)

------------------------------------------------------------
WINDOWS  (Word desktop, Microsoft 365)
------------------------------------------------------------
  1. Close Microsoft Word.
  2. Double-click "install-windows.bat".
  3. Press Enter when asked.
  4. Open Word. On the Home tab you will see a "Stamp Maker"
     group with a "Design Stamp" button.

------------------------------------------------------------
MAC  (Word for Mac, Microsoft 365)
------------------------------------------------------------
  1. Close Microsoft Word.
  2. Right-click "install-mac.command" and choose Open.
     (The first time, macOS asks to confirm: right-click the file,
     choose Open, then click Open again.)
  3. Press Enter when asked.
  4. Open Word and open a document, then click:
       Home  -  Add-ins
     and choose Stamp Maker.

------------------------------------------------------------
HOW TO USE IT
------------------------------------------------------------
  Click "Design Stamp" inside Word. Pick a design (APPROVED,
  CONFIDENTIAL, official seal, date stamp, custom, ...), type your
  text, and click INSERT STAMP. The stamp appears as a floating
  image you can drag, resize, and rotate. It sits ON TOP of your
  text without moving or reflowing it.

------------------------------------------------------------
TROUBLESHOOTING
------------------------------------------------------------
  - Nothing appears in Word? Close Word completely (all windows)
    and reopen it. The add-in loads when Word starts.
  - Still nothing? Install manually: in Word go to
      Insert  -  Add-ins  -  My Add-ins  -  Upload My Add-in
    and choose the "manifest.xml" file from this folder.
  - Using Word for the web, iPad, or an older perpetual Word
    (2013/2016/2019)? The add-in needs Word desktop with a
    Microsoft 365 subscription. It shows a clear message there.

------------------------------------------------------------
UNINSTALL
------------------------------------------------------------
  Windows: double-click "uninstall-windows.bat".
  Mac: delete the file
    ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/stamp-maker.xml
  Then close and reopen Word.
`;

const files = {
  "install-windows.bat": windowsBat,
  "uninstall-windows.bat": uninstallBat,
  "install-mac.command": macCommand,
  "README-SETUP.txt": readme,
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content, { mode: 0o755 });
}
chmodSync(join(outDir, "install-mac.command"), 0o755);

console.log("Wrote dist/setup/:");
for (const name of Object.keys(files)) console.log(`  setup/${name}`);
console.log("  setup/manifest.xml");
