import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getRecentLogs, getAutomationConfig, updateAutomationConfig } from "@/lib/sheets";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const logs = await getRecentLogs(session.accessToken);
    const config = await getAutomationConfig(session.accessToken);
    return NextResponse.json({ logs, config });
  } catch (error) {
    console.error("Dashboard Fetch Error Detail:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { mode } = await request.json();
    await updateAutomationConfig(session.accessToken, mode);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
