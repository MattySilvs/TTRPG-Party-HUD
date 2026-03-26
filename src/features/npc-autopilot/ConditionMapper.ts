import LOOKUP from "./pf2e-condition-lookup.json" assert { type: "json" };

export type Trigger =
  | "on_hit"
  | "on_critical_hit"
  | "on_failed_save"
  | "on_critical_failed_save"
  | "on_hit_or_failed_save"
  | "start_of_turn"
  | "end_of_turn"
  | "aura_enter_or_start_turn"
  | "passive"
  | "reaction"
  | "on_death";

export interface ConditionEffect {
  slug: string;
  value: number | null;
}

export interface MappedEffect {
  trigger: Trigger;
  conditions: ConditionEffect[];
  save: { type: string; dc_formula: string } | null;
  persistent_damage?: { type: string; formula: string } | null;
  forced_movement?: { direction: "away" | "toward"; distance_feet: number } | null;
  area?: { type: string; size: string } | null;
  half_damage_on_success?: boolean;
  note?: string;
  source: string; // which lookup key matched
}

const { traits, abilities, ability_keywords } = LOOKUP as any;

/**
 * Resolves the condition/effect data for a given strike trait slug.
 * e.g. "grab" → { trigger: "on_hit", conditions: [{ slug: "grabbed" }], ... }
 */
export function resolveTraitEffect(traitSlug: string): MappedEffect | null {
  const entry = traits[traitSlug] ?? traits[traitSlug.toLowerCase()];
  if (!entry) return null;
  return { ...entry, source: `traits.${traitSlug}` };
}

/**
 * Resolves condition/effect data for a named ability (e.g. "Grab", "Breath Weapon").
 * Tries exact match first, then case-insensitive, then keyword scan.
 */
export function resolveAbilityEffect(abilityName: string): MappedEffect | null {
  // Exact match
  if (abilities[abilityName]) return { ...abilities[abilityName], source: `abilities.${abilityName}` };

  // Case-insensitive match
  const lower = abilityName.toLowerCase();
  const key = Object.keys(abilities).find((k) => k.toLowerCase() === lower);
  if (key) return { ...abilities[key], source: `abilities.${key}` };

  // Keyword scan: does the ability name contain a known keyword?
  for (const [kw, effect] of Object.entries(ability_keywords as Record<string, any>)) {
    if (lower.includes(kw.toLowerCase())) {
      return { ...effect, source: `ability_keywords.${kw}` };
    }
  }

  return null;
}

/**
 * Given a list of trait slugs (from a strike or item), returns all mapped effects.
 */
export function resolveTraitEffects(traitSlugs: string[]): MappedEffect[] {
  return traitSlugs.flatMap((slug) => {
    const effect = resolveTraitEffect(slug);
    return effect ? [effect] : [];
  });
}

/**
 * Filters a list of effects down to only those matching a specific trigger.
 */
export function effectsForTrigger(effects: MappedEffect[], trigger: Trigger): MappedEffect[] {
  return effects.filter((e) => e.trigger === trigger || e.trigger === "on_hit_or_failed_save");
}
