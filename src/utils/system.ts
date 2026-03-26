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

/**
 * Returns active condition names for a PF2e actor.
 * Falls back to core Active Effects for non-PF2e systems.
 */
export function getConditions(actor: Actor): { name: string; value: number | null }[] {
  if (isPF2e()) {
    const conditions = (actor as any).conditions?.active ?? [];
    return conditions.map((c: any) => ({
      name: c.name,
      value: c.system?.value?.value ?? null,
    }));
  }

  // Core fallback: read active effects that aren't suppressed
  return actor.effects
    .filter((e) => !e.disabled)
    .map((e) => ({ name: e.name ?? e.label, value: null }));
}
