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
 * Sentiment tiers used to color-code tags in the HUD.
 *
 * good     → green   (beneficial)
 * bad-low  → yellow  (minor debuff: prone, dazzled, off-guard…)
 * bad-mid  → orange  (significant: grabbed, frightened, slowed…)
 * bad-high → red     (severe: dying, paralyzed, stunned, doomed…)
 * neutral  → grey    (observational / positional states)
 */
export type TagSentiment = "good" | "bad-low" | "bad-mid" | "bad-high" | "neutral";

// ── PF2e condition slug → sentiment ──────────────────────────────────────
// Complete map of every core PF2e condition. Unlisted slugs fall through
// to "neutral".
const CONDITION_SENTIMENT: Record<string, TagSentiment> = {
  // Severe (red)
  dying:        "bad-high",
  unconscious:  "bad-high",
  paralyzed:    "bad-high",
  petrified:    "bad-high",
  doomed:       "bad-high",
  restrained:   "bad-high",

  // Moderate (orange)
  stunned:      "bad-mid",
  grabbed:      "bad-mid",
  immobilized:  "bad-mid",
  frightened:   "bad-mid",
  confused:     "bad-mid",
  fleeing:      "bad-mid",
  slowed:       "bad-mid",
  controlled:   "bad-mid",

  // Minor (yellow)
  blinded:      "bad-low",
  dazzled:      "bad-low",
  deafened:     "bad-low",
  sickened:     "bad-low",
  enfeebled:    "bad-low",
  clumsy:       "bad-low",
  drained:      "bad-low",
  stupefied:    "bad-low",
  fatigued:     "bad-low",
  wounded:      "bad-low",
  prone:        "bad-low",
  encumbered:   "bad-low",
  fascinated:   "bad-low",
  "off-guard":  "bad-low",

  // Good (green)
  quickened:    "good",
  invisible:    "good",
  hidden:       "good",
  concealed:    "good",
  undetected:   "good",
  unnoticed:    "good",

  // Neutral
  observed:     "neutral",
  detected:     "neutral",
};

// Keywords that signal a beneficial effect name
const GOOD_EFFECT_KEYWORDS = [
  "heroism", "inspire", "courage", "bless", "haste", "shield", "guidance",
  "aid", "magic fang", "magic weapon", "barkskin", "stoneskin", "blur",
  "mirror image", "invisibility", "fly", "freedom of movement", "true seeing",
  "regenerat", "resist", "protection", "sanctuary", "enlarge", "rage",
  "hunter's edge", "sneak attack", "assured", "bolster", "empower",
  "fortify", "reinforce", "strengthen", "fortified", "hardened",
];

// Keywords that signal a harmful effect name
const BAD_EFFECT_KEYWORDS = [
  "bane", "slow", "curse", "hex", "doom", "enfeeble", "poison", "disease",
  "bleed", "persistent", "dazzle", "blind", "frighten", "fear", "sicken",
  "drain", "stupef", "clums", "weaken", "exhaust", "fatigue", "stagger",
  "burn", "corrode", "decay", "wither",
];

/** Infer sentiment for a named effect from its traits or name keywords. */
export function inferEffectSentiment(
  name: string,
  traits: string[] = []
): TagSentiment {
  const lower = name.toLowerCase();

  // PF2e effect traits that signal benefit vs. harm
  if (traits.includes("fortune") || traits.includes("healing")) return "good";
  if (traits.includes("misfortune") || traits.includes("curse")) return "bad-mid";

  if (GOOD_EFFECT_KEYWORDS.some((kw) => lower.includes(kw))) return "good";
  if (BAD_EFFECT_KEYWORDS.some((kw) => lower.includes(kw))) return "bad-mid";

  return "neutral";
}

export interface ConditionData {
  id: string;
  name: string;
  value: number | null;
  sentiment: TagSentiment;
}

export interface EffectData {
  id: string;
  name: string;
  img: string | null;
  /** Human-readable duration string, e.g. "3 rounds" or "1 minute". Null if unlimited/permanent. */
  duration: string | null;
  /** Badge/counter value for stacking effects (e.g. a +2 bonus counter). Null if not applicable. */
  badge: number | null;
  sentiment: TagSentiment;
}

/**
 * Returns active conditions for an actor, including the embedded item ID
 * needed to remove them programmatically.
 * Falls back to core Active Effects for non-PF2e systems.
 */
export function getConditions(actor: Actor): ConditionData[] {
  if (isPF2e()) {
    const conditions = (actor as any).conditions?.active ?? [];
    return conditions.map((c: any) => {
      const slug: string = c.system?.slug ?? c.slug ?? "";
      return {
        id: c.id as string,
        name: c.name as string,
        value: (c.system?.value?.value as number) ?? null,
        sentiment: CONDITION_SENTIMENT[slug] ?? "neutral",
      };
    });
  }

  // Core fallback: read active effects that aren't suppressed
  return actor.effects
    .filter((e) => !e.disabled)
    .map((e) => ({
      id: e.id!,
      name: e.name ?? (e as any).label ?? "",
      value: null,
      sentiment: "neutral" as TagSentiment,
    }));
}

/**
 * Returns active effects (buffs, spell effects, auras) for an actor.
 * In PF2e these are Effect items (actor.itemTypes.effect), distinct from
 * conditions. Falls back to core ActiveEffects for non-PF2e systems.
 */
export function getEffects(actor: Actor): EffectData[] {
  if (isPF2e()) {
    const effects: any[] = (actor as any).itemTypes?.effect ?? [];
    return effects
      .filter((e: any) => !e.isExpired)
      .map((e: any) => {
        const dur = e.system?.duration;
        let durationStr: string | null = null;
        if (dur && dur.value > 0 && dur.unit && dur.unit !== "unlimited") {
          durationStr = `${dur.value} ${dur.unit}`;
        }
        const traits: string[] = e.system?.traits?.value ?? [];
        return {
          id: e.id as string,
          name: e.name as string,
          img: (e.img as string) ?? null,
          duration: durationStr,
          badge: (e.system?.badge?.value as number) ?? null,
          sentiment: inferEffectSentiment(e.name as string, traits),
        };
      });
  }

  // Core fallback: active effects that aren't already shown as conditions
  return actor.effects
    .filter((e) => !e.disabled && !(e as any).isCondition)
    .map((e) => ({
      id: e.id!,
      name: e.name ?? (e as any).label ?? "",
      img: null,
      duration: null,
      badge: null,
      sentiment: inferEffectSentiment(e.name ?? "") as TagSentiment,
    }));
}
