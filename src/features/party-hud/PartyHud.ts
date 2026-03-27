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

    // Left-click a condition tag → open its compendium sheet (rules text)
    html.find(".tbtk-condition-tag").on("click", (event) => {
      event.stopPropagation();
      const conditionId = $(event.currentTarget).data("condition-id") as string;
      const actorId = $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string;
      this.openItemSheet(conditionId, actorId, "pf2e.conditionitems");
    });

    // Left-click an effect tag → open its sheet (effect details)
    html.find(".tbtk-effect-tag").on("click", (event) => {
      event.stopPropagation();
      const effectId = $(event.currentTarget).data("effect-id") as string;
      const actorId = $(event.currentTarget).closest(".tbtk-member").data("actor-id") as string;
      this.openItemSheet(effectId, actorId, null);
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

  /**
   * Opens the sheet for a condition or effect.
   *
   * Strategy:
   *  1. Get the embedded item from the actor via itemId.
   *  2. If the item has a compendium sourceId flag, render that compendium
   *     entry — it has the full canonical rules text.
   *  3. If no sourceId (e.g. a custom effect), fall back to the actor's
   *     embedded item sheet.
   *  4. If fallbackPack is provided and steps 1-3 all fail, search that
   *     pack by name as a last resort (handles edge cases where the
   *     condition isn't embedded as an item).
   */
  private async openItemSheet(
    itemId: string,
    actorId: string,
    fallbackPack: string | null
  ): Promise<void> {
    if (!itemId || !actorId) return;

    const actor = game.actors?.get(actorId);
    const embeddedItem = actor?.items?.get(itemId);

    // Prefer the compendium source so the user sees the canonical entry
    const sourceId: string | undefined =
      embeddedItem?.flags?.core?.sourceId ?? embeddedItem?.flags?.pf2e?.rulesSelections;

    if (sourceId) {
      try {
        const compendiumDoc = await fromUuid(sourceId);
        if (compendiumDoc) {
          (compendiumDoc as any).sheet?.render(true);
          return;
        }
      } catch {
        // sourceId didn't resolve — fall through
      }
    }

    // Fall back to rendering the actor's embedded item directly
    if (embeddedItem) {
      embeddedItem.sheet?.render(true);
      return;
    }

    // Last resort: search the specified compendium pack by item name
    if (fallbackPack) {
      const pack = game.packs.get(fallbackPack);
      if (!pack) return;
      const index = await pack.getIndex();
      // Try to match by the text content of the tag (actor name not available here,
      // so we search the whole index for the best slug/name match)
      const itemName = embeddedItem?.name;
      if (!itemName) return;
      const entry = index.find(
        (e) => e.name.toLowerCase() === itemName.toLowerCase()
      );
      if (!entry) return;
      const doc = await pack.getDocument(entry._id);
      (doc as any)?.sheet?.render(true);
    }
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

  /**
   * Returns actors to display in the HUD.
   *
   * If a folder matching the configured "Party Folder Name" exists in the
   * Actors directory, only characters inside that folder are shown —
   * regardless of how many characters a player owns.
   *
   * If no matching folder is found, falls back to all player-owned characters
   * so the HUD is never unexpectedly empty.
   */
  private getPartyActors(): Actor[] {
    const folderName = getSetting<string>("partyFolderName").trim();

    const partyFolder = (game.folders?.contents ?? []).find(
      (f: any) => f.type === "Actor" && f.name.toLowerCase() === folderName.toLowerCase()
    );

    if (partyFolder) {
      return (game.actors?.filter(
        (a) => a.type === "character" && a.folderId === partyFolder.id
      ) as Actor[]) ?? [];
    }

    // Fallback: all player-owned characters
    return (game.actors?.filter(
      (a) => a.hasPlayerOwner && a.type === "character"
    ) as Actor[]) ?? [];
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
