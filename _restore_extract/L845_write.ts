import type { ContentRating } from "@/types";

export const RATING_CATEGORIES: {
  key: keyof ContentRating;
  label: string;
  description: string;
}[] = [
  {
    key: "pacing",
    label: "Pacing",
    description: "How fast or slow the story moves",
  },
  {
    key: "sexual_content",
    label: "Sexual Content",
    description: "Romance, intimacy, or sexual themes",
  },
  {
    key: "horror",
    label: "Horror",
    description: "Frightening, violent, or disturbing content",
  },
  {
    key: "lgbt",
    label: "LGBTQ+",
    description: "LGBTQ+ characters, relationships, or themes",
  },
  {
    key: "ideology",
    label: "Social Themes",
    description: "How much social or political messaging appears in the story",
  },
];

export const DEFAULT_RATINGS: ContentRating = {
  sexual_content: 0,
  lgbt: 0,
  horror: 0,
  ideology: 0,
  pacing: 0,
};

/** Default user preferences — start at 0 for all categories. */
export const DEFAULT_USER_PREFERENCES: ContentRating = {
  sexual_content: 0,
  lgbt: 0,
  horror: 0,
  ideology: 0,
  pacing: 0,
};

export const PREFERENCE_CATEGORIES: {
  key: keyof ContentRating;
  label: string;
  description: string;
  type: "max" | "preferred";
  hintLow?: string;
  hintHigh?: string;
  /** Optional trigger / clarification line under the description. */
  note?: string;
  /** Overrides for the gold badge text at specific slider values. */
  levelLabels?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
  /** Short explanation shown for the currently selected level. */
  levelDescriptions?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, string>>;
}[] = [
  {
    key: "pacing",
    label: "Pacing",
    description: "How fast or slow you like the story to move.",
    type: "preferred",
    hintLow: "0 · Very Slow",
    hintHigh: "5 · Breakneck",
    levelLabels: {
      0: "Very Slow",
      1: "Slow",
      2: "Moderate",
      3: "Fast",
      4: "Very Fast",
      5: "Breakneck",
    },
    levelDescriptions: {
      0: "Extremely slow pacing. Heavy on description and character development",
      1: "Slow-paced story. Focuses more on atmosphere and details",
      2: "An even tempo with both quieter stretches and quicker spurts",
      3: "Generally fast-paced with constant momentum",
      4: "High-speed pacing with very little downtime",
      5: "Extremely fast pacing. Can feel rushed",
    },
  },
  {
    key: "sexual_content",
    label: "Sexual Content",
    description:
      "How much explicit intimacy you're comfortable with in the stories you read.",
    type: "max",
    hintLow: "0 · NONE",
    hintHigh: "5 · Adult",
    levelLabels: {
      0: "NONE",
      1: "PG",
      2: "PG-13",
      3: "R",
      4: "Mature",
      5: "Adult",
    },
    levelDescriptions: {
      0: "No sexual content",
      1: "Very mild sexual content",
      2: "Some sexual tension or mild scenes",
      3: "Moderate sexual content, more descriptive",
      4: "Explicit scenes, but not the main focus",
      5: "Heavy smut / very explicit + multiple triggers",
    },
  },
  {
    key: "horror",
    label: "Horror / Dark Elements",
    description:
      "The level of fear, violence, or unsettling themes you're okay with.",
    note: "This includes graphic violence, gore, death, and other potentially disturbing content.",
    type: "max",
    hintLow: "0 · None",
    hintHigh: "5 · Extreme",
    levelLabels: {
      0: "None",
      1: "Mild",
      2: "Moderate",
      3: "Dark",
      4: "Intense",
      5: "Extreme",
    },
    levelDescriptions: {
      0: "No horror or dark elements",
      1: "Very light horror, minimal tension or scares",
      2: "Some horror elements, tension, and unsettling moments",
      3: "Strong horror themes, disturbing content, and tension",
      4: "Heavy horror, graphic violence, and strong psychological elements",
      5: "Very graphic horror, gore, and multiple potential triggers",
    },
  },
  {
    key: "lgbt",
    label: "LGBTQ+ Presence",
    description:
      "How much LGBTQ+ character or relationship presence you prefer in the stories you choose. This is only about presence in the text — not a political stance.",
    type: "max",
    hintLow: "0 · None",
    hintHigh: "5 · Central",
    levelLabels: {
      0: "None",
      1: "Minimal",
      2: "Some",
      3: "Noticeable",
      4: "Important",
      5: "Central",
    },
    levelDescriptions: {
      0: "No LGBTQ+ characters or themes",
      1: "Brief mention or background presence only",
      2: "Some LGBTQ+ characters or themes, not a main focus",
      3: "Clear LGBTQ+ presence as part of the cast or plot",
      4: "LGBTQ+ characters or relationships are a major part of the story",
      5: "LGBTQ+ characters or relationships are central to the story",
    },
  },
  {
    key: "ideology",
    label: "Social Themes",
    description:
      "How much social or political messaging you are comfortable with in a story. This is about amount of commentary — not which viewpoint.",
    type: "max",
    hintLow: "0 · None",
    hintHigh: "5 · Heavy",
    levelLabels: {
      0: "None",
      1: "Light",
      2: "Mild",
      3: "Moderate",
      4: "Strong",
      5: "Heavy",
    },
    levelDescriptions: {
      0: "Little or no social or political messaging",
      1: "Occasional background commentary",
      2: "Some clear themes, still easy to enjoy as a story first",
      3: "Noticeable social or political themes woven through the book",
      4: "Strong messaging that shapes much of the narrative",
      5: "Heavy social or political messaging throughout",
    },
  },
];
