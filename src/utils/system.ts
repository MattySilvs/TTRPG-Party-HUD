/** Returns true when the active game system is PF2e. */
export function isPF2e(): boolean {
  return game.system?.id === "pf2e";
}

/** Resolves HP data from an actor in a system-agnostic way. */
export function getHP(actor: Actor): { value: number; max: number } {
  const hp = (actor.system as any)?.attributes?.hp;
  return {
    value: hp?.value ?? 0,
    max: hp?.max ?? 1,
  };
}

/**
 * Returns the primary resource label and values for a PF2e actor.
 * Focus points for casters/monks, spell slots for prepared/spontaneous casters.
 * Returns null when no resource applies.
 */
export function getPrimaryResource(
  actor: Actor
): { label: string; value: number; max: number } | null {
  if (!isPF2e()) return null;

  const system = actor.system as any;

  // Focus pool
  const focus = system?.resources?.focus;
  if (focus?.max > 0) {
    return { label: "Focus", value: focus.value, max: focus.max };
  }

  // Highest available spell rank slot
  const spellcasting = system?.resources?.spellCasting;
  if (spellcasting) {
    return { label: "Spells", value: spellcasting.value, max: spellcasting.max };
  }

  return null;
}

export interface ConditionData {
  id: string;
  name: string;
  value: number | null;
}

/**
 * Returns active conditions for an actor, including the embedded item ID
 * needed to remove them programmatically.
 * Falls back to core Active Effects for non-PF2e systems.
 */
export function getConditions(actor: Actor): ConditionData[] {
  if (isPF2e()) {
    const conditions = (actor as any).conditions?.active ?? [];
    return conditions.map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
      value: (c.system?.value?.value as number) ?? null,
    }));
  }

  // Core fallback: read active effects that aren't suppressed
  return actor.effects
    .filter((e) => !e.disabled)
    .map((e) => ({ id: e.id!, name: e.name ?? (e as any).label ?? "", value: null }));
}
