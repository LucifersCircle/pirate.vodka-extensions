import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./register-typescript.mjs";

const parsers = await import("../src/Hijala/parsers.ts");
const { serializedProperty } = await import("../src/Hijala/page-data.ts");
const { matchesPreferences, queryWithPreferences } = await import("../src/Hijala/forms.ts");
const fixture = (name) =>
  readFileSync(new URL(`fixtures/hijala/${name}.txt`, import.meta.url), "utf8");
const series = fixture("series");
const reader = fixture("reader");
const mangaId = parsers.slugToId("sample: series!");
const manga = parsers.parseDetails(series, mangaId);
const capturedAt = new Date("2026-10-14T12:00:00Z");
const chapter = parsers.parseChapters(series, manga, capturedAt)[1];
const literal = (value) => `$_TSR.router=($R=>$R[0]={value:${value}})($R["tsr"]);`;

void test("TanStack details and complete chapter lists preserve identities and paid status", () => {
  assert.equal(manga.mangaId, "sample%3A%20series%21");
  assert.equal(manga.mangaInfo.primaryTitle, "Sample Series");
  assert.equal(manga.mangaInfo.synopsis, 'Literal "post:" and $R[99] are text.');
  assert.equal(manga.mangaInfo.rating, 0.85);
  assert.deepEqual(manga.mangaInfo.secondaryTitles, ["Alternate"]);
  const chapters = parsers.parseChapters(series, manga, capturedAt);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].additionalInfo.locked, "true");
  assert.equal(chapters[0].title, "[Paid] Finale");
  assert.equal(chapters[1].additionalInfo.locked, "false");
  assert.equal(chapters[1].chapNum, 1.5);
  assert.equal(chapters[1].title, "");
  assert.equal(chapters[1].sourceManga, manga);
  assert.equal(
    parsers.seriesUrl(mangaId, chapter.chapterId),
    "https://en-hijala.com/series/sample%3A%20series%21/chapter-1.5",
  );
});

void test("TanStack featured and archive genres retain references and source filters", () => {
  const featured = parsers.parseFeatured(fixture("home"));
  assert.equal(featured.length, 2);
  assert.equal(featured[0].summary, "Featured story.");
  assert.deepEqual(featured[0].metadata.genres, ["1"]);
  assert.deepEqual(parsers.parseGenreOptions(fixture("archive")), [
    { id: "1", title: "Action" },
    { id: "2", title: "Fantasy" },
  ]);
  const saved = { hidePaid: true, sections: ["featured"], types: ["MANHWA"], excludedGenres: [] };
  assert.deepEqual(
    featured.filter((item) => matchesPreferences(item, saved)).map((item) => item.mangaId),
    [mangaId],
  );
  assert.equal(
    featured.filter((item) => matchesPreferences(item, { ...saved, excludedGenres: ["1"] })).length,
    0,
  );
  assert.equal(
    queryWithPreferences(
      { title: "", metadata: { genres: { 1: "included" } } },
      { ...saved, excludedGenres: ["1"] },
    ),
    undefined,
  );
});

void test("TanStack readers validate identity, public access and ordered image URLs", () => {
  assert.deepEqual(parsers.parseReader(reader, chapter).pages, [
    "https://storage.en-hijala.com/page-1.webp",
    "https://en-hijala.com/page-2.webp",
  ]);
  for (const html of [
    reader.replace('seriesSlug:"sample: series!"', 'seriesSlug:"other"'),
    reader.replace('chapter:$R[5]={slug:"chapter-1.5"', 'chapter:$R[5]={slug:"chapter-9"'),
    reader.replace("isLocked:!1", "isLocked:!0"),
    reader.replace("isAccessible:!0", "isAccessible:!1"),
    reader.replace("isAccessible:!0,", ""),
    reader.replace("isLocked:!1,", ""),
    reader.replace("requiresProtectedFetch:!1", "requiresProtectedFetch:!0"),
    reader.replace(",requiresProtectedFetch:!1", ""),
    reader.replace("isNovel:!1", "isNovel:!0"),
    reader.replace("order:1", "order:0"),
    reader.replace("order:1", "order:1.5"),
    reader.replace("/page-2.webp", "javascript:alert(1)"),
    reader.replace(
      /publicImages:\$R\[6\]=\[.*?\],requiresProtectedFetch/,
      "publicImages:[],requiresProtectedFetch",
    ),
  ])
    assert.throws(() => parsers.parseReader(html, chapter));
});

void test("TanStack chapters reject incomplete counts, duplicate IDs, wrong series and missing locks", () => {
  for (const html of [
    series.replace("totalChapterCount:2", "totalChapterCount:3"),
    series.replace("totalChapterCount:2", "totalChapterCount:1.5"),
    series.replace("chapters:2", "chapters:3"),
    series.replace(",totalChapterCount:2", ""),
    series.replace('slug:"chapter-2"', 'slug:"chapter-1.5"'),
    series.replace('post:$R[5]={slug:"sample: series!"', 'post:$R[5]={slug:"other"'),
    series.replace("isLocked:!0,", ""),
    series.replace("number:2", "number:null"),
  ])
    assert.throws(() => parsers.parseChapters(html, manga, capturedAt));
  assert.throws(() => parsers.parseDetails(series, "other"), /different series/);
});

