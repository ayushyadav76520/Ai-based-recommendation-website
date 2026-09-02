const stubs = document.querySelectorAll(".stub");
const form = document.getElementById("mood-form");
const submitBtn = document.getElementById("submit-btn");
const resultsEl = document.getElementById("results");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");
const cardTemplate = document.getElementById("card-template");

let activeCategory = "movie";

stubs.forEach(stub => {
  stub.addEventListener("click", () => {
    stubs.forEach(s => { s.classList.remove("active"); s.setAttribute("aria-selected", "false"); });
    stub.classList.add("active");
    stub.setAttribute("aria-selected", "true");
    activeCategory = stub.dataset.cat;
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mood = document.getElementById("mood").value.trim();
  const favorites = document.getElementById("favorites").value.trim();
  if (!mood) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Thinking…";
  resultsEl.innerHTML = `<p class="status-msg">Pulling together six picks for you…</p>`;

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: activeCategory, mood, favorites }),
    });

    if (!res.ok) throw new Error("Request failed");
    const data = await res.json();
    renderResults(data.items || []);
    loadHistory();
  } catch (err) {
    resultsEl.innerHTML = `<p class="status-msg error">Couldn't get recommendations right now. Check the server is running and the API key is set, then try again.</p>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Get recommendations";
  }
});

function renderResults(items) {
  resultsEl.innerHTML = "";
  if (!items.length) {
    resultsEl.innerHTML = `<p class="status-msg">No picks came back — try describing your mood differently.</p>`;
    return;
  }
  items.forEach(item => {
    const node = cardTemplate.content.cloneNode(true);
    node.querySelector(".card-tag").textContent = item.tag || activeCategory;
    node.querySelector(".card-year").textContent = item.year || "";
    node.querySelector(".card-title").textContent = item.title || "Untitled";
    node.querySelector(".card-creator").textContent = item.creator || "";
    node.querySelector(".card-why").textContent = item.why || "";
    resultsEl.appendChild(node);
  });
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const entries = await res.json();
    historyList.innerHTML = "";
    if (!entries.length) {
      historyList.innerHTML = `<li class="hist-empty">Nothing yet — your first search will show up here.</li>`;
      return;
    }
    entries.forEach(entry => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="hist-cat">${entry.category}</span><span>${entry.mood}</span>`;
      li.addEventListener("click", () => {
        stubs.forEach(s => {
          const match = s.dataset.cat === entry.category;
          s.classList.toggle("active", match);
          s.setAttribute("aria-selected", String(match));
          if (match) activeCategory = entry.category;
        });
        document.getElementById("mood").value = entry.mood;
        renderResults(entry.items);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      historyList.appendChild(li);
    });
  } catch {
    historyList.innerHTML = `<li class="hist-empty">Couldn't load history.</li>`;
  }
}

clearHistoryBtn.addEventListener("click", async () => {
  await fetch("/api/history", { method: "DELETE" });
  loadHistory();
});

loadHistory();
