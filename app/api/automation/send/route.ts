import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { sendEmailWithAttachment } from "@/lib/gmail";
import { updateLogRow } from "@/lib/sheets";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rowIndex, email, subject, body, followUpCount } = await request.json();
    
    const { messageId } = await sendEmailWithAttachment({
      accessToken: session.accessToken,
      to: email,
      subject: subject,
      body: body,
      attachmentPath: process.env.RESUME_PATH || "storage/resume.pdf",
    });

    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + 5);

    await updateLogRow(session.accessToken, rowIndex, {
      status: "No Reply", // Reset to No Reply to allow further automation
      messageId,
      followUpCount: (followUpCount || 0) + 1,
      followUpDate: nextFollowUp,
      notes: `Manual follow-up sent on ${new Date().toLocaleDateString()}.`,
    });

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
