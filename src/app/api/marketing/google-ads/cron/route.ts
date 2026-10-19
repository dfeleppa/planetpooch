import { NextRequest, NextResponse } from "next/server";
import { addCalendarDays, formatEasternDate } from "@/lib/marketing/submission-date-range";
import { GoogleAdsApiError, GoogleAdsConfigError, syncGoogleAdsWindow } from "@/lib/marketing/google-ads-sync";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yesterday = addCalendarDays(formatEasternDate(new Date()), -1)!;
  const last7 = addCalendarDays(yesterday, -6)!;
  const last30 = addCalendarDays(yesterday, -29)!;
  const last90 = addCalendarDays(yesterday, -89)!;
  const monthStart = `${yesterday.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const previousMonthEnd = addCalendarDays(monthStart, -1)!;
  const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;
  const windows = [
    { from: last7, to: yesterday },
    { from: last30, to: yesterday },
    { from: last90, to: yesterday },
    { from: monthStart, to: monthEnd },
    { from: previousMonthStart, to: previousMonthEnd },
  ].filter((window, index, all) => all.findIndex((other) => other.from === window.from && other.to === window.to) === index);
  try {
    const results = [];
    for (const window of windows) {
      const result = await syncGoogleAdsWindow(window.from, window.to);
      results.push(result);
      if (!result.synced) return NextResponse.json({ results }, { status: 409 });
    }
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Ads sync failed.";
    return NextResponse.json({ error: message }, { status: error instanceof GoogleAdsConfigError ? 503 : error instanceof GoogleAdsApiError ? 502 : 500 });
  }
}
