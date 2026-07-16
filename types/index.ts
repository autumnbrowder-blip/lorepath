export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  /** Fantasy avatar filename under /avatars/ (e.g. dragon.jpg); see lib/avatars.ts */
  avatar_key: string | null;
  is_subscriber: boolean;
  created_at: string;
  updated_at: string;
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  slug: string;
  cover_image_url: string | null;
  description: string | null;
  published_year: number | null;
  genre: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
};

export type ContentRating = {
  sexual_content: number;
  lgbt: number;
  horror: number;
  ideology: number;
  pacing: number;
};

export type Rating = ContentRating & {
  id: string;
  book_id: string;
  summary: string | null;
  rated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPreferences = ContentRating & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type SavedPreferenceProfile = ContentRating & {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type WishlistItem = {
  id: string;
  user_id: string;
  book_id: string;
  notes: string | null;
  created_at: string;
};
