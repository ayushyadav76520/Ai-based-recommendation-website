// server.js — tiny Express backend using Google Gemini (free tier)
const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "history.json");
const GEMINI_MODEL = "gemini-3.6-flash";

app.use(express.json());
app.use(express.static(__dirname));

function readDB() {
  if (!fs.existsSync(DB_PATH)) return { entries: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

app.post("/api/recommend", async (req, res) => {
  const { category, mood, favorites } = req.body;

  if (!mood || !category) {
    return res.status(400).json({ error: "category and mood are required" });
  }

  const categoryLabel = { movie: "movies", music: "music/songs or albums", book: "books" }[category] || category;

  const prompt = `You are a sharp, well-read recommendation engine for ${categoryLabel}.
Given a person's mood/taste description, return exactly 6 recommendations.
Respond with ONLY valid JSON, no markdown fences, no preamble, no explanation text, in this exact shape:
{"items":[{"title":"","creator":"","year":"","why":"one punchy sentence, max 22 words","tag":"one 2-3 word vibe tag"}]}

Mood / taste: "${mood}"
${favorites ? `They already like: ${favorites}` : ""}
Category: ${categoryLabel}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini error:", errText);
      return res.status(502).json({ error: "Gemini request failed" });
    }

    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(raw);

    const db = readDB();
    db.entries.unshift({
      id: Date.now(),
      category,
      mood,
      items: parsed.items,
      createdAt: new Date().toISOString(),
    });
    db.entries = db.entries.slice(0, 200);
    writeDB(db);

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something broke generating recommendations" });
  }
});

app.get("/api/history", (req, res) => {
  res.json(readDB().entries.slice(0, 20));
});

app.delete("/api/history", (req, res) => {
  writeDB({ entries: [] });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`RecoMind running at http://localhost:${PORT}`);
});