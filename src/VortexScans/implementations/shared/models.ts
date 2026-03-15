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
  completed?: boolean;
};
