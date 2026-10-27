import { NextResponse } from "next/server";
export async function POST() {
 return NextResponse.json({ error: "Password access has been retired. Sign in with Google or Apple." }, { status: 410 });
}
