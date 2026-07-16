import type { ContentRating } from "@/types";

export const RATING_CATEGORIES: {
  key: keyof ContentRating;
  label: string;
  description: string;
}[] = [
  {
    key: "sexual_content",
    label: "Sexual Content",
    description: "Romance, intimacy, or sexual themes",
  },
  {
    key: "lgbt",
    label: "LGBTQ+",
    description: "LGBTQ+ characters, relationships, or themes",
  },
  {
    key: "horror",
    label: "Horror",
    description: "Frightening, violent, or disturbing content",
  },
  {
    key: "ideology",
    label: "Social & Political Outlook",
    description: "Political, religious, or philosophical themes",
  },
  {
    key: "pacing",
    label: "Pacing",
    description: "How fast or slow the story moves",
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
}[] = [
  {
    key: "sexual_content",
    label: "Sexual Content",
    description:
      "How much explicit intimacy you're comfortable with in the stories you read.",
    type: "max",
    hintLow: "1 · Most closed",
    hintHigh: "5 · Sexually explicit",
    levelLabels: {
      0: "None",
      1: "Most closed",
      5: "Sexually explicit",
    },
  },
  {
    key: "lgbt",
    label: "LGBTQ+ Representation",
    description:
      "How central LGBTQ+ characters and relationships are in the book.",
    type: "max",
    hintLow: "Absent",
    hintHigh: "Central",
  },
  {
    key: "horror",
    label: "Horror / Dark Elements",
    description:
      "The level of fear, violence, or unsettling themes you're okay with.",
    note: "This includes graphic violence, gore, death, and other potentially disturbing content.",
    type: "max",
    hintLow: "Gentle",
    hintHigh: "Very dark",
  },
  {
    key: "ideology",
    label: "Social & Political Outlook",
    description:
      "Whether you prefer stories with progressive themes, traditional values, or something in between.",
    type: "preferred",
    hintLow: "More traditional",
    hintHigh: "More progressive",
  },
  {
    key: "pacing",
    label: "Pacing",
    description: "How fast or slow you like the story to move.",
    type: "preferred",
    hintLow: "Slow & lingering",
    hintHigh: "Swift & plotty",
  },
];
