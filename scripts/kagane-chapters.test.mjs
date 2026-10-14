import assert from "node:assert/strict";
import test from "node:test";
import "./register-typescript.mjs";

const { ChapterProvider } = await import("../src/Kagane/implementations/chapter-providing/main.ts");
const { fetchChapterBooks } =
  await import("../src/Kagane/implementations/chapter-providing/books.ts");

const manga = { mangaId: "series-id", mangaInfo: { primaryTitle: "Test series" } };
const details = { title: "Test series", upload_status: "Ongoing" };
const book = (id, number = 1) => ({
  book_id: id,
  title: `Chapter ${number} - Title ${number}`,
  chapter_no: String(number),
  sort_no: number,
});

function chapterIndex(ids) {
  return { count: ids.length, fields: ["book_id"], books: ids.map((id) => [id]) };
}

function mockRequests(t, respond, index = chapterIndex(["one", "two", "three"])) {
  const requests = [];
  const previous = globalThis.Application;
  globalThis.Application = {
    getState: () => undefined,
    setState: () => {},
    arrayBufferToUTF8String: (buffer) => new TextDecoder().decode(buffer),
    scheduleRequest: async (request) => {
      requests.push(request);
      const url = new URL(request.url);
      let data;
      if (url.pathname === "/api/v2/genres/list") data = [];
      else if (url.pathname === "/api/v2/sources/list") data = { sources: [] };
      else if (url.pathname.endsWith("/books/index")) {
        data = typeof index === "function" ? index() : index;
      } else data = await respond(url, request);
      return [{ status: 200 }, new TextEncoder().encode(JSON.stringify(data)).buffer];
    },
  };
  t.after(() => {
    globalThis.Application = previous;
  });
  return requests;
}

void test("rebuilt series loads all chapter pages with the before cursor and verifies complete indexed IDs", async (t) => {
  const requests = mockRequests(t, (url) => {
    if (url.pathname === "/api/v2/series/series-id") return details;
    assert.equal(url.pathname, "/api/v2/series/series-id/books");
    assert.equal(url.searchParams.get("limit"), "200");
    assert.equal(url.searchParams.has("cursor"), false);
    assert.equal(url.searchParams.has("after"), false);
    if (!url.searchParams.has("before")) {
      return { items: [book("one"), book("two", 2)], next_cursor: "2,two" };
    }
    assert.equal(url.searchParams.get("before"), "2,two");
    return { items: [book("three", 3)], next_cursor: null };
  });
  const chapters = await new ChapterProvider().getChapters(manga);
  assert.deepEqual(
    chapters.map((chapter) => chapter.chapterId),
    ["one", "two", "three"],
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.sortingIndex),
    [0, 1, 2],
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.chapNum),
    [1, 2, 3],
  );
  assert.ok(chapters.every((chapter) => chapter.sourceManga === manga));
  assert.equal(
    requests.filter((request) => new URL(request.url).pathname.endsWith("/books")).length,
    2,
  );
});

void test("legacy embedded chapters do not make a new endpoint request", async (t) => {
  mockRequests(t, (url) => {
    assert.equal(url.pathname, "/api/v2/series/series-id");
    return { ...details, series_books: [book("legacy")] };
  });
  const chapters = await new ChapterProvider().getChapters(manga);
  assert.equal(chapters[0].chapterId, "legacy");
});

void test("an explicitly empty legacy list remains empty, not fabricated", async (t) => {
  mockRequests(t, (url) => {
    assert.equal(url.pathname, "/api/v2/series/series-id");
    return { ...details, series_books: [] };
  });
  assert.deepEqual(await new ChapterProvider().getChapters(manga), []);
});

void test("null embedded chapter list uses the rebuilt endpoint", async (t) => {
  mockRequests(
    t,
    (url) =>
      url.pathname.endsWith("/books")
        ? { items: [book("new")], next_cursor: null }
        : { ...details, series_books: null },
    chapterIndex(["new"]),
  );
  assert.equal((await new ChapterProvider().getChapters(manga))[0].chapterId, "new");
});

void test("malformed embedded chapter list is rejected", async (t) => {
  mockRequests(t, () => ({ ...details, series_books: {} }));
  await assert.rejects(new ChapterProvider().getChapters(manga), /invalid chapter list/);
});

void test("pagination rejects repeated cursors instead of returning an incomplete list", async (t) => {
  let page = 0;
  mockRequests(
    t,
    () => ({ items: [book(String(++page), page)], next_cursor: "repeat" }),
    chapterIndex(["1", "2", "3"]),
  );
  await assert.rejects(fetchChapterBooks("series-id"), /pagination did not advance/);
  assert.equal(page, 2);
});

