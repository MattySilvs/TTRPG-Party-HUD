/**
 * NpcAutopilot — Main Orchestrator
 *
 * Intercepts NPC action usage and runs the frictionless pipeline:
 *
 *   Click NPC action
 *     └─ Has area template?
 *         YES → TemplateResolver places it, captures targets, continues
 *         NO  → Use currently targeted tokens
 *     └─ Is it a Strike?
 *         → Roll attack vs each target's AC
 *         → On hit/crit: roll & apply damage, apply trait conditions
 *     └─ Is it a Save-based ability?
 *         → Roll save for each target vs ability DC
 *         → Apply damage/conditions per degree of success
 *
 * The only interruption is template placement for area abilities.
 * All other steps are automatic.
 *
 * Settings (world-scoped, GM only):
 *   autopilotEnabled        — master switch
 *   autoApplyDamage         — automatically apply damage to target HP
 *   autoApplyConditions     — automatically apply conditions to targets
 */

import { getSetting } from "../../settings.js";
import { itemHasArea, placeTemplate, cleanupTemplate } from "./TemplateResolver.js";
import {
  rollStrikeVsTargets,
  rollSavesForTargets,
  rollStrikeDamage,
  getNpcDC,
} from "./RollPipeline.js";
import {
  applyStrikeOutcomes,
  applySaveOutcomes,
  type ApplicationSummary,
} from "./DamageApplicator.js";

// ── Hook Registration ─────────────────────────────────────────────────────────

/**
 * Called from index.ts on the "ready" hook.
 * Registers all NPC Autopilot hooks.
 */
export function initAutopilot(): void {
  // Intercept NPC chat messages before they post.
  // PF2e posts a strike/spell action message with flags describing the item.
  // We catch it here, suppress it, and run our pipeline instead.
  Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
}

// ── Core Intercept ────────────────────────────────────────────────────────────

