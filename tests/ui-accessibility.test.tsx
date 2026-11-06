import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "../src/components/ui/input";
import { Select } from "../src/components/ui/Select";
import { DateInput } from "../src/components/ui/DateInput";
import { ConfirmDialog } from "../src/components/ui/confirm-dialog";
import { Tabs } from "../src/components/ui/Tabs";
import { isReportFromEarlierDay } from "../src/lib/report-snapshot";

test("shared controls associate generated labels and errors without losing caller descriptions", () => {
  for (const Component of [Input, Select, DateInput]) {
    const html = renderToStaticMarkup(<Component label="Amount" error="Required" aria-describedby="help" />);
    const id = html.match(/<(?:input|select)[^>]* id="([^"]+)"/)?.[1];
    assert.ok(id);
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`aria-describedby="help ${id}-error"`));
    assert.ok(html.includes(`id="${id}-error"`));
    assert.match(html, /aria-invalid="true"/);
  }
});

test("explicit IDs remain stable and independent controls have distinct generated IDs", () => {
  const html = renderToStaticMarkup(<><Input id="cash" label="Cash" /><Input label="One" /><Input label="Two" /></>);
  assert.match(html, /for="cash"/);
  const ids = [...html.matchAll(/<input[^>]* id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, 3);
});

test("confirmation has native dialog semantics and linked title and description", () => {
  const html = renderToStaticMarkup(<ConfirmDialog open title="Reset completion?" message="Review this change." onConfirm={() => {}} onCancel={() => {}} />);
  assert.match(html, /<dialog/);
  for (const attribute of ["aria-labelledby", "aria-describedby"]) {
    const id = html.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
    assert.ok(id && html.includes(`id="${id}"`));
  }
  assert.equal(renderToStaticMarkup(<ConfirmDialog open={false} title="Hidden" message="Hidden" onConfirm={() => {}} onCancel={() => {}} />), "");
});

test("only the active tab enters the normal tab order", () => {
  const html = renderToStaticMarkup(<Tabs tabs={[{ id: "a", label: "First" }, { id: "b", label: "Second" }]} activeTab="b" onChange={() => {}} />);
  assert.match(html, /aria-selected="false" tabindex="-1"/);
  assert.match(html, /aria-selected="true" tabindex="0"/);
});

test("snapshot age uses New York calendar days across midnight and the DST change", () => {
  assert.equal(isReportFromEarlierDay("2026-11-06T04:30:00Z", new Date("2026-11-06T04:59:00Z")), false);
  assert.equal(isReportFromEarlierDay("2026-11-06T04:30:00Z", new Date("2026-11-06T05:00:00Z")), true);
  assert.equal(isReportFromEarlierDay("2026-11-01T05:30:00Z", new Date("2026-11-01T06:30:00Z")), false);
  assert.equal(isReportFromEarlierDay("2026-11-01T06:30:00Z", new Date("2026-11-02T05:00:00Z")), true);
});
