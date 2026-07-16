export type GoogleBooksVolumeInfo = {
  title?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  publisher?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
    medium?: string;
    large?: string;
  };
};

export type GoogleBooksVolumeResponse = {
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
};

export type GoogleBooksSearchResponse = {
  totalItems?: number;
  items?: {
    id: string;
    volumeInfo: GoogleBooksVolumeInfo;
  }[];
};
