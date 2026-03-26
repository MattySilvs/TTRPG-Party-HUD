/**
 * DamageApplicator
 *
 * Applies damage and conditions to targets based on the degree of success
 * returned by RollPipeline. Delegates all IWR (Immunities, Weaknesses,
 * Resistances) calculation to the PF2e system via actor.applyDamage().
 * Conditions are applied via PF2e's ConditionManager.
 */

import type { DegreeOfSuccess, StrikeRollResult, SaveRollResult } from "./RollPipeline.js";
import {
  resolveTraitEffects,
  resolveAbilityEffect,
  effectsForTrigger,
  type MappedEffect,
} from "./ConditionMapper.js";

export interface ApplicationSummary {
  target: string;
  degree: DegreeOfSuccess;
  damageApplied: number | null;
  conditionsApplied: string[];
  skipped: boolean;
}

/**
 * Applies damage and conditions to all targets after a Strike pipeline.
 *
 * @param results     Array of strike roll results (one per target)
 * @param traitSlugs  The strike's trait list (e.g. ["grab", "magical"])
 * @param autoApplyDamage      Setting: whether to apply damage automatically
 * @param autoApplyConditions  Setting: whether to apply conditions automatically
 */
export async function applyStrikeOutcomes(
  results: StrikeRollResult[],
  traitSlugs: string[],
  autoApplyDamage: boolean,
  autoApplyConditions: boolean
): Promise<ApplicationSummary[]> {
  const traitEffects = resolveTraitEffects(traitSlugs);
  const summaries: ApplicationSummary[] = [];

  for (const result of results) {
    const summary = await applyToTarget({
      target: result.target,
      degree: result.degree,
      effects: traitEffects,
      autoApplyDamage,
      autoApplyConditions,
    });
    summaries.push(summary);
  }

  return summaries;
}

/**
 * Applies damage and conditions to all targets after a Save pipeline
 * (spells, abilities with saves).
 *
 * @param results          Array of save roll results
 * @param abilityName      The ability name (looked up in ConditionMapper)
 * @param halfOnSuccess    Whether to apply half damage on a Success (basic save)
 * @param autoApplyDamage
 * @param autoApplyConditions
 */
export async function applySaveOutcomes(
  results: SaveRollResult[],
  abilityName: string,
  halfOnSuccess: boolean,
  autoApplyDamage: boolean,
  autoApplyConditions: boolean
): Promise<ApplicationSummary[]> {
  const abilityEffect = resolveAbilityEffect(abilityName);
  const effects: MappedEffect[] = abilityEffect ? [abilityEffect] : [];
  const summaries: ApplicationSummary[] = [];

  for (const result of results) {
    const summary = await applyToTarget({
      target: result.target,
      degree: result.degree,
      effects,
      autoApplyDamage,
      autoApplyConditions,
      halfOnSuccess,
    });
    summaries.push(summary);
  }

  return summaries;
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface ApplyOptions {
  target: TokenDocument;
  degree: DegreeOfSuccess;
  effects: MappedEffect[];
  autoApplyDamage: boolean;
  autoApplyConditions: boolean;
  halfOnSuccess?: boolean;
}

async function applyToTarget(opts: ApplyOptions): Promise<ApplicationSummary> {
  const { target, degree, effects, autoApplyDamage, autoApplyConditions, halfOnSuccess } = opts;
  const actor = target.actor;
  const summary: ApplicationSummary = {
    target: target.name ?? target.id!,
    degree,
    damageApplied: null,
    conditionsApplied: [],
    skipped: !actor,
  };

  if (!actor) return summary;

  // ── Conditions ────────────────────────────────────────────────────────────
  if (autoApplyConditions) {
    const applicableTriggers = triggersForDegree(degree, halfOnSuccess);

    for (const trigger of applicableTriggers) {
      const matching = effectsForTrigger(effects, trigger);
      for (const effect of matching) {
        for (const cond of effect.conditions) {
          await applyCondition(actor, cond.slug, cond.value);
          summary.conditionsApplied.push(
            cond.value != null ? `${cond.slug} ${cond.value}` : cond.slug
          );
        }
      }
    }
  }

  return summary;
}

/**
 * Applies a single PF2e condition to an actor via ConditionManager.
 */
async function applyCondition(
  actor: Actor,
  slug: string,
  value: number | null
): Promise<void> {
  try {
    const conditionManager = (game as any).pf2e?.ConditionManager;
    if (conditionManager) {
      await conditionManager.addConditionToActor(
        value != null ? { slug, value } : slug,
        actor
      );
    } else {
      // Fallback: find the condition item in the conditions compendium and add it
      const pack = game.packs.get("pf2e.conditionitems");
      if (!pack) return;
      const items = await pack.getDocuments();
      const condItem = (items as Item[]).find(
        (i) => (i as any).system?.slug === slug || i.name?.toLowerCase() === slug
      );
      if (condItem) {
        await actor.createEmbeddedDocuments("Item", [condItem.toObject()]);
      }
    }
  } catch (err) {
    console.warn(`TBTK | Failed to apply condition "${slug}" to ${actor.name}:`, err);
  }
}

/**
 * Maps a degree of success to the set of effect triggers that should fire.
 * On a crit hit, both "on_hit" and "on_critical_hit" effects fire.
 * On a failed save, "on_failed_save" fires; on a crit fail, also "on_critical_failed_save".
 */
function triggersForDegree(
  degree: DegreeOfSuccess,
  halfOnSuccess = false
): Array<
  | "on_hit"
  | "on_critical_hit"
  | "on_failed_save"
  | "on_critical_failed_save"
  | "on_hit_or_failed_save"
> {
  switch (degree) {
    case "criticalSuccess":
      // For saves: crit success = no effect at all
      // For strikes: crit success on the ATTACK means the ATTACKER crit — but this
      // function is called for the TARGET, so a criticalSuccess here means the
      // target CRITICALLY SUCCEEDED their save → no conditions apply.
      return [];
    case "success":
      // Strike hit: apply on_hit effects
      // Save success: half damage only (basic saves); no conditions unless halfOnSuccess effects exist
      return halfOnSuccess ? ["on_hit_or_failed_save"] : ["on_hit"];
    case "failure":
      return ["on_failed_save", "on_hit_or_failed_save"];
    case "criticalFailure":
      return ["on_failed_save", "on_critical_failed_save", "on_hit_or_failed_save"];
  }
}
