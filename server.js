// server.js
// RecoMind - AI recommendation website
// Express backend + Google Gemini API

const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

// Render provides PORT automatically.
// Locally, it will use 3000.
const PORT = process.env.PORT || 3000;

// Gemini model
const GEMINI_MODEL = "gemini-3.7-flash";

// Database file
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "history.json");

// Make sure data directory exists.
// This prevents ENOENT errors on deployment.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// If history.json doesn't exist, create it.
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify({ entries: [] }, null, 2),
    "utf-8"
  );
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname));


// --------------------------------------------------
// DATABASE HELPERS
// --------------------------------------------------

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { entries: [] };
    }

    const raw = fs.readFileSync(DB_PATH, "utf-8");

    if (!raw.trim()) {
      return { entries: [] };
    }

    const data = JSON.parse(raw);

    if (!data || !Array.isArray(data.entries)) {
      return { entries: [] };
    }

    return data;
  } catch (error) {
    console.error("Database read error:", error);
    return { entries: [] };
  }
}


function writeDB(data) {
  try {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("Database write error:", error);
    throw error;
  }
}


// --------------------------------------------------
// RECOMMENDATION API
// --------------------------------------------------

app.post("/api/recommend", async (req, res) => {
  const { category, mood, favorites } = req.body;

  // Validate input
  if (!category || !mood) {
    return res.status(400).json({
      error: "category and mood are required"
    });
  }

  // Check Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing.");

    return res.status(500).json({
      error: "Gemini API key is not configured"
    });
  }

  // Convert category to a readable label
  const categoryLabel = {
    movie: "movies",
    music: "music, songs or albums",
    book: "books"
  }[category] || category;


  // --------------------------------------------------
  // GEMINI PROMPT
  // --------------------------------------------------

  const prompt = `
You are RecoMind, a smart and selective recommendation engine.

The user wants recommendations for ${categoryLabel}.

Return exactly 6 recommendations.

IMPORTANT:
- Return ONLY valid JSON.
- Do NOT use markdown.
- Do NOT use code fences.
- Do NOT add explanations outside the JSON.
- Do NOT add extra fields.
- Make the recommendations relevant to the user's mood and taste.
- Avoid recommending an item the user already listed as a favorite when possible.

Use EXACTLY this JSON structure:

{
  "items": [
    {
      "title": "",
      "creator": "",
      "year": "",
      "why": "",
      "tag": ""
    }
  ]
}

Rules:
- "title": must contain the movie/song/book title.
- "creator" must contain the director/artist/author.
- "year" must contain the release/publication year when known.
- "why" must be one punchy sentence, maximum 22 words.
- "tag" must be a short 2-3 word vibe tag.
- Return exactly 6 objects inside "items".

User mood / taste:
${mood}

${
  favorites
    ? `Things the user already likes:
${favorites}`
    : "The user did not provide existing favorites."
}

Category:
${categoryLabel}
`;


  try {
    // --------------------------------------------------
    // GEMINI API REQUEST
    // --------------------------------------------------

    const url =
      `https://generativelanguage.googleapis.com/v1beta/` +
      `models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        // IMPORTANT:
        // Gemini API key is sent through this header.
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },

      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],

        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });


    // --------------------------------------------------
    // HANDLE GEMINI API ERRORS
    // --------------------------------------------------

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Gemini API error:");
      console.error(errorText);

      return res.status(502).json({
        error: "Gemini request failed"
      });
    }


    // --------------------------------------------------
    // READ GEMINI RESPONSE
    // --------------------------------------------------

    const data = await response.json();

    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;


    if (!raw) {
      console.error(
        "Gemini returned an unexpected response:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        error: "Gemini returned an empty response"
      });
    }


    // --------------------------------------------------
    // PARSE JSON
    // --------------------------------------------------

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON:");
      console.error(raw);

      return res.status(502).json({
        error: "Gemini returned invalid JSON"
      });
    }


    // --------------------------------------------------
    // VALIDATE RESPONSE
    // --------------------------------------------------

    if (
      !parsed ||
      !Array.isArray(parsed.items)
    ) {
      console.error(
        "Invalid recommendation structure:",
        JSON.stringify(parsed, null, 2)
      );

      return res.status(502).json({
        error: "Invalid recommendation format"
      });
    }


    // Keep maximum 6 recommendations
    parsed.items = parsed.items.slice(0, 6);


    // --------------------------------------------------
    // SAVE HISTORY
    // --------------------------------------------------

    try {
      const db = readDB();

      db.entries.unshift({
        id: Date.now(),
        category,
        mood,
        favorites: favorites || "",
        items: parsed.items,
        createdAt: new Date().toISOString()
      });

      // Keep last 200 records
      db.entries = db.entries.slice(0, 200);

      writeDB(db);
    } catch (dbError) {
      // Recommendation should still work even if history
      // storage fails.
      console.error(
        "History save failed:",
        dbError
      );
    }


    // --------------------------------------------------
    // SEND RESULT TO FRONTEND
    // --------------------------------------------------

    return res.json(parsed);

  } catch (error) {
    console.error(
      "Recommendation server error:",
      error
    );

    return res.status(500).json({
      error: "Something broke generating recommendations"
    });
  }
});


// --------------------------------------------------
// HISTORY API
// --------------------------------------------------

app.get("/api/history", (req, res) => {
  try {
    const db = readDB();

    return res.json(
      db.entries.slice(0, 20)
    );

  } catch (error) {
    console.error(
      "History API error:",
      error
    );

    return res.status(500).json({
      error: "Could not load history"
    });
  }
});


// --------------------------------------------------
// DELETE HISTORY
// --------------------------------------------------

app.delete("/api/history", (req, res) => {
  try {
    writeDB({
      entries: []
    });

    return res.json({
      ok: true
    });

  } catch (error) {
    console.error(
      "Delete history error:",
      error
    );

    return res.status(500).json({
      error: "Could not clear history"
    });
  }
});


// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  return res.json({
    ok: true,
    service: "RecoMind",
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY
    )
  });
});


// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `RecoMind running on port ${PORT}`
  );
});