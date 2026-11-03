import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../src/lib/api-response";
import { csvUploadError, MAX_CAMPAIGN_CSV_BYTES, MAX_LSA_CSV_BYTES } from "../src/lib/csv-upload";
import { prepareVanDocumentImage } from "../src/lib/van-document-pages";

test("proxy text and HTML produce actionable errors for each HTTP failure", async () => {
  for (const [status, message] of [
    [413, /too large/], [415, /format/], [401, /Sign in/], [403, /permission/],
    [429, /Too many/], [500, /server encountered/], [502, /upstream/],
    [503, /temporarily unavailable/], [504, /too long/], [418, /HTTP 418/],
  ] as const) {
    for (const body of ["Request Entity Too Large", "<html>private proxy diagnostics</html>", ""]) {
      await assert.rejects(readApiResponse(new Response(body, { status })), message);
    }
  }
});

test("JSON API errors and conflict metadata survive; missing error messages get a status fallback", async () => {
  const conflict = { error: "This week is already paid", weekId: "week-1" };
  assert.deepEqual(await readApiResponse(Response.json(conflict, { status: 409 })), conflict);
  assert.match((await readApiResponse(Response.json({}, { status: 413 }))).error, /too large/);
  assert.match((await readApiResponse(Response.json(null, { status: 403 }))).error, /permission/);
  assert.match((await readApiResponse(Response.json({ error: "" }, { status: 429 }))).error, /Too many/);
});

test("successful payloads keep their shape; invalid JSON cannot be mistaken for success", async () => {
  for (const value of [{ id: "saved-1" }, [{ id: "row-1" }], null]) {
    assert.deepEqual(await readApiResponse(Response.json(value)), value);
  }
  assert.deepEqual(await readApiResponse(new Response(null, { status: 204 })), {});
  await assert.rejects(readApiResponse(new Response("<html>Login</html>")), /unreadable response/);
  await assert.rejects(readApiResponse(new Response('{"broken":')), /unreadable response/);
});

test("CSV forms and routes share correct limits and reject wrong formats and empty exports", () => {
  for (const limit of [MAX_CAMPAIGN_CSV_BYTES, MAX_LSA_CSV_BYTES]) {
    assert.equal(csvUploadError({ name: "export.CSV", size: limit }, limit), null);
    assert.match(csvUploadError({ name: "export.csv", size: limit + 1 }, limit)!, /shorter date range/);
    assert.match(csvUploadError({ name: "export.xlsx", size: 100 }, limit)!, /CSV file/);
    assert.match(csvUploadError({ name: "export.csv", size: 0 }, limit)!, /empty/);
  }
});

test("vehicle upload rejects empty or unsupported files before decoding or sending", async () => {
  await assert.rejects(prepareVanDocumentImage(new File([], "empty.pdf", { type: "application/pdf" })), /empty/);
  await assert.rejects(prepareVanDocumentImage(new File(["data"], "file.txt", { type: "text/plain" })), /PDF, JPEG/);
  const image = new File(["image"], "photo.jpg", { type: "image/jpeg" });
  assert.equal(await prepareVanDocumentImage(image), image);
});