async function onPreCreateChatMessage(
  message: ChatMessage,
  _data: object,
  _options: object,
  _userId: string
): Promise<boolean | void> {
  if (!getSetting<boolean>("autopilotEnabled")) return;
  if (!(game.user?.isGM)) return;

  const flags = (message as any).flags?.pf2e;
  if (!flags) return;

  // Only intercept NPC actions — not PC rolls, not existing roll results
  const actorUuid: string | undefined = flags.origin?.actor;
  if (!actorUuid) return;

  const actor = await fromUuid<Actor>(actorUuid);
  if (!actor || actor.type !== "npc") return;

  const itemUuid: string | undefined = flags.origin?.uuid;
  if (!itemUuid) return;
  const item = await fromUuid<Item>(itemUuid);
  if (!item) return;

  // Determine action type from PF2e flags
  const actionType: string = flags.context?.type ?? "";
  const isStrike = actionType === "attack-roll" || item.type === "melee" || item.type === "ranged";
  const isSpell = item.type === "spell";
  const isAction = item.type === "action" || item.type === "feat";

  if (!isStrike && !isSpell && !isAction) return;

  // We're handling this — suppress the default message
  // Returning false from preCreate cancels document creation
  // (Note: we'll post our own summary message at the end)

  await runPipeline(actor, item, isStrike);
  return false;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline(actor: Actor, item: Item, isStrike: boolean): Promise<void> {
  const autoApplyDamage = getSetting<boolean>("autoApplyDamage");
  const autoApplyConditions = getSetting<boolean>("autoApplyConditions");

  // ── Step 1: Resolve targets ──────────────────────────────────────────────
  let targetTokens: TokenDocument[];
  let templateId: string | null = null;

  if (itemHasArea(item)) {
    // Area ability — show template, wait for GM to drop it, capture targets
    ui.notifications?.info(
      `TBTK | Place the template for "${item.name}", then click to confirm.`
    );
    try {
      const placed = await placeTemplate(item);
      targetTokens = placed.tokens;
      templateId = placed.templateId;

      if (targetTokens.length === 0) {
        ui.notifications?.warn("TBTK | No tokens were inside the template. Pipeline stopped.");
        if (templateId) await cleanupTemplate(templateId);
        return;
      }
    } catch (err: any) {
      ui.notifications?.warn(`TBTK | ${err.message ?? "Template placement cancelled."}`);
      return;
    }
  } else {
    // No template — use currently targeted tokens
    targetTokens = Array.from(game.user?.targets ?? []).map((t: any) => t.document as TokenDocument);

    if (targetTokens.length === 0) {
      ui.notifications?.warn(
        `TBTK | No targets selected. Target a token before using "${item.name}".`
      );
      return;
    }
  }

  // Filter to hostile / non-allied tokens only (exclude the NPC's own allies)
  // In PF2e, "friendly" disposition = 1, "neutral" = 0, "hostile" = -1
  // By default, allow all targeted tokens through and let the GM decide what they target
  const hostileTargets = targetTokens.filter((t) => {
    const disposition = t.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;
    // Allow anything that isn't the same actor as the attacker
    return t.actor?.id !== actor.id;
  });

  if (hostileTargets.length === 0) {
    ui.notifications?.warn("TBTK | All targets belong to the attacker. Nothing to do.");
    if (templateId) await cleanupTemplate(templateId);
    return;
  }

  // ── Step 2: Roll attacks or saves ────────────────────────────────────────
  let summaries: ApplicationSummary[] = [];

  if (isStrike) {
    await runStrikePipeline(
      actor, item, hostileTargets,
      autoApplyDamage, autoApplyConditions
    ).then((s) => { summaries = s; });
  } else {
    await runSavePipeline(
      actor, item, hostileTargets,
      autoApplyDamage, autoApplyConditions
    ).then((s) => { summaries = s; });
  }

  // ── Step 3: Post summary to chat ─────────────────────────────────────────
  if (summaries.length > 0) {
    await postSummaryMessage(actor, item, summaries);
  }

  // ── Step 4: Cleanup template if one was placed ───────────────────────────
  if (templateId) await cleanupTemplate(templateId);
}

// ── Strike Pipeline ───────────────────────────────────────────────────────────

async function runStrikePipeline(
  actor: Actor,
  item: Item,
  targets: TokenDocument[],
  autoApplyDamage: boolean,
  autoApplyConditions: boolean
): Promise<ApplicationSummary[]> {
  // Find the matching strike action on the actor
  const strikes: any[] = (actor as any).system?.actions ?? [];
  const strike = strikes.find(
    (s: any) =>
      s.item?.id === item.id ||
      s.label?.toLowerCase() === item.name?.toLowerCase()
  );

  if (!strike) {
    ui.notifications?.warn(`TBTK | Could not find strike data for "${item.name}" on ${actor.name}.`);
    return [];
  }

  // Roll attacks against each target
  const rollResults = await rollStrikeVsTargets(actor, strike, targets);

  // Roll and post damage for each hit/crit
  for (const result of rollResults) {
    if (result.degree === "success" || result.degree === "criticalSuccess") {
      await rollStrikeDamage(strike, result.degree);
    }
  }

  // Apply conditions based on traits
  const traitSlugs: string[] = (item as any).system?.traits?.value ?? [];
  return applyStrikeOutcomes(rollResults, traitSlugs, autoApplyDamage, autoApplyConditions);
}

// ── Save Pipeline ─────────────────────────────────────────────────────────────

async function runSavePipeline(
  actor: Actor,
  item: Item,
  targets: TokenDocument[],
  autoApplyDamage: boolean,
  autoApplyConditions: boolean
): Promise<ApplicationSummary[]> {
  const system = item.system as any;

  // Determine save type and DC
  const saveType: "fortitude" | "reflex" | "will" =
    system?.defense?.save?.statistic ??
    system?.save?.basic ??
    system?.save?.statistic ??
    "reflex";

  const dc: number =
    system?.spellcasting?.dc?.value ??
    system?.save?.dc ??
    getNpcDC(actor);

  const halfOnSuccess: boolean = system?.save?.basic === true;

  // Roll saves for all targets
  const rollResults = await rollSavesForTargets(saveType, dc, targets);

  // Apply conditions per save outcome
  return applySaveOutcomes(
    rollResults,
    item.name ?? "",
    halfOnSuccess,
    autoApplyDamage,
    autoApplyConditions
  );
}

// ── Chat Summary ──────────────────────────────────────────────────────────────

async function postSummaryMessage(
  actor: Actor,
  item: Item,
  summaries: ApplicationSummary[]
): Promise<void> {
  const lines = summaries.map((s) => {
    const degreeLabel: Record<string, string> = {
      criticalSuccess: "Critical Hit",
      success: "Hit",
      failure: "Miss",
      criticalFailure: "Critical Miss",
    };
    const conds =
      s.conditionsApplied.length > 0
        ? ` — Applied: ${s.conditionsApplied.join(", ")}`
        : "";
    return `<li><strong>${s.target}</strong>: ${degreeLabel[s.degree] ?? s.degree}${conds}</li>`;
  });

  const content = `
    <div class="tbtk-autopilot-summary">
      <h3>${actor.name} — ${item.name}</h3>
      <ul>${lines.join("")}</ul>
    </div>
  `;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { "tabletop-toolkit": { autopilotSummary: true } },
  });
}
