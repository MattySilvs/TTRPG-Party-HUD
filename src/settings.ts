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

}

export function getSetting<T>(key: string): T {
  return game.settings.get(MODULE_ID, key) as T;
}