void test("literal decoder rejects execution, unresolved or cyclic references, duplicate keys and truncation", () => {
  for (const value of [
    "(()=>({ok:true}))()",
    "new Date()",
    "fetch('https://example.org')",
    "{ok:1+2}",
    "{ok:Function('return 1')()}",
    "{[window.key]:1}",
    "{...other}",
    "{ok:1,ok:2}",
    '{"__proto__":{polluted:true}}',
    "{constructor:{}}",
    "$R[99]",
    "$R[1]={loop:$R[1]}",
    "$R[1]={loop:$R[2]={loop:$R[1]}}",
    "[1,,2]",
    "[1,]",
    "{ok:true",
    "{ok:!2}",
    "{ok:NaN}",
    "{ok:1e999}",
    '"unterminated',
  ])
    assert.throws(() => serializedProperty(literal(value), "value"), undefined, value);
  assert.throws(() =>
    serializedProperty(
      '$_TSR.router=($R=>$R[0]={bad:$R[1]={ok:1}.mutate(),value:$R[1]})($R["tsr"]);',
      "value",
    ),
  );
  assert.throws(
    () => serializedProperty('$_TSR.router=($R=>$R[0]={value:{},value:[]})($R["tsr"]);', "value"),
    /ambiguous/,
  );
  assert.throws(() => serializedProperty(literal("[".repeat(70) + "0" + "]".repeat(70)), "value"));
  assert.throws(() => serializedProperty(" ".repeat(4_000_001), "value"), /too large/);
  for (const extra of [
    "/* {value:{spoof:true}} */",
    "// {value:{spoof:true}}",
    "`{value:{spoof:true}}`",
    "/{value:{spoof:true}}/",
  ])
    assert.throws(() => serializedProperty(literal("{real:true}") + extra, "value"));
  assert.equal({}.polluted, undefined);
});

void test("literal decoder keeps escaped syntax inert and resolves data references only", () => {
  const result = serializedProperty(
    literal(
      '$R[1]={text:"\\x3Cp>\\\"value:\\\" $R[99]\\x3C/p>",literal:"\\\\x3C",yes:!0,no:!1,missing:void 0,list:$R[2]=[1,null],again:$R[2]}',
    ),
    "value",
  );
  assert.equal(result.text, '<p>"value:" $R[99]</p>');
  assert.equal(result.literal, "\\x3C");
  assert.equal(result.yes, true);
  assert.equal(result.no, false);
  assert.equal(result.missing, undefined);
  assert.deepEqual(result.list, [1, null]);
  assert.deepEqual(result.again, [1, null]);
});

void test("legacy Next JSON streams and their fail-closed checks remain supported", () => {
  const data = parsers.pageProperty(series, "post");
  data.chapters = parsers.pageProperty(series, "initialChapters");
  const json = JSON.stringify({ post: data });
  const next = (text) => `<script>self.__next_f.push(${JSON.stringify([1, text])})</script>`;
  const html =
    "<p>$_TSR.router= is ordinary text.</p>" + next(json.slice(0, 40)) + next(json.slice(40));
  assert.equal(parsers.parseDetails(html, mangaId).mangaId, mangaId);
  assert.equal(parsers.parseChapters(html, manga, capturedAt).length, 2);
  assert.throws(
    () =>
      parsers.parseChapters(next(json.replace('"chapters":2', '"chapters":3')), manga, capturedAt),
    /incomplete chapter list/,
  );
  assert.throws(() => parsers.pageProperty(next('{"post":{'), "post"), /incomplete/);
  assert.throws(() => parsers.pageProperty("<html>unavailable</html>", "post"), /missing/);
});

void test(
  "literal scanning rejects long unterminated strings without retrying every quote",
  { timeout: 5000 },
  () => {
    assert.throws(
      () => serializedProperty('{value:"' + '\\"'.repeat(30_000), "value"),
      /incomplete page data syntax/,
    );
  },
);

void test("literal extraction stays inside the supported router root", () => {
  const data = serializedProperty(
    literal("{real:true}") + ";const unrelated={value:{spoof:true}};",
    "value",
  );
  assert.equal(data.real, true);
  assert.throws(
    () => serializedProperty(literal("{first:true}") + literal("{second:true}"), "value"),
    /ambiguous router data/,
  );
  assert.throws(
    () => serializedProperty(literal("{ok:true}").replace("value:", "other:[},value:"), "value"),
    /incomplete router data/,
  );
  assert.throws(() =>
    serializedProperty(
      '$_TSR.router=($R=>$R[0]={value:$R[9]})($R["tsr"]);const other={$R[9]={spoof:true},};',
      "value",
    ),
  );
  assert.throws(
    () => serializedProperty("$_TSR.router=($R=>$R[0]={value:{ok:true},other:{", "value"),
    /incomplete router data/,
  );
});
