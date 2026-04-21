import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateFollowUp } from "@/lib/ai";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name, company, followUpCount } = await request.json();
    const body = await generateFollowUp(
      process.env.EMAIL_BODY_TEMPLATE || "",
      name,
      company,
      (followUpCount || 0) + 1
    );
    return NextResponse.json({ body });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate AI preview" }, { status: 500 });
  }
}
