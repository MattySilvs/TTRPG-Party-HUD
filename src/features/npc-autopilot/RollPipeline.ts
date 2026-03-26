/**
 * RollPipeline
 *
 * Executes attack rolls and saving throws for the NPC Autopilot pipeline.
 * Wraps PF2e's Check.roll() system and returns structured degree-of-success
 * results that DamageApplicator and ConditionMapper can consume.
 */

export type DegreeOfSuccess =
  | "criticalSuccess"
  | "success"
  | "failure"
  | "criticalFailure";

export interface StrikeRollResult {
  target: TokenDocument;
  degree: DegreeOfSuccess;
  total: number;
}

export interface SaveRollResult {
  target: TokenDocument;
  degree: DegreeOfSuccess;
  total: number;
}

/**
 * Rolls a strike attack against one or more targets and returns the
 * degree of success for each.
 *
 * @param actor    The NPC actor making the strike
 * @param strike   The strike action object from actor.system.actions
 * @param targets  Token documents to roll against
 * @param variant  MAP variant index (0 = no MAP, 1 = -5, 2 = -10)
 */
export async function rollStrikeVsTargets(
  actor: Actor,
  strike: any,
  targets: TokenDocument[],
  variant = 0
): Promise<StrikeRollResult[]> {
  const results: StrikeRollResult[] = [];

  for (const target of targets) {
    try {
      // PF2e strike variants: [0] = full attack, [1] = -5 MAP, [2] = -10 MAP
      const rollVariant = strike.variants?.[variant] ?? strike.variants?.[0];
      if (!rollVariant) continue;

      // Roll returns a Promise resolving to the resulting ChatMessage.
      // PF2e stores the outcome in the message flags.
      const message: ChatMessage | null = await rollVariant.roll({
        token: actor.getActiveTokens()[0] ?? null,
        target: target.object,
        skipDialog: true,
      });

      const outcome = extractOutcome(message);
      if (outcome) {
        results.push({ target, degree: outcome.degree, total: outcome.total });
      }
    } catch (err) {
      console.warn(`TBTK | Strike roll failed for target ${target.name}:`, err);
    }
  }

  return results;
}

/**
 * Prompts target actors to roll a saving throw against a given DC and
 * returns the degree of success for each.
 *
 * @param saveType  "fortitude" | "reflex" | "will"
 * @param dc        The DC to roll against
 * @param targets   Token documents whose actors will roll
 */
export async function rollSavesForTargets(
  saveType: "fortitude" | "reflex" | "will",
  dc: number,
  targets: TokenDocument[]
): Promise<SaveRollResult[]> {
  const results: SaveRollResult[] = [];

  for (const target of targets) {
    const targetActor = target.actor;
    if (!targetActor) continue;

    try {
      const save = (targetActor as any).saves?.[saveType];
      if (!save) continue;

      const message: ChatMessage | null = await save.roll({
        dc: { value: dc },
        skipDialog: true,
      });

      const outcome = extractOutcome(message);
      if (outcome) {
        results.push({ target, degree: outcome.degree, total: outcome.total });
      }
    } catch (err) {
      console.warn(`TBTK | Save roll failed for target ${target.name}:`, err);
    }
  }

  return results;
}

/**
 * Rolls damage for a strike based on degree of success, returning the
 * evaluated damage roll object.
 *
 * @param strike      PF2e strike action object
 * @param degree      Degree of success from the attack roll
 * @param mapBonus    Any MAP modifier already applied (informational only)
 */
export async function rollStrikeDamage(
  strike: any,
  degree: DegreeOfSuccess
): Promise<ChatMessage | null> {
  if (degree === "failure" || degree === "criticalFailure") return null;

  try {
    return await strike.damage({
      outcome: degree,
      skipDialog: true,
    });
  } catch (err) {
    console.warn("TBTK | Damage roll failed:", err);
    return null;
  }
}

/**
 * Extracts the degree-of-success outcome from a PF2e ChatMessage's flags.
 */
function extractOutcome(
  message: ChatMessage | null
): { degree: DegreeOfSuccess; total: number } | null {
  if (!message) return null;

  // PF2e stores outcome in flags.pf2e.context.outcome
  const flags = (message as any).flags?.pf2e;
  const outcome: string | undefined = flags?.context?.outcome;
  const total: number = flags?.context?.total ?? 0;

  if (!outcome) return null;

  // Map PF2e outcome strings to our DegreeOfSuccess type
  const map: Record<string, DegreeOfSuccess> = {
    criticalSuccess: "criticalSuccess",
    success: "success",
    failure: "failure",
    criticalFailure: "criticalFailure",
  };

  return map[outcome] ? { degree: map[outcome], total } : null;
}

/**
 * Returns the NPC's class DC or spell DC, used as the default DC for
 * abilities that don't specify one explicitly.
 */
export function getNpcDC(actor: Actor): number {
  const system = actor.system as any;
  // PF2e NPC class DC
  return system?.attributes?.classDC?.value ?? system?.details?.level?.value + 14 ?? 15;
}
