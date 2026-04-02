export interface QIScansSeriesSearchResponse {
  data: QIScansSeriesSearchItem[];
}

export interface QIScansSeriesSearchItem {
  slug: string;
  title: string;
  alternativeTitles?: string;
  cover: string;
  type: string;
  status: string;
  publishStatus: string;
  createdAt: string;
  avgRating: number | null;
  redirectUrl: string;
  discountActive: boolean;
  discountPercentage: number | null;
  discountEndAt: string | null;
}

export interface QIScansSeriesDetailsResponse {
  id: number;
  slug: string;
  title: string;
  alternativeTitles: string;
  description: string;
  author: string;
  artist: string;
  cover: string;
  type: string;
  status: string;
  publishStatus: string;
  lastChapterAddedAt: string;
  createdAt: string;
  genres: QIScansGenre[];
  stats: {
    averageRating: number | null;
    reviewCount: number;
    chapterCount: number;
    commentCount: number;
  };
  navigation?: {
    first?: {
      number: number;
      slug: string;
    };
  };
}

export interface QIScansSeriesChaptersResponse {
  data: QIScansSeriesChapter[];
  totalItems: number;
  totalPages: number;
  current: number;
  next: number | null;
}

export interface QIScansSeriesChapter {
  id: number;
  slug: string;
  number: number;
  title: string;
  cover: string;
  price: number;
  isFree: boolean;
  publishStatus: string;
  totalViews: number;
  commentCount: number;
  createdAt: string;
  requiresPurchase: boolean;
}

export interface QIScansSeriesChapterDetailsResponse {
  id: number;
  slug: string;
  number: number;
  title: string;
  content: string;
  cover: string;
  publishStatus: string;
  price: number;
  isFree: boolean;
  requiresPurchase: boolean;
  totalViews: number;
  images: QIScansSeriesChapterImage[];
  totalImages: number;
  createdAt: string;
}

export interface QIScansSeriesChapterImage {
  url: string;
  order: number;
  width: number;
  height: number;
}

export interface QIScansHomeResponse {
  banners: QIScansHomeSeriesItem[];
  popular: QIScansHomeSeriesItem[];
  newSeries: QIScansHomeSeriesItem[];
  pinned: QIScansHomeSeriesItem[];
  editorsPick: QIScansHomeSeriesItem[];
}

export interface QIScansHomeSeriesItem {
  id: number;
  slug: string;
  title: string;
  cover: string;
  coverBlurHash?: string;
  type: string;
  status: string;
  redirectUrl: string;
  avgRating: number | null;
  lastChapterAddedAt?: string;
  description?: string;
  genres?: QIScansHomeGenre[];
  chapters?: QIScansHomeChapter[];
}

export interface QIScansHomeGenre {
  id: number;
  slug: string;
  name: string;
}

export interface QIScansHomeChapter {
  slug: string;
  number: number;
  price: number;
  createdAt: string;
}

export interface QIScansV2Response {
  data: QIScansPost[];
}

export interface QIScansPost {
  id: number;
  slug: string;
  postTitle: string;
  postContent: string;
  isNovel: boolean;
  isNew: boolean;
  chaptersPricing: number;
  featuredImage: string;
  postStatus: string;
  postType: string;
  author?: string;
  artist?: string;
  seriesType?: string;
  seriesStatus?: string;
  totalViews?: number;
  alternativeTitles?: string;
  genres: QIScansGenre[];
  chapters: QIScansChapter[];
  _count: { chapters: number };
  averageRating?: number;
  createdAt: string;
  updatedAt: string;
  lastChapterAddedAt?: string;
}

export interface QIScansGenre {
  id: number;
  name: string;
  color?: string;
}

export interface QIScansChapter {
  id: number;
  number: number;
  title: string | null;
  slug: string;
  mangaPostId: number;
  createdAt: string;
  isLocked: boolean;
  isAccessible: boolean;
}

export interface QIScansChaptersResponse {
  post: {
    slug: string;
    chapters: QIScansChapter[];
  };
  totalChapterCount: number;
}

export type Metadata = {
  page?: number;
  completed?: boolean;
};
