# TTRPG Party HUD

A lightweight [FoundryVTT](https://foundryvtt.com/) module for **Pathfinder 2e** that adds a persistent Party HUD panel — showing every party member's HP, resources, and conditions at a glance without opening character sheets.

![Party HUD screenshot placeholder](docs/screenshot.png)

## Features

- Floating panel showing all player-owned characters
- HP bar with numeric display for each member
- Primary resource bar (Focus points, spell slots, etc.)
- **Single-click** a member to toggle their active conditions inline
- **Double-click** a member to open their character sheet
- Configurable: GM can restrict players to HP-only view for other party members
- Auto-updates on any actor change (damage, healing, condition added/removed)

---

## Installation & Testing on Windows 11

### Prerequisites

Install the following before anything else:

1. **Node.js** (v18 or later) — https://nodejs.org/en/download
   During install, check "Automatically install necessary tools"
2. **Git** — https://git-scm.com/download/win
   Use all defaults during setup
3. **FoundryVTT** — installed and licensed on your machine

---

### Step 1 — Clone the repository

Open **PowerShell** or **Windows Terminal** and run:

```powershell
git clone https://github.com/MattySilvs/TTRPG-Party-HUD.git
cd TTRPG-Party-HUD
```

---

### Step 2 — Install dependencies and build

```powershell
npm install
npm run build
```

This produces the compiled output in the `dist/` folder.

---

### Step 3 — Link the module into FoundryVTT

Find your FoundryVTT user data folder. The default location on Windows is:

```
C:\Users\<YourName>\AppData\Local\FoundryVTT\Data\modules\
```

> Tip: You can also find it in Foundry → **Configuration** tab → **User Data Path**.

You have two options:

#### Option A — Symbolic link (recommended, no copying needed)

Run PowerShell **as Administrator** and substitute your actual paths:

```powershell
New-Item -ItemType SymbolicLink `
  -Path "C:\Users\<YourName>\AppData\Local\FoundryVTT\Data\modules\tabletop-toolkit" `
  -Target "C:\path\to\TTRPG-Party-HUD"
```

Now run `npm run dev` in the repo folder. Vite will watch for changes and rebuild automatically — just reload the Foundry world to pick up changes.

#### Option B — Copy the folder manually

Copy the entire `TTRPG-Party-HUD` folder into:

```
C:\Users\<YourName>\AppData\Local\FoundryVTT\Data\modules\tabletop-toolkit
```

You'll need to re-copy after each `npm run build`.

---

### Step 4 — Enable the module in Foundry

1. Launch FoundryVTT and open (or create) a **Pathfinder 2e** world
2. Go to **Settings → Manage Modules**
3. Find **Tabletop Toolkit** and enable it
4. Click **Save Module Settings** — the world will reload
5. The Party HUD panel should appear in the bottom-left corner of the canvas

---

### Step 5 — Testing checklist

| Test | Expected result |
|------|----------------|
| Open a PF2e world with player-owned characters | Party HUD panel appears bottom-left |
| Deal damage to a character via the token HUD | HP bar updates immediately, no refresh needed |
| Single-click a member row | Conditions section expands inline |
| Single-click again | Conditions section collapses |
| Double-click a member row | That character's sheet opens |
| Apply a condition to a character (e.g. Frightened 1) | Condition tag appears when row is expanded |
| Click the **–** button in the HUD header | Panel body collapses |
| Go to **Settings → Module Settings → Tabletop Toolkit** | "Enable Party HUD" and "Restrict player visibility" options are present |
| Toggle "Enable Party HUD" off | HUD disappears; toggle on brings it back |

---

## Development

```powershell
# Watch mode — rebuilds on save
npm run dev

# One-off production build
npm run build
```

Source files live in `src/`. The Handlebars template is in `templates/party-hud.hbs` and styles in `styles/module.scss`.

---

## Compatibility

| Foundry version | Status |
|----------------|--------|
| v13 | Verified |
| v12 | Minimum supported |

**System:** Pathfinder 2e (pf2e). D&D 5e and system-agnostic support planned for v0.2.

---

## License

MIT
