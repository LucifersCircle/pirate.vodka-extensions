import type { DiscoverSection, DiscoverSectionItem, PagedResults } from "@paperback/types";

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [];
  }

  async getDiscoverSectionItems(
    _section: DiscoverSection,
    _metadata?: unknown,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    return { items: [], metadata: undefined };
  }
}
