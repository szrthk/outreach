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
    You are an expert executive assistant helping Sarthak Sagar, a seasoned DevOps & Site Reliability Engineer.
    
    CONTEXT:
    Sarthak previously reached out to ${recipientName} at ${companyName}.
    Original Template Used: """${originalEmail}"""
    This is follow-up #${followUpNumber}.
    
    OBJECTIVE:
    Write a short, professional, and highly personalized follow-up email. 
    It must feel human, empathetic, and low-pressure.
    
    TONE:
    - Confident but humble.
    - Insightful (mentions ${companyName}'s impact).
    - Concise.
    
    SEQUENCING GUIDELINES:
    - Follow-up 1: "Just resurfacing this in case it got buried. I'm really impressed by ${companyName}'s current growth."
    - Follow-up 2: "Thought of our last note. Given the current focus on reliability in ${companyName}'s space, I'd love to share some thoughts on infrastructure scaling."
    - Follow-up 3 (Final): "I'll take the silence as 'now isn't the right time'. I'll keep an eye on ${companyName} from afar. Let's stay in touch!"
    
    CONSTRAINTS:
    - Respond with ONLY the email body.
    - No subject lines.
    - Sign off as "Sarthak Sagar".
    - No placeholders like [Company Name].
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Follow-up Generation Error:", error);
    throw error;
  }
}

export async function generatePersonalizedHook(
  role: string,
  companyName: string,
) {
  const prompt = `
    You are a high-end recruiter and personal brand consultant for Sarthak Sagar, a DevOps Engineer.
    Sarthak is approaching ${companyName} for a ${role} position.
    
    TASK: Generate a single, captivating "hook" sentence for the first line of an email.
    The hook must:
    1. Show deep research into ${companyName}.
    2. Mention a specific technological challenge they likely face (e.g., scale, Kubernetes orchestration, CI/CD bottlenecks).
    3. Sound completely natural, not like a template.
    
    EXAMPLES:
    - "I've been closely following how ${companyName} is revolutionizing distributed storage, especially with the recent scale-up."
    - "Your team's focus on zero-downtime deployments caught my eye, as it's an area I've been optimizing for the past 4 years."
    
    OUTPUT:
    - Return ONLY the hook sentence.
    - No quotes, no intro text.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Hook Generation Error:", error);
    throw error;
  }
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