void test("pagination rejects empty or duplicate-only continuation pages", async (t) => {
  let mode = "empty";
  let page = 0;
  mockRequests(t, () => {
    page++;
    return { items: mode === "empty" ? [] : [book("one")], next_cursor: String(page) };
  });
  await assert.rejects(fetchChapterBooks("series-id"), /pagination did not advance/);
  mode = "duplicate";
  await assert.rejects(fetchChapterBooks("series-id"), /repeated a book ID/);
});

void test("malformed pages, book IDs and cursor types fail closed", async (t) => {
  let response;
  mockRequests(t, () => response);
  for (response of [null, {}, { items: {} }]) {
    await assert.rejects(fetchChapterBooks("series-id"), /missing items/);
  }
  for (const invalid of [null, {}, { book_id: 1 }, { book_id: " " }]) {
    response = { items: [invalid], next_cursor: null };
    await assert.rejects(fetchChapterBooks("series-id"), /invalid book ID/);
  }
  response = { items: [book("one")], next_cursor: 2 };
  await assert.rejects(fetchChapterBooks("series-id"), /pagination did not advance/);
});

void test("a failure on a later page propagates rather than passing with partial data", async (t) => {
  mockRequests(t, (url) => {
    if (url.searchParams.has("before")) throw new Error("provider unavailable");
    return { items: [book("one")], next_cursor: "1,one" };
  });
  await assert.rejects(fetchChapterBooks("series-id"), /provider unavailable/);
});

void test("missing, blank and nonstring terminal cursors fail even after all IDs arrived", async (t) => {
  let cursor;
  mockRequests(t, () => ({ items: [book("one")], next_cursor: cursor }), chapterIndex(["one"]));
  for (cursor of [undefined, "", " ", 1, false, {}]) {
    await assert.rejects(fetchChapterBooks("series-id"), /pagination did not advance/);
  }
});

void test("duplicate or conflicting IDs cannot overwrite another chapter", async (t) => {
  let duplicate = book("one");
  mockRequests(t, () => ({ items: [book("one"), duplicate], next_cursor: null }));
  await assert.rejects(fetchChapterBooks("series-id"), /repeated a book ID/);
  duplicate = { ...book("one"), title: "Conflicting title" };
  await assert.rejects(fetchChapterBooks("series-id"), /repeated a book ID/);
});

void test("terminal count mismatches and unexpected IDs fail instead of returning partial data", async (t) => {
  let items = [book("one")];
  mockRequests(t, () => ({ items, next_cursor: null }));
  await assert.rejects(fetchChapterBooks("series-id"), /incomplete/);
  items = [book("one"), book("two"), book("not-indexed")];
  await assert.rejects(fetchChapterBooks("series-id"), /does not match its index/);
});

void test("traversal cannot exceed the finite index even with advancing cursors and IDs", async (t) => {
  let requests = 0;
  mockRequests(
    t,
    () => ({ items: [book(String(++requests))], next_cursor: String(requests) }),
    chapterIndex(["1", "2"]),
  );
  await assert.rejects(fetchChapterBooks("series-id"), /pagination did not advance/);
  assert.equal(requests, 2);
});

void test("the index supplies authoritative IDs independent of current_books or column order", async (t) => {
  mockRequests(t, () => ({ items: [book("one")], next_cursor: null }), {
    count: 1,
    fields: ["sort_no", "book_id"],
    books: [[1, "one"]],
  });
  assert.deepEqual(
    (await fetchChapterBooks("series-id")).map((item) => item.book_id),
    ["one"],
  );
});

void test("an empty index and empty final page return a genuine empty list", async (t) => {
  mockRequests(t, () => ({ items: [], next_cursor: null }), chapterIndex([]));
  assert.deepEqual(await fetchChapterBooks("series-id"), []);
});

void test("invalid index counts, columns, rows and duplicated IDs stop before chapter requests", async (t) => {
  let index;
  mockRequests(
    t,
    () => assert.fail("Should not fetch chapters for an invalid index"),
    () => index,
  );
  for (index of [
    null,
    {},
    { count: 0, fields: [], books: [] },
    { count: 2, fields: ["book_id"], books: [["one"]] },
    { count: 1.5, fields: ["book_id"], books: [] },
    { count: -1, fields: ["book_id"], books: [] },
    { count: 1, fields: ["book_id"], books: [[" "]] },
    { count: 1, fields: ["book_id"], books: [null] },
    chapterIndex(["one", "one"]),
  ]) {
    await assert.rejects(fetchChapterBooks("series-id"), /index/);
  }
});
