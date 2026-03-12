(function () {
  "use strict";

  const BASE = "https://api.themoviedb.org/3";
  const IMG_BASE = "https://image.tmdb.org/t/p/w500";
  const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 600' fill='%23333'%3E%3Crect width='400' height='600' fill='%23222'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%23666'%3E🎬%3C/text%3E%3C/svg%3E";

  const GENRES_IT = [
    { id: 28, name: "Azione" },
    { id: 12, name: "Avventura" },
    { id: 16, name: "Animazione" },
    { id: 35, name: "Commedia" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentario" },
    { id: 18, name: "Dramma" },
    { id: 10751, name: "Famiglia" },
    { id: 14, name: "Fantasy" },
    { id: 36, name: "Storico" },
    { id: 27, name: "Horror" },
    { id: 10402, name: "Musical" },
    { id: 9648, name: "Mistero" },
    { id: 10749, name: "Romance" },
    { id: 878, name: "Fantascienza" },
    { id: 53, name: "Thriller" },
    { id: 10752, name: "Guerra" },
    { id: 37, name: "Western" }
  ];

  let apiKey = (window.MOVIE_PICKER_CONFIG && window.MOVIE_PICKER_CONFIG.tmdbApiKey) || "";
  let genreIds = [];
  let includeAnimation = true;
  let currentMovies = [];
  let likedMovies = [];
  let stackIndex = 0;

  const $ = (id) => document.getElementById(id);
  const showScreen = (id) => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const el = $(id);
    if (el) el.classList.add("active");
  };

  function showApiHint(msg, isError) {
    const el = $("api-hint");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
  }

  function checkApiKey() {
    if (!apiKey || !apiKey.trim()) {
      showApiHint("Inserisci una API key TMDB in movie-picker/config.js (gratuita su themoviedb.org/settings/api)", true);
      return false;
    }
    showApiHint("");
    return true;
  }

  async function tmdb(path, params = {}) {
    const url = new URL(BASE + path);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "it-IT");
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("TMDB " + res.status);
    return res.json();
  }

  function normalizeMovie(m) {
    return {
      id: m.id,
      title: m.title || m.name,
      overview: (m.overview || "").slice(0, 200),
      year: (m.release_date || m.first_air_date || "").slice(0, 4),
      poster: m.poster_path ? IMG_BASE + m.poster_path : IMG_FALLBACK,
      genre_ids: m.genre_ids || []
    };
  }

  async function loadDiscover() {
    const withGenres = genreIds.length ? genreIds.join(",") : null;
    const params = { sort_by: "popularity.desc", page: 1 };
    if (withGenres) params.with_genres = withGenres;
    const data = await tmdb("/discover/movie", params);
    return (data.results || []).map(normalizeMovie);
  }

  async function searchMovie(query) {
    const data = await tmdb("/search/movie", { query, page: 1 });
    return (data.results || []).map(normalizeMovie);
  }

  async function loadSimilar(movieId) {
    const data = await tmdb(`/movie/${movieId}/similar`, { page: 1 });
    return (data.results || []).map(normalizeMovie);
  }

  function renderGenreChips() {
    const wrap = $("genre-chips");
    if (!wrap) return;
    wrap.innerHTML = GENRES_IT.map(
      (g) => `<button type="button" class="chip" data-id="${g.id}">${g.name}</button>`
    ).join("");
    wrap.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
        genreIds = Array.from(wrap.querySelectorAll(".chip.selected")).map((e) => +e.dataset.id);
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderCardsStack() {
    const stack = $("cards-stack");
    const placeholder = $("card-placeholder");
    if (!stack || !placeholder) return;

    placeholder.classList.add("hidden");
    stack.querySelectorAll(".movie-card").forEach((el) => el.remove());

    const toShow = currentMovies.slice(stackIndex, stackIndex + 3);
    toShow.forEach((movie, i) => {
      const card = document.createElement("div");
      card.className = "movie-card stack-" + i;
      card.dataset.movieId = movie.id;
      card.dataset.stackIndex = String(i);
      card.innerHTML = `
        <div class="card-poster-wrap">
          <img class="card-poster" src="${movie.poster}" alt="" loading="lazy">
          <div class="card-overlay like-overlay">LIKE</div>
          <div class="card-overlay nope-overlay">NOPE</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(movie.title)}</h3>
          <p class="card-meta">${movie.year ? movie.year : ""}</p>
          <p class="card-overview">${escapeHtml(movie.overview)}</p>
        </div>
      `;
      attachSwipeListeners(card, movie);
      stack.appendChild(card);
    });

    updateSwipeCounts();
  }

  function attachSwipeListeners(cardEl, movie) {
    let startX = 0, currentX = 0;

    function onStart(clientX) {
      if (!cardEl.classList.contains("stack-0")) return;
      cardEl.classList.add("dragging");
      startX = clientX;
      currentX = 0;
    }

    function onMove(clientX) {
      if (!cardEl.classList.contains("dragging")) return;
      currentX = clientX - startX;
      const rot = Math.min(30, Math.max(-30, currentX * 0.15));
      cardEl.style.transform = `translateX(calc(-50% + ${currentX}px)) rotate(${rot}deg)`;
      cardEl.classList.toggle("swipe-right", currentX > 50);
      cardEl.classList.toggle("swipe-left", currentX < -50);
    }

    function onEnd() {
      if (!cardEl.classList.contains("dragging")) return;
      cardEl.classList.remove("dragging");
      if (currentX > 80) {
        likeCard(cardEl, movie);
      } else if (currentX < -80) {
        nopeCard(cardEl, movie);
      } else {
        cardEl.style.transform = "";
        cardEl.classList.remove("swipe-right", "swipe-left");
      }
    }

    cardEl.addEventListener("mousedown", (e) => onStart(e.clientX));
    cardEl.addEventListener("touchstart", (e) => {
      e.preventDefault();
      onStart(e.touches[0].clientX);
    }, { passive: false });
    window.addEventListener("mousemove", (e) => {
      if (cardEl.classList.contains("dragging")) onMove(e.clientX);
    });
    window.addEventListener("touchmove", (e) => {
      if (cardEl.classList.contains("dragging") && e.touches[0]) onMove(e.touches[0].clientX);
    }, { passive: true });
    window.addEventListener("mouseup", () => onEnd());
    window.addEventListener("touchend", () => onEnd());
  }

  function likeCard(cardEl, movie) {
    cardEl.style.transform = "translateX(150%) rotate(20deg)";
    cardEl.style.opacity = "0";
    setTimeout(() => {
      likedMovies.push(movie);
      stackIndex++;
      renderCardsStack();
      if (stackIndex >= currentMovies.length) showPlaceholderOrMatches();
    }, 250);
  }

  function nopeCard(cardEl, movie) {
    cardEl.style.transform = "translateX(-150%) rotate(-20deg)";
    cardEl.style.opacity = "0";
    setTimeout(() => {
      stackIndex++;
      renderCardsStack();
      if (stackIndex >= currentMovies.length) showPlaceholderOrMatches();
    }, 250);
  }

  function showPlaceholderOrMatches() {
    const stack = $("cards-stack");
    const placeholder = $("card-placeholder");
    if (!stack || !placeholder) return;
    stack.querySelectorAll(".movie-card").forEach((el) => el.remove());
    placeholder.classList.remove("hidden");
    placeholder.textContent = "Finite le card. Vai ai match o fai una nuova ricerca.";
    updateSwipeCounts();
  }

  function updateSwipeCounts() {
    const countEl = $("swipe-count");
    const likesEl = $("swipe-likes");
    if (countEl) countEl.textContent = `${stackIndex}/${currentMovies.length} film`;
    if (likesEl) likesEl.textContent = "❤️ " + likedMovies.length;
  }

  function renderMatches() {
    const list = $("matches-list");
    const empty = $("matches-empty");
    if (!list || !empty) return;
    list.innerHTML = "";
    if (likedMovies.length === 0) {
      list.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    list.classList.remove("hidden");
    empty.classList.add("hidden");
    likedMovies.forEach((m) => {
      const div = document.createElement("div");
      div.className = "match-card";
      div.innerHTML = `
        <img src="${m.poster}" alt="">
        <div class="match-card-info">
          <h3 class="match-card-title">${escapeHtml(m.title)}</h3>
          <p class="match-card-meta">${m.year || ""}</p>
          <p class="match-card-overview">${m.overview}</p>
        </div>
      `;
      list.appendChild(div);
    });
  }

  function startSwipe(movies) {
    currentMovies = movies;
    stackIndex = 0;
    likedMovies = [];
    showScreen("screen-swipe");
    renderCardsStack();
  }

  const setupCards = document.querySelector(".setup-cards");
  const formStyle = $("form-style");
  const formSimilar = $("form-similar");

  $("btn-by-style")?.addEventListener("click", () => {
    $("btn-by-style")?.classList.add("hidden");
    $("btn-by-similar")?.classList.add("hidden");
    setupCards?.classList.add("hidden");
    formStyle?.classList.remove("hidden");
    renderGenreChips();
  });

  $("btn-by-similar")?.addEventListener("click", () => {
    $("btn-by-style")?.classList.add("hidden");
    $("btn-by-similar")?.classList.add("hidden");
    setupCards?.classList.add("hidden");
    formSimilar?.classList.remove("hidden");
    $("similar-input")?.focus();
  });

  $("include-animation")?.addEventListener("change", (e) => {
    includeAnimation = e.target.checked;
  });

  $("btn-start-style")?.addEventListener("click", async () => {
    if (!checkApiKey()) return;
    let ids = genreIds.length ? [...genreIds] : [35, 18, 16];
    if (!includeAnimation) ids = ids.filter((id) => id !== 16);
    genreIds = ids;
    try {
      const movies = await loadDiscover();
      if (movies.length === 0) {
        showApiHint("Nessun film trovato. Prova altri generi.", true);
        return;
      }
      startSwipe(movies);
    } catch (e) {
      showApiHint("Errore di connessione o API key non valida.", true);
    }
  });

  const similarInput = $("similar-input");
  const similarSuggestions = $("similar-suggestions");
  let similarDebounce = null;
  let selectedMovieId = null;

  similarInput?.addEventListener("input", () => {
    selectedMovieId = null;
    clearTimeout(similarDebounce);
    const q = similarInput.value.trim();
    if (q.length < 2) {
      similarSuggestions.classList.add("hidden");
      similarSuggestions.innerHTML = "";
      return;
    }
    similarDebounce = setTimeout(async () => {
      if (!apiKey) return;
      try {
        const list = await searchMovie(q);
        similarSuggestions.innerHTML = list.slice(0, 6).map(
          (m) => `<div class="similar-suggestion" data-id="${m.id}">${escapeHtml(m.title)}${m.year ? " (" + m.year + ")" : ""}</div>`
        ).join("");
        similarSuggestions.classList.remove("hidden");
        similarSuggestions.querySelectorAll(".similar-suggestion").forEach((el) => {
          el.addEventListener("click", () => {
            selectedMovieId = +el.dataset.id;
            similarInput.value = el.textContent.trim();
            similarSuggestions.classList.add("hidden");
          });
        });
      } catch (_) {
        similarSuggestions.classList.add("hidden");
      }
    }, 300);
  });

  $("btn-start-similar")?.addEventListener("click", async () => {
    if (!checkApiKey()) return;
    if (!selectedMovieId) {
      const q = similarInput?.value?.trim();
      if (q) {
        const list = await searchMovie(q);
        if (list.length) selectedMovieId = list[0].id;
      }
    }
    if (!selectedMovieId) {
      showApiHint("Nessun film trovato. Prova un altro titolo.", true);
      return;
    }
    try {
      const movies = await loadSimilar(selectedMovieId);
      if (movies.length === 0) {
        showApiHint("Nessun film simile trovato.", true);
        return;
      }
      startSwipe(movies);
    } catch (e) {
      showApiHint("Errore di connessione o API key non valida.", true);
    }
  });

  $("btn-nope")?.addEventListener("click", () => {
    const top = document.querySelector(".cards-stack .movie-card.stack-0");
    if (top) {
      const movie = currentMovies.find((m) => m.id === +top.dataset.movieId);
      if (movie) nopeCard(top, movie);
    }
  });

  $("btn-like")?.addEventListener("click", () => {
    const top = document.querySelector(".cards-stack .movie-card.stack-0");
    if (top) {
      const movie = currentMovies.find((m) => m.id === +top.dataset.movieId);
      if (movie) likeCard(top, movie);
    }
  });

  $("btn-see-matches")?.addEventListener("click", () => {
    renderMatches();
    showScreen("screen-matches");
  });

  $("btn-back-to-swipe")?.addEventListener("click", () => showScreen("screen-swipe"));

  $("btn-new-search")?.addEventListener("click", () => {
    showScreen("screen-setup");
    setupCards?.classList.remove("hidden");
    $("btn-by-style")?.classList.remove("hidden");
    $("btn-by-similar")?.classList.remove("hidden");
    formStyle?.classList.add("hidden");
    formSimilar?.classList.add("hidden");
    if (similarInput) similarInput.value = "";
    selectedMovieId = null;
    showApiHint("");
  });

  if (apiKey && apiKey.trim()) showApiHint("API key configurata. Scegli come cercare i film.");
})();
