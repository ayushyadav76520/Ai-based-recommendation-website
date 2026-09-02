# RecoMind

AI recommendation site for movies, music, and books. Type your mood or
what you already like, pick a category, and OpenAI generates 6 picks.
History is stored in a flat JSON file (`data/history.json`) — no login,
no real database, kept deliberately simple for the project.

## Why a small backend (not calling OpenAI straight from the browser)

If the frontend JS calls OpenAI directly, your API key sits in plain
sight in the page source and anyone can copy it and rack up charges on
your account. A tiny Express server keeps the key in `.env` on the
server side only — the browser just talks to `/api/recommend`.

## Setup

1. Install Node.js (v18+) if you don't have it.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and paste in your OpenAI key:
   ```
   cp .env.example .env
   ```
   Then edit `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```
4. Run it:
   ```
   npm start
   ```
5. Open http://localhost:3000

## Project structure

```
recomind/
├── server.js          # Express server + OpenAI call + JSON "db"
├── data/history.json  # auto-created, stores past searches
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── .env               # your API key (never commit this)
```

## How it works

1. User picks a category (Movies / Music / Books) and types a mood or
   favorites.
2. Frontend POSTs to `/api/recommend`.
3. Server builds a prompt, calls OpenAI (`gpt-4o-mini`, forced JSON
   output), and returns 6 structured picks: title, creator, year, a
   one-line "why", and a vibe tag.
4. Each search is saved to `data/history.json`; the sidebar re-reads it
   so old searches are clickable.

## Ideas to extend it (good for a viva / demo talking points)

- Swap the flat JSON file for SQLite so multiple people's history
  doesn't collide.
- Add a "surprise me" button that randomizes the mood prompt.
- Let users thumbs-up/down a card and feed that back into the next
  prompt ("they liked X, avoid Y").
- Cache identical mood+category requests for an hour so you don't
  burn API calls on repeat testing.
- Deploy: server.js works as-is on Render/Railway; just set the
  `OPENAI_API_KEY` env var there instead of a local `.env`.
