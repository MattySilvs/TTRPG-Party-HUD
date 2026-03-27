import "../styles/module.scss";
import { registerSettings } from "./settings.js";
import { injectHud } from "./features/party-hud/PartyHud.js";
Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  injectHud();
});

// Re-render the HUD whenever any actor is updated (HP change, condition added, etc.)
Hooks.on("updateActor", (_actor: Actor, _diff: object, _options: object, _userId: string) => {
  (window as any).tabletopToolkit?.partyHud?.render();
});

// Re-render when active effects or embedded items change
// (covers condition and effect addition/removal in PF2e)
Hooks.on("createActiveEffect", () => (window as any).tabletopToolkit?.partyHud?.render());
Hooks.on("deleteActiveEffect", () => (window as any).tabletopToolkit?.partyHud?.render());
Hooks.on("createItem", () => (window as any).tabletopToolkit?.partyHud?.render());
Hooks.on("deleteItem", () => (window as any).tabletopToolkit?.partyHud?.render());
Hooks.on("updateItem", () => (window as any).tabletopToolkit?.partyHud?.render());
