import { authOptions } from "@/lib/auth";
import { analyzeSentiment, generateFollowUp } from "@/lib/ai";
import { checkThreadForReplies, sendEmailWithAttachment } from "@/lib/gmail";
import { getContactsToFollowUp, updateLogRow, getAutomationConfig } from "@/lib/sheets";

export async function POST(request: Request) {
  // Check for Cron Secret if triggered by Vercel
  const authHeader = request.headers.get('Authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const session = await getServerSession(authOptions);
  let accessToken = session?.accessToken;

  // For Cron, we'd need a stored token, but for now we fallback to session
  // or a system-wide token if the user provided one.
  if (!accessToken && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // NOTE: Headless cron with OAuth requires refresh token logic.
  // For this project, we prioritize the manual trigger and "Manual" mode visibility.

  try {
    const mode = await getAutomationConfig(accessToken!);
    const contacts = await getContactsToFollowUp(accessToken!);
    const results = [];

    for (const contact of contacts) {
      const replies = await checkThreadForReplies(
        accessToken!,
        contact.threadId,
        contact.messageId,
      );

      if (replies.length > 0) {
        const lastReply = replies[replies.length - 1];
        const sentiment = await analyzeSentiment(lastReply.snippet || "New reply received");
        
        await updateLogRow(accessToken!, contact.rowIndex, {
          status: `Replied (${sentiment})`,
          notes: `Reply detected on ${new Date().toLocaleDateString()}. Automation stopped.`,
          sentiment,
        });

        results.push({ email: contact.email, action: "detected-reply", sentiment });
        continue;
      }

      if (contact.followUpCount < 3) {
        if (mode === "automatic") {
          const nextCount = contact.followUpCount + 1;
          const aiBody = await generateFollowUp(
            process.env.EMAIL_BODY_TEMPLATE || "",
            contact.name,
            contact.company,
            nextCount,
          );

          const { messageId } = await sendEmailWithAttachment({
            accessToken: accessToken!,
            to: contact.email,
            subject: contact.subject,
            body: aiBody,
            attachmentPath: process.env.RESUME_PATH || "storage/resume.pdf",
          });

          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 5);

          await updateLogRow(accessToken!, contact.rowIndex, {
            messageId,
            followUpCount: nextCount,
            followUpDate: nextFollowUp,
            notes: `Auto-sent follow-up #${nextCount} on ${new Date().toLocaleDateString()}.`,
          });

          results.push({ email: contact.email, action: "sent-followup-auto", count: nextCount });
        } else {
          // Manual mode: Just flag it for the user
          await updateLogRow(accessToken!, contact.rowIndex, {
            status: "Follow-up Due",
            notes: "Follow-up is ready for manual review.",
          });
          results.push({ email: contact.email, action: "flagged-manual" });
        }
      } else {
        await updateLogRow(accessToken!, contact.rowIndex, {
          status: "Closed (No Reply)",
          notes: "Max follow-ups reached.",
        });
        results.push({ email: contact.email, action: "closed-max-reached" });
      }
    }

    return NextResponse.json({ success: true, processed: contacts.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
