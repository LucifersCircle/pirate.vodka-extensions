export const DOMAIN = "https://vortexcomics.org";
export const DOMAIN_API = "https://api.vortexcomics.org/api";

export interface VortexQueryResponse {
  posts: VortexPost[];
  totalCount?: number;
}

export interface VortexPost {
  id: number;
  slug: string;
  postTitle: string;
  postContent: string;
  alternativeTitles: string;
  featuredImage: string;
  featuredImageCL: string;
  hot: boolean;
  isNew: boolean;
  seriesStatus: string;
  seriesType: string;
  lastChapterAddedAt: string;
  postStatus: string;
  createdAt: string;
  updatedAt: string;
  isNovel: boolean;
  isPinned: boolean;
  chaptersOnSale: boolean;
  saleActive: boolean;
  salePercentage: number | null;
  saleEndDate: string | null;
  genres: VortexGenre[];
  chapters: VortexChapter[];
  _count: { chapters: number };
  createdby?: { name: string };
  author?: string;
  artist?: string;
}

export interface VortexGenre {
  id: number;
  name: string;
  color: string;
}

export interface VortexChapter {
  id: number;
  number: number;
  title: string;
  featuredImage: string;
  slug: string;
  mangaPostId: number;
  createdAt: string;
  unlockAt: string | null;
  isPermanentlyLocked: number;
  isLocked: boolean;
  isPurchased: boolean;
  isAccessible: boolean;
}

export interface VortexChaptersResponse {
  post: {
    slug: string;
    chapters: VortexChapter[];
  };
  totalChapterCount: number;
}

export type Metadata = {
  page?: number;
};

export const PAGE_SIZE = 48;

export const SORT_OPTIONS = [
  { id: "lastChapterAddedAt:desc", label: "Latest Chapters" },
  { id: "totalViews:desc", label: "Most Popular" },
  { id: "createdAt:desc", label: "Newest Added" },
  { id: "createdAt:asc", label: "Oldest First" },
  { id: "postTitle:asc", label: "A-Z" },
];

export const STATUS_OPTIONS = [
  { id: "", value: "All" },
  { id: "ONGOING", value: "Ongoing" },
  { id: "COMPLETED", value: "Completed" },
  { id: "CANCELLED", value: "Cancelled" },
  { id: "DROPPED", value: "Dropped" },
  { id: "MASS_RELEASED", value: "Mass Released" },
  { id: "COMING_SOON", value: "Coming Soon" },
  { id: "HIATUS", value: "Hiatus" },
];

export const TYPE_OPTIONS = [
  { id: "", value: "All" },
  { id: "MANHWA", value: "Manhwa" },
  { id: "MANHUA", value: "Manhua" },
  { id: "MANGA", value: "Manga" },
  { id: "SPANISH", value: "Spanish" },
  { id: "RUSSIAN", value: "Russian" },
];
