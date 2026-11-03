import test from "node:test";
import assert from "node:assert/strict";
import { prepareEmployeeDocument, readDocumentUploadResponse } from "../src/lib/employee-document-upload";

test("small documents are unchanged; oversized PDFs and unsupported files fail before upload", async () => {
  const pdf = new File(["pdf"], "form.pdf", { type: "application/pdf" });
  assert.equal(await prepareEmployeeDocument(pdf), pdf);
  await assert.rejects(prepareEmployeeDocument(new File([new Uint8Array(4_000_001)], "form.pdf", { type: "application/pdf" })), /under 4 MB/);
  await assert.rejects(prepareEmployeeDocument(new File(["data"], "file.exe")), /supported image/);
  await assert.rejects(prepareEmployeeDocument(new File([], "empty.pdf", { type: "application/pdf" })), /empty/);
});

test("a 10.1 MB photo is resized locally and uploaded as a correctly named JPEG", async () => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const draws: number[][] = [];
  try {
    Object.assign(globalThis, {
      Image: class {
        naturalWidth = 5600;
        naturalHeight = 4200;
        async decode() {}
      },
      document: {
        createElement() {
          return {
            width: 0, height: 0,
            getContext: () => ({ fillRect() {}, drawImage: (_image: unknown, ...args: number[]) => draws.push(args) }),
            toBlob: (callback: (blob: Blob) => void, type: string) => callback(new Blob(["resized"], { type })),
          };
        },
      },
    });
    const photo = new File([new Uint8Array(10_600_000)], "1000067880.png", { type: "image/png" });
    const prepared = await prepareEmployeeDocument(photo);
    assert.equal(prepared.name, "1000067880.jpg");
    assert.equal(prepared.type, "image/jpeg");
    assert.ok(prepared.size < 4_000_000);
    assert.deepEqual(draws, [[0, 0, 2800, 2100]]);
  } finally {
    Object.assign(globalThis, { Image: originalImage, document: originalDocument });
  }
});

test("plain-text hosting errors never surface JSON parse failures", async () => {
  await assert.rejects(readDocumentUploadResponse(new Response("Request Entity Too Large", { status: 413 })), /too large/);
  await assert.rejects(readDocumentUploadResponse(new Response("Bad Gateway", { status: 502 })), /upstream service/);
  await assert.rejects(readDocumentUploadResponse(Response.json({ error: "Employee not found" }, { status: 404 })), /Employee not found/);
  await assert.rejects(readDocumentUploadResponse(new Response("login page")), /unreadable response/);
  const uploaded = { id: "document-1", fileName: "card.jpg" };
  assert.deepEqual(await readDocumentUploadResponse(Response.json(uploaded, { status: 201 })), uploaded);
});
