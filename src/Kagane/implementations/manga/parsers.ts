/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { SourceManga, TagSection } from "@paperback/types";

import { BASE_URL, type DetailsDto, type KaganeMetadata } from "../shared/models";
import { getPaperbackBookContentRating } from "../shared/rating";
import { buildImageUrl, joinUnique, mapPublicationStatus } from "../shared/utils";

export function parseMangaDetails(
  mangaId: string,
  data: DetailsDto,
  metadata: KaganeMetadata | undefined,
  options: {
    showEdition: boolean;
    showSource: boolean;
  },
): SourceManga {
  const sourceName = data.source_id
    ? metadata?.sources.find((source) => source.source_id === data.source_id)?.title
    : undefined;
  const primaryTitle = buildTitle(data, sourceName, options.showEdition, options.showSource);
  const alternateTitles = (data.series_alternate_titles ?? [])
    .map((title) => title.title.trim())
    .filter(Boolean);
  const staff = data.series_staff ?? [];
  const authors = staff
    .filter((person) => /author|story/i.test(person.role))
    .map((person) => person.name);
  const artists = staff
    .filter((person) => /artist|art/i.test(person.role))
    .map((person) => person.name);
  const tagGroups = buildTagGroups(data);
  const uploadStatus = mapPublicationStatus(data.upload_status);

  return {
    mangaId,
    mangaInfo: {
      primaryTitle,
      secondaryTitles: alternateTitles,
      thumbnailUrl: buildImageUrl(data.series_covers?.[0]?.image_id),
      synopsis: buildSynopsis(data, sourceName),
      author: joinUnique(authors),
      artist: joinUnique(artists),
      status: mapPublicationStatus(data.publication_status),
      additionalInfo: uploadStatus !== "Unknown" ? { "Upload status": uploadStatus } : undefined,
      contentRating: getPaperbackBookContentRating(data),
      tagGroups,
      shareUrl: `${BASE_URL}/series/${mangaId}`,
    },
  };
}

function buildTitle(
  data: DetailsDto,
  sourceName: string | undefined,
  showEdition: boolean,
  showSource: boolean,
): string {
  const baseTitle = data.title.trim();
  const editionTitle =
    showEdition && data.edition_info?.trim()
      ? `${baseTitle} (${data.edition_info.trim()})`
      : baseTitle;

  return showSource && sourceName ? `${editionTitle} [${sourceName}]` : editionTitle;
}

function buildSynopsis(data: DetailsDto, sourceName: string | undefined): string {
  const lines: string[] = [];
  const description = data.description?.trim();
  if (description) {
    lines.push(description);
  }

  if (sourceName && data.source_id) {
    lines.push(`Source: ${sourceName} (${BASE_URL}/sources/${data.source_id})`);
  }

  const alternateTitles = (data.series_alternate_titles ?? [])
    .map((title) => title.title.trim())
    .filter(Boolean);
  if (alternateTitles.length > 0) {
    lines.push(`Associated Names:\n${alternateTitles.join("\n")}`);
  }

  return lines.join("\n\n");
}

function buildTagGroups(data: DetailsDto): TagSection[] {
  const formatTags = data.format?.trim()
    ? [
        {
          id: safeTagId("format", data.format),
          title: data.format,
        },
      ]
    : [];
  const genreTags = (data.genres ?? []).map((genre) => ({
    id: safeTagId("genre", genre.genre_name),
    title: genre.genre_name,
  }));
  const tagTags = (data.tags ?? []).map((tag) => ({
    id: safeTagId("tag", tag.tag_name),
    title: tag.tag_name,
  }));

  return [
    ...(formatTags.length > 0 || genreTags.length > 0
      ? [
          {
            id: "genres",
            title: "Genres",
            tags: [...formatTags, ...genreTags],
          },
        ]
      : []),
    ...(tagTags.length > 0
      ? [
          {
            id: "tags",
            title: "Tags",
            tags: tagTags,
          },
        ]
      : []),
  ];
}

function safeTagId(prefix: string, value: string): string {
  const encoded = encodeURIComponent(value.trim()).replace(/[!'*~]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });

  return `${prefix}:${encoded || "unknown"}`;
}
