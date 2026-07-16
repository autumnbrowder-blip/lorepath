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
    key: "horror",
    label: "Horror",
    description: "Frightening, violent, or disturbing content",
  },
  {
    key: "romance",
    label: "Romance",
    description: "How central romantic love is to the story",
  },
  {
    key: "sexual_content",
    label: "Spice Level",
    description: "Intimacy, explicit scenes, or sexual themes",
  },
  {
    key: "lgbt",
    label: "LGBTQ+",
    description: "LGBTQ+ characters, relationships, or themes",
  },
  {
    key: "ideology",
    label: "Social & Political Themes in Stories",
    description: "How much social or political messaging appears in the story",
  },
];

export const DEFAULT_RATINGS: ContentRating = {
  sexual_content: 0,
  romance: 0,
  lgbt: 0,
  horror: 0,
  ideology: 0,
  pacing: 0,
};

/** Default user preferences — start at 0 for all categories. */
export const DEFAULT_USER_PREFERENCES: ContentRating = {
  sexual_content: 0,
  romance: 0,
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
    key: "horror",
    label: "Horror / Dark Elements",
    description:
      '"We are all like the bright moon, we still have our darker side." — Kahlil Gibran',
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
    key: "romance",
    label: "Romance",
    description:
      '"The heart has its reasons which reason knows nothing of." — Blaise Pascal',
    note: "How much romantic love and courtship drive the story — separate from Spice Level.",
    type: "preferred",
    hintLow: "0 · None",
    hintHigh: "5 · Central",
    levelLabels: {
      0: "None",
      1: "Hint",
      2: "Light",
      3: "Moderate",
      4: "Strong",
      5: "Central",
    },
    levelDescriptions: {
      0: "No romantic subplot or romantic focus",
      1: "A faint spark of romance in the background",
      2: "Light romantic threads weave through the tale",
      3: "Romance plays a clear supporting role",
      4: "Romance is a major thread of the story",
      5: "The heart of the tale is romance itself",
    },
  },
  {
    key: "sexual_content",
    label: "Spice Level",
    description:
      "Some tales reach toward intimacy, while others remain quietly apart.",
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
      0: "No spice",
      1: "Very mild spice",
      2: "Some sexual tension or mild scenes",
      3: "Moderate spice, more descriptive",
      4: "Explicit scenes, but not the main focus",
      5: "Heavy smut / very explicit + multiple triggers",
    },
  },
  {
    key: "lgbt",
    label: "LGBTQ+ Representation",
    description: "Books can hold many kinds of love and identity.",
    type: "max",
    hintLow: "0 · None",
    hintHigh: "5 · Central",
    levelLabels: {
      0: "None",
      1: "Very Minor",
      2: "Minor",
      3: "Moderate",
      4: "Major",
      5: "Central",
    },
    levelDescriptions: {
      0: "No LGBTQ+ characters or relationships",
      1: "LGBTQ+ characters appear briefly or in very small roles",
      2: "LGBTQ+ characters or relationships appear but are not central to the story",
      3: "LGBTQ+ characters or relationships play a noticeable supporting role",
      4: "LGBTQ+ characters or relationships are significant to the story",
      5: "LGBTQ+ characters and relationships are the main focus of the book",
    },
  },
  {
    key: "ideology",
    label: "Social & Political Themes in Stories",
    description:
      '"Everything that irritates us about others can lead us to an understanding of ourselves." — Carl Jung',
    type: "max",
    hintLow: "0 · None",
    hintHigh: "5 · Central",
    levelLabels: {
      0: "None",
      1: "Minimal",
      2: "Subtle",
      3: "Noticeable",
      4: "Prominent",
      5: "Central",
    },
    levelDescriptions: {
      0: "No noticeable social or political messaging",
      1: "Very little social or political messaging",
      2: "Social or political themes are present but understated",
      3: "Clear social or political themes appear throughout the story",
      4: "Social or political messaging is a major part of the book",
      5: "The book is primarily focused on social or political themes",
    },
  },
];
