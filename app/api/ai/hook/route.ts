import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { generatePersonalizedHook } from "@/lib/ai";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { role, company } = await request.json();
    const hook = await generatePersonalizedHook(
      role || "DevOps Engineer",
      company || "your company"
    );

    return NextResponse.json({ hook });
  } catch (error) {
    return NextResponse.json({ error: "AI failed to generate hook" }, { status: 500 });
  }
}
