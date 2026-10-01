import assert from "node:assert/strict";
import test from "node:test";
import { extractVanDocument, VanDocumentExtractionError } from "../src/lib/van-document-extraction";
import type { VanDocument } from "../src/lib/van-documents";

const pdf: VanDocument = {
  buffer: Buffer.from("%PDF-1.4\nsynthetic test file"),
  mimeType: "application/pdf",
  name: "sample.pdf",
  sha256: "test",
};

const extracted = {
  title: "Registration card", issueDate: "2026-01-01", expiryDate: "2027-01-01", notes: "Plate ABC123",
  year: 2024, make: "Ford", model: "Transit", vin: "1FTBR1C80RKA12345",
  licensePlate: "ABC123", insuranceCarrier: null, insuranceDeductible: null, insurancePremium: null,
  workPerformed: null, maintenanceCategory: null, mileage: null, vendor: null, cost: null,
  nextDueDate: null, nextDueMileage: null, invoiceNumber: null, workOrderNumber: null,
  subtotal: null, tax: null, amountPaid: null, balanceDue: null,
};

test("sends a PDF to OpenAI from the server and reads structured document fields", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousLegacyKey = process.env.openai;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-key";
  delete process.env.openai;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.input[0].content[1].type, "input_file");
      assert.equal(body.input[0].content[1].file_data, pdf.buffer.toString("base64"));
      assert.match(body.input[0].content[0].text, /Registration/);
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(extracted) }] }] });
    };
    assert.deepEqual(await extractVanDocument(pdf, "Registration"), extracted);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousLegacyKey === undefined) delete process.env.openai;
    else process.env.openai = previousLegacyKey;
  }
});

test("does not claim a document was read when the response is incomplete", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousLegacyKey = process.env.openai;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-key";
  delete process.env.openai;
  try {
    globalThis.fetch = async () => Response.json({ status: "incomplete", output: [] });
    await assert.rejects(extractVanDocument(pdf, "Registration"), VanDocumentExtractionError);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousLegacyKey === undefined) delete process.env.openai;
    else process.env.openai = previousLegacyKey;
  }
});

test("sends camera photos as image input", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousLegacyKey = process.env.openai;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-key";
  delete process.env.openai;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.input[0].content[1].type, "input_image");
      assert.match(body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(extracted) }] }] });
    };
    assert.equal((await extractVanDocument({ ...pdf, mimeType: "image/jpeg", name: "photo.jpg" }, "Title")).title, "Registration card");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousLegacyKey === undefined) delete process.env.openai;
    else process.env.openai = previousLegacyKey;
  }
});
