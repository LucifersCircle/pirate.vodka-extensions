# Hijala rendering fixtures

Reduced, anonymous fixtures based on public `en-hijala.com` HTML observed on
2026-10-14: `/`, `/series`, `/series/fog-land`,
`/series/fog-land/chapter-60`, and `/series/hair-growth-maniac/chapter-7`.
Titles, IDs, chapter counts, and page URLs are synthetic. The serializer and
field shapes preserve the observed TanStack/Seroval contract, including reference
assignments/reuse, JavaScript hex escapes, booleans, and `void 0`.

The live contract separates `initialChapters` and `totalChapterCount` from
`post.chapters`, renames the featured feed to `combinedSliderPosts`, and exposes
reader `seriesSlug`, `publicImages`, and `requiresProtectedFetch`. Paid chapters
have `isLocked: true`, `isAccessible: false`, `requiresProtectedFetch: true`, and
no public images. No authenticated data, cookies, or tokens are included.
