"use client";

export function MarketingPrintButton() {
  return <button
    type="button"
    onClick={() => window.print()}
    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 print:hidden"
  >
    Print report
  </button>;
}
