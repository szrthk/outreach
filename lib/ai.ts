import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export type SentimentResult = "Interested" | "Not Interested" | "Neutral" | "Meeting Booked";

export async function generateFollowUp(
  originalEmail: string,
  recipientName: string,
  companyName: string,
  followUpNumber: number,
) {
  const prompt = `
    You are a professional outreach assistant. 
    You sent an original email to ${recipientName} at ${companyName}.
    
    Original Email:
    """
    ${originalEmail}
    """
    
    This is follow-up number ${followUpNumber}.
    
    Task: Write a short, polite, and personalized follow-up email.
    - If follow-up 1: Be gentle, just checking if they saw the previous email.
    - If follow-up 2: Add a bit more value or express enthusiasm about their company.
    - If follow-up 3: Mention this is the last time you'll reach out, and leave the door open.
    
    Guidelines:
    - No subject line (it will be sent in a thread).
    - Keep it under 3-4 sentences.
    - Do not use placeholders like [Your Name]. Use "Sarthak Sagar".
    - Tone: Professional, slightly casual, not "bot-like".
    
    Respond with ONLY the email body text.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

export async function generatePersonalizedHook(
  role: string,
  companyName: string,
) {
  const prompt = `
    You are a career expert and assistant for Sarthak Sagar, a DevOps Engineer.
    Sarthak is applying for a ${role} role at ${companyName}.
    
    Task: Write a single, high-impact sentence (personalized hook) that Sarthak can use in his email to ${companyName}.
    - The hook should mention ${companyName}'s likely tech stack or a general compliment about their scale/impact.
    - It should sound like Sarthak has done his research.
    - Example: "I've been following ${companyName}'s work in scaling distributed systems and would love to contribute to your infrastructure team."
    
    Respond with ONLY the sentence. No quotes.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

export async function analyzeSentiment(emailBody: string): Promise<SentimentResult> {
  const prompt = `
    Analyze the following email reply and classify it into one of these categories:
    - "Interested": Person wants to talk more, asks for a demo/call, or expresses positive interest.
    - "Not Interested": Person says "no thanks", "not now", "please stop", etc.
    - "Neutral": Out of office, "talk later", or ambiguous.
    - "Meeting Booked": Person mentions a specific time to meet or asks to "book a slot".

    Email Reply:
    """
    ${emailBody}
    """

    Respond with ONLY the category name. No explanations.
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    if (text.includes("Interested")) return "Interested";
    if (text.includes("Not Interested")) return "Not Interested";
    if (text.includes("Meeting Booked")) return "Meeting Booked";
    return "Neutral";
  } catch (error) {
    console.error("AI Sentiment Error:", error);
    return "Neutral";
  }
}
