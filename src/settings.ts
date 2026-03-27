export const MODULE_ID = "tabletop-toolkit";

export function registerSettings(): void {
  game.settings.register(MODULE_ID, "hudEnabled", {
    name: "TBTK.Settings.HudEnabled.Name",
    hint: "TBTK.Settings.HudEnabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      if (value) {
        window.tabletopToolkit?.partyHud?.render(true);
      } else {
        window.tabletopToolkit?.partyHud?.close();
      }
    },
  });

  game.settings.register(MODULE_ID, "restrictToHpOnly", {
    name: "TBTK.Settings.RestrictToHpOnly.Name",
    hint: "TBTK.Settings.RestrictToHpOnly.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => window.tabletopToolkit?.partyHud?.render(),
  });

  // ── NPC Autopilot ─────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, "autopilotEnabled", {
    name: "TBTK.Settings.AutopilotEnabled.Name",
    hint: "TBTK.Settings.AutopilotEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "autoApplyDamage", {
    name: "TBTK.Settings.AutoApplyDamage.Name",
    hint: "TBTK.Settings.AutoApplyDamage.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "autoApplyConditions", {
    name: "TBTK.Settings.AutoApplyConditions.Name",
    hint: "TBTK.Settings.AutoApplyConditions.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

export function getSetting<T>(key: string): T {
  return game.settings.get(MODULE_ID, key) as T;
}
