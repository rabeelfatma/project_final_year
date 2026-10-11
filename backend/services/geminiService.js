const { GoogleGenerativeAI } = require("@google/generative-ai");

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const configured = String(process.env.GEMINI_MODEL || "").trim();
  const modelName = configured || "gemini-3.8-flash";
  return genAI.getGenerativeModel({ model: modelName });
}

function parseJsonResponse(raw) {
  const cleaned = String(raw || "").replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Gemini returned a response that was not valid JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateJson(parts, maxAttempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      });
      return parseJsonResponse((await result.response).text());
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      const transient = /(?:429|408|500|502|503|504|unavailable|temporar|overload|timeout)/i.test(message);

      if (!transient || attempt === maxAttempts) break;

      const delay = Math.min(12000, 1000 * (2 ** (attempt - 1))) +
        Math.floor(Math.random() * 600);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const message = lastError?.message || String(lastError || "Unknown Gemini error");

  if (/503|unavailable|overload|temporar/i.test(message)) {
    throw new Error(`Gemini is temporarily unavailable. Submission was NOT graded as zero. Retry later. Details: ${message}`);
  }
  if (/429|quota|rate limit/i.test(message)) {
    throw new Error(`Gemini quota/rate limit reached. Check Google AI Studio quota or GEMINI_MODEL. Details: ${message}`);
  }
  throw new Error(`AI request failed: ${message}`);
}

exports.checkAssignment = async (text, teacherInstructions, totalMarks, media = []) => {
  const maximum = Number(totalMarks);
  if (!Number.isFinite(maximum) || maximum <= 0) {
    throw new Error("Total marks are missing or invalid.");
  }

  const instructions = String(teacherInstructions || "").trim();
  if (!instructions) throw new Error("Teacher grading instructions are required.");

  const prompt = `You are grading a student's academic assignment.
Maximum marks: ${maximum}
Teacher instructions: ${instructions}

Student submission text (may be incomplete if the file format could not be extracted):
${String(text || "").slice(0, 120000)}

Grade strictly between 0 and ${maximum}. Do not exceed the maximum. Do not give a zero just because content is missing; if there is no assessable content, explain that in feedback.
Return ONLY JSON: {"score": number, "feedback": "short useful feedback"}`;

  const parts = [{ text: prompt }];
  for (const item of (Array.isArray(media) ? media : []).slice(0, 25)) {
    if (item?.data && item?.mimeType) {
      parts.push({ inlineData: { data: item.data, mimeType: item.mimeType } });
    }
  }

  const parsed = await generateJson(parts);
  const score = Number(parsed.score);

  if (!Number.isFinite(score)) throw new Error("Gemini returned an invalid score.");

  return {
    score: Math.min(maximum, Math.max(0, score)),
    feedback: String(parsed.feedback || "AI evaluation completed."),
  };
};

exports.askQuickCheckAI = async (role, question, context, attachments = []) => {
  const attachmentSummary = attachments.map((attachment, index) => ({
    index: index + 1,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    extractedText: attachment.text || "",
  }));

  const prompt = `You are QuickCheck Hub's ${role} workspace assistant.
Use the role-specific database context for factual system questions. Do not invent counts, users, grades, assignments, or system facts.
For teacher requests, you may create academic content, code, templates, lesson material, and presentation slide outlines.
If files are attached, analyze their extracted text and/or image data.

When asked for downloadable content, return artifact specs:
- Text/code/data: {"type":"text","name":"example.py","content":"full file content"}
- PowerPoint: {"type":"slides","name":"lesson.pptx","title":"...","slides":[{"title":"...","bullets":["..."]}]}
- Word: {"type":"document","name":"report.docx","title":"...","sections":[{"heading":"...","paragraphs":["..."]}]}
- Excel: {"type":"spreadsheet","name":"data.xlsx","sheets":[{"name":"Sheet1","rows":[["Header1"],["A"]]}]}
Keep artifacts to 8 per reply and slides to at most 30. Never claim a file was created unless included in artifacts.
Return ONLY JSON: {"answer":"concise useful answer","artifacts":[]}

ROLE DATA:
${String(context || "").slice(0, 80000)}

ATTACHED FILE METADATA/TEXT:
${JSON.stringify(attachmentSummary).slice(0, 80000)}

USER QUESTION:
${String(question || "").slice(0, 12000)}`;

  const parts = [{ text: prompt }];
  for (const attachment of attachments) {
    if (attachment.inlineData && attachment.mimeType) {
      parts.push({
        inlineData: {
          data: attachment.inlineData,
          mimeType: attachment.mimeType,
        },
      });
    }
  }

  try {
    const parsed = await generateJson(parts, 3);
    return {
      answer: String(parsed.answer || "Done."),
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    };
  } catch (error) {
    const message = error?.message || String(error);
    if (/429|quota/i.test(message)) {
      throw new Error("Gemini quota/rate limit reached. Check GEMINI_API_KEY and GEMINI_MODEL.");
    }
    throw new Error(`AI assistant failed: ${message}`);
  }
};
