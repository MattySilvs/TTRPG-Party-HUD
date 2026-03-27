import { getSetting, MODULE_ID } from "../../settings.js";
import { getConditions, getEffects, getHP, getPrimaryResource } from "../../utils/system.js";

/** Tracks which actor rows have their conditions section expanded. */
const expandedActors = new Set<string>();

export class PartyHud extends Application {
  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tbtk-party-hud",
      template: `modules/${MODULE_ID}/templates/party-hud.hbs`,
      popOut: false,
      resizable: false,
    });
  }

  override getData(): Record<string, unknown> {
    const isGM = game.user?.isGM ?? false;
    const restrictToHpOnly = getSetting<boolean>("restrictToHpOnly");
    // Show full data if: user is GM, OR restriction setting is off (default)
    const showFullData = isGM || !restrictToHpOnly;

    const partyActors = this.getPartyActors();

    const members = partyActors.map((actor) => {
      const hp = getHP(actor);
      const hpPercent = hp.max > 0 ? Math.round((hp.value / hp.max) * 100) : 0;
      const resource = getPrimaryResource(actor);
      const resourcePercent =
        resource && resource.max > 0
          ? Math.round((resource.value / resource.max) * 100)
          : 0;

      return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        hp,
        hpPercent,
        resource,
        resourcePercent,
        conditions: getConditions(actor),
        effects: getEffects(actor),
        conditionsExpanded: expandedActors.has(actor.id!),
      };
    });

    return { members, showFullData };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // Collapse/expand the whole HUD
    html.find(".tbtk-hud-toggle").on("click", () => this.toggleBody(html));

    // Single-click a member row → toggle conditions inline
    // Double-click a member row → open their sheet
    html.find(".tbtk-member-row").on("click", (event) => {
      const actorId = $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string;
      if (!actorId) return;

      if (expandedActors.has(actorId)) {
        expandedActors.delete(actorId);
      } else {
        expandedActors.add(actorId);
      }
      this.render();
    });

    html.find(".tbtk-member-row").on("dblclick", (event) => {
      event.stopPropagation();
      const actorId = $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string;
      if (!actorId) return;
      const actor = game.actors?.get(actorId);
      actor?.sheet?.render(true);
    });

    // Right-click a condition tag → remove that condition from the actor
    html.find(".tbtk-condition-tag").on("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.removeEmbeddedItem(
        $(event.currentTarget).data("condition-id") as string,
        $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string,
        "condition"
      );
    });

    // Right-click an effect tag → remove that effect from the actor
    html.find(".tbtk-effect-tag").on("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.removeEmbeddedItem(
        $(event.currentTarget).data("effect-id") as string,
        $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string,
        "effect"
      );
    });
  }

  private removeEmbeddedItem(itemId: string, actorId: string, type: "condition" | "effect"): void {
    if (!itemId || !actorId) return;
    const actor = game.actors?.get(actorId);
    if (!actor) return;
    if (!actor.isOwner) {
      ui.notifications?.warn(`You don't have permission to modify this character's ${type}s.`);
      return;
    }
    actor.deleteEmbeddedDocuments("Item", [itemId]);
  }

  private toggleBody(html: JQuery): void {
    const body = html.find(".tbtk-hud-body");
    const btn = html.find(".tbtk-hud-toggle");
    const collapsed = body.is(":hidden");
    body.toggle();
    btn.html(collapsed ? "&#x2013;" : "&#xFF0B;");
  }

  /** Returns all player-owned PCs currently active in the game. */
  private getPartyActors(): Actor[] {
    return (
      (game.actors?.filter(
        (a) => a.hasPlayerOwner && a.type === "character"
      ) as Actor[]) ?? []
    );
  }

  override render(force?: boolean, options?: Partial<ApplicationOptions>): this {
    const enabled = getSetting<boolean>("hudEnabled");
    if (!enabled) return this;
    return super.render(force, options);
  }
}

/** Injects the HUD into #ui-bottom so it floats above the hotbar. */
export function injectHud(): void {
  const hud = new PartyHud();
  (window as any).tabletopToolkit ??= {};
  (window as any).tabletopToolkit.partyHud = hud;
  hud.render(true);

  // Inject into DOM after core UI renders
  Hooks.once("renderApplication", () => {});
}
