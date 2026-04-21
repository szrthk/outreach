
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = "Write a short professional follow-up email to John at Google.";
  
  try {
    console.log("Generating...");
    const result = await model.generateContent(prompt);
    console.log("Response:", result.response.text());
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
