/**
 * TemplateResolver
 *
 * Handles area-of-effect template placement for NPC abilities.
 * When an action requires a template (burst, cone, line, emanation),
 * this module:
 *   1. Starts interactive placement — the template follows the cursor
 *   2. Waits for the GM to click to confirm position
 *   3. Returns all Token documents inside the placed template
 *   4. Cleans up the template after the pipeline finishes
 */

/** PF2e area types mapped to Foundry MeasuredTemplate types. */
const AREA_TYPE_MAP: Record<string, string> = {
  burst: "circle",
  emanation: "circle",
  cone: "cone",
  line: "ray",
};

export interface PlacedTemplateResult {
  templateId: string;
  tokens: TokenDocument[];
}

/**
 * Returns true if the given PF2e item has an area requirement.
 */
export function itemHasArea(item: Item): boolean {
  const area = (item.system as any)?.area;
  return !!(area?.type && area?.value > 0);
}

/**
 * Starts interactive template placement for the given item.
 * Resolves with the list of token documents inside the template once placed.
 * Rejects if the GM closes the scene or cancels (Escape).
 */
export function placeTemplate(item: Item): Promise<PlacedTemplateResult> {
  return new Promise((resolve, reject) => {
    const area = (item.system as any)?.area;
    if (!area?.type || !area?.value) {
      reject(new Error(`Item "${item.name}" has no area definition.`));
      return;
    }

    const foundryType = AREA_TYPE_MAP[area.type] ?? "circle";
    const distanceFeet: number = area.value;

    // PF2e exposes MeasuredTemplatePF2e.fromItem() which builds a correctly
    // configured template document from a spell or ability item, including
    // the right shape, colour, and attached item flags.
    // Fall back to building a plain template if that method is unavailable.
    let previewTemplate: any;
    try {
      previewTemplate = (MeasuredTemplateDocument as any).fromItem?.(item);
    } catch {
      previewTemplate = null;
    }

    if (!previewTemplate) {
      // Manual fallback: build a generic template document for the canvas layer
      previewTemplate = new MeasuredTemplateDocument(
        {
          type: foundryType,
          distance: distanceFeet,
          fillColor: game.user?.color ?? "#ff0000",
          flags: { "tabletop-toolkit": { sourceItemUuid: item.uuid } },
        },
        { parent: canvas.scene! }
      );
    }

    // drawPreview() attaches the template to the cursor and waits for a click.
    // It returns a Promise that resolves to the placed MeasuredTemplateDocument
    // once the GM confirms placement, or null if cancelled.
    const layer = canvas.templates;
    const previewObject = layer.preview?.addChild(
      new (previewTemplate.object?.constructor ?? CONFIG.MeasuredTemplate.objectClass)(previewTemplate)
    );

    if (previewObject && typeof (previewObject as any).drawPreview === "function") {
      // PF2e-style drawPreview (returns Promise<MeasuredTemplateDocument | null>)
      (previewObject as any)
        .drawPreview()
        .then(async (placed: MeasuredTemplateDocument | null) => {
          if (!placed) { reject(new Error("Template placement cancelled.")); return; }
          const tokens = getTokensInTemplate(placed);
          resolve({ templateId: placed.id!, tokens });
        })
        .catch(reject);
    } else {
      // Foundry core fallback: listen for the createMeasuredTemplate hook once.
      // We tag the template with a unique flag so we only react to our own.
      const tag = `tbtk-${Date.now()}`;
      previewTemplate.updateSource({ "flags.tabletop-toolkit.tag": tag });

      // Start the template placement tool
      canvas.templates.activate();

      const hookId = Hooks.once(
        "createMeasuredTemplate",
        (doc: MeasuredTemplateDocument) => {
          if (doc.flags?.["tabletop-toolkit"]?.tag !== tag) return;
          const tokens = getTokensInTemplate(doc);
          resolve({ templateId: doc.id!, tokens });
        }
      );

      // If the user presses Escape, clean up
      const escHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          Hooks.off("createMeasuredTemplate", hookId);
          window.removeEventListener("keydown", escHandler);
          reject(new Error("Template placement cancelled."));
        }
      };
      window.addEventListener("keydown", escHandler, { once: false });
    }
  });
}

/**
 * Returns all TokenDocuments whose center point falls inside a placed template.
 */
export function getTokensInTemplate(template: MeasuredTemplateDocument): TokenDocument[] {
  if (!canvas.tokens || !canvas.scene) return [];

  const templateObj = template.object as any;

  return canvas.tokens.placeables
    .filter((token) => {
      // PF2e exposes a containsPoint helper on the template object
      if (typeof templateObj?.containsPoint === "function") {
        return templateObj.containsPoint(token.center);
      }
      // Foundry core fallback: use the template's highlight bounds
      if (typeof templateObj?.shape?.contains === "function") {
        const local = {
          x: token.center.x - template.x,
          y: token.center.y - template.y,
        };
        return templateObj.shape.contains(local.x, local.y);
      }
      return false;
    })
    .map((t) => t.document);
}

/**
 * Deletes a placed template by ID (called after the pipeline finishes).
 */
export async function cleanupTemplate(templateId: string): Promise<void> {
  const template = canvas.scene?.templates.get(templateId);
  if (template) await template.delete();
}
