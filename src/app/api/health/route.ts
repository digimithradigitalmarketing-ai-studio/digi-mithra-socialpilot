import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "digimithra-social-pilot", time: new Date().toISOString() });
}
