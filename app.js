(function () {
  "use strict";

  const BASE = "https://api.themoviedb.org/3";
  const IMG_BASE = "https://image.tmdb.org/t/p/w500";
  const IMG_LOGO = "https://image.tmdb.org/t/p/w45";
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
  let yearFilter = "";
  let providerIds = [];
  let ratingFilter = "";
  let yearFilterSimilar = "";
  let ratingFilterSimilar = "";
  let currentMovies = [];
  let likedMovies = [];
  let stackIndex = 0;
  const watchProvidersCardCache = new Map();
  /** Testo "perché" mostrato sulle card swipe e sui match (sessione). */
  let sessionSwipeWhy = "";

  const MOOD_PRESETS = [
    {
      label: "Romantico",
      whyLine: "Romance e commedia: serata morbida sul divano.",
      genreIds: [10749, 35],
      includeAnimation: true,
      ratingFilter: "",
      yearFilter: ""
    },
    {
      label: "Leggero",
      whyLine: "Per staccare la giornata senza pensieri.",
      genreIds: [35],
      includeAnimation: true,
      ratingFilter: "",
      yearFilter: ""
    },
    {
      label: "Animazione cozy",
      whyLine: "Colori caldi e storie avvolgenti — anche per chi ha già messo via lo zainetto.",
      genreIds: [16, 10751],
      includeAnimation: true,
      ratingFilter: "",
      yearFilter: ""
    },
    {
      label: "Thriller ma non troppo",
      whyLine: "Suspense e mistero, senza horror estremo.",
      genreIds: [53, 9648],
      includeAnimation: false,
      ratingFilter: "6",
      yearFilter: ""
    },
    {
      label: "Per piangere",
      whyLine: "Drammi che ti sciolgono — fazzoletti a portata di mano.",
      genreIds: [18],
      includeAnimation: true,
      ratingFilter: "",
      yearFilter: ""
    },
    {
      label: "Comfort movie",
      whyLine: "Quella sensazione di casa, risate e calore.",
      genreIds: [35, 10749],
      includeAnimation: true,
      ratingFilter: "",
      yearFilter: ""
    }
  ];

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
      showApiHint(
        "Per iniziare serve una chiave TMDB (gratis): apri config.js, incollala, salva e ricarica la pagina. Link: themoviedb.org/settings/api",
        true
      );
      return false;
    }
    showApiHint("");
    return true;
  }

  function hideSetupChoiceButtons() {
    $("btn-by-style")?.classList.add("hidden");
    $("btn-by-similar")?.classList.add("hidden");
    $("btn-by-watch")?.classList.add("hidden");
  }

  function showSetupChoiceButtons() {
    $("btn-by-style")?.classList.remove("hidden");
    $("btn-by-similar")?.classList.remove("hidden");
    $("btn-by-watch")?.classList.remove("hidden");
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
      overview: m.overview || "",
      year: (m.release_date || m.first_air_date || "").slice(0, 4),
      poster: m.poster_path ? IMG_BASE + m.poster_path : IMG_FALLBACK,
      genre_ids: m.genre_ids && m.genre_ids.length ? m.genre_ids : (m.genres || []).map((g) => g.id),
      rating: m.vote_average || null,
      vote_count: m.vote_count != null ? m.vote_count : 0
    };
  }

  async function loadDiscover() {
    const withGenres = genreIds.length ? genreIds.join(",") : null;
    const params = { sort_by: "popularity.desc", page: 1, watch_region: "IT" };
    if (withGenres) params.with_genres = withGenres;
    if (yearFilter) {
      params["primary_release_date.gte"] = `${yearFilter}-01-01`;
    }
    if (ratingFilter) {
      params["vote_average.gte"] = Number(ratingFilter);
      params["vote_count.gte"] = 100;
    }
    if (providerIds.length) {
      params.with_watch_providers = providerIds.join("|");
      params.with_watch_monetization_types = "flatrate|ads|buy|rent";
    }
    const data = await tmdb("/discover/movie", params);
    let movies = (data.results || []).map(normalizeMovie);
    if (!movies.length && providerIds.length) {
      // fallback: se nessun titolo su queste piattaforme, riprova senza filtro piattaforme
      showApiHint("Su quelle piattaforme non c’è nulla con questi filtri: ti mostriamo anche altri servizi, ok?", true);
      delete params.with_watch_providers;
      delete params.with_watch_monetization_types;
      const dataFallback = await tmdb("/discover/movie", params);
      movies = (dataFallback.results || []).map(normalizeMovie);
    }
    return movies;
  }

  async function searchMovie(query) {
    const data = await tmdb("/search/movie", {
      query,
      page: 1,
      include_adult: false,
      region: "IT"
    });
    return (data.results || []).map(normalizeMovie);
  }

  function genreOverlapScore(seedGenreIds, movieGenreIds) {
    if (!seedGenreIds || !seedGenreIds.length || !movieGenreIds || !movieGenreIds.length) return 0;
    const seed = new Set(seedGenreIds);
    let n = 0;
    for (let i = 0; i < movieGenreIds.length; i++) {
      if (seed.has(movieGenreIds[i])) n++;
    }
    return n;
  }

  async function loadSimilar(movieId) {
    const [details, rec1, rec2, sim] = await Promise.all([
      tmdb(`/movie/${movieId}`, {}),
      tmdb(`/movie/${movieId}/recommendations`, { page: 1 }),
      tmdb(`/movie/${movieId}/recommendations`, { page: 2 }),
      tmdb(`/movie/${movieId}/similar`, { page: 1 })
    ]);
    let seedGenres = (details.genres || []).map((g) => g.id).filter(Boolean);
    if (!seedGenres.length && details.genre_ids && details.genre_ids.length) {
      seedGenres = details.genre_ids.slice();
    }

    const byId = new Map();
    function ingest(results, sourceRank) {
      (results || []).forEach((raw, idx) => {
        if (!raw || raw.id === movieId) return;
        const prev = byId.get(raw.id);
        if (!prev || sourceRank < prev.sourceRank) {
          byId.set(raw.id, { raw, sourceRank, idx });
        }
      });
    }
    ingest(rec1.results, 0);
    ingest(rec2.results, 0);
    ingest(sim.results, 1);

    let movies = [];
    byId.forEach(({ raw, sourceRank, idx }) => {
      const m = normalizeMovie(raw);
      const overlap = genreOverlapScore(seedGenres, raw.genre_ids || []);
      movies.push({
        ...m,
        _overlap: overlap,
        _sourceRank: sourceRank,
        _idx: idx
      });
    });

    if (yearFilterSimilar) {
      const minY = Number(yearFilterSimilar);
      movies = movies.filter((m) => {
        const y = Number(m.year);
        return !Number.isNaN(y) && y >= minY;
      });
    }
    if (ratingFilterSimilar) {
      const min = Number(ratingFilterSimilar);
      movies = movies.filter((m) => (m.rating || 0) >= min);
    }

    movies.sort((a, b) => {
      if (b._overlap !== a._overlap) return b._overlap - a._overlap;
      if (a._sourceRank !== b._sourceRank) return a._sourceRank - b._sourceRank;
      const ra = a.rating || 0;
      const rb = b.rating || 0;
      if (rb !== ra) return rb - ra;
      const va = a.vote_count || 0;
      const vb = b.vote_count || 0;
      return vb - va;
    });

    return movies.map(({ _overlap, _sourceRank, _idx, ...rest }) => rest);
  }

  async function loadWatchProviders(movieId) {
    const data = await tmdb(`/movie/${movieId}/watch/providers`, {});
    const it = (data.results && data.results.IT) || null;
    return it;
  }

  function providerNamesUnique(list) {
    if (!list || !list.length) return [];
    return [...new Map(list.map((p) => [p.provider_id, p.provider_name])).values()].filter(Boolean);
  }

  function summarizeProvidersIT(providersIT) {
    if (!providersIT) {
      return '<p class="card-watch-empty">Dati non disponibili per l’Italia.</p>';
    }
    const rows = [];
    const pushRow = (tag, names) => {
      if (!names.length) return;
      const line = names.map((n) => escapeHtml(n)).join(" · ");
      rows.push(
        `<p class="card-watch-line"><span class="card-watch-tag">${escapeHtml(tag)}</span> ${line}</p>`
      );
    };
    pushRow("Streaming", providerNamesUnique(providersIT.flatrate));
    pushRow("Noleggio", providerNamesUnique(providersIT.rent));
    pushRow("Acquisto", providerNamesUnique(providersIT.buy));
    pushRow("Gratis / pubblicità", providerNamesUnique(providersIT.ads));
    pushRow("Gratis", providerNamesUnique(providersIT.free));
    if (!rows.length && providersIT.link && /^https?:\/\//i.test(providersIT.link)) {
      rows.push(
        `<p class="card-watch-line"><a class="card-watch-link" href="${escapeHtml(providersIT.link)}" target="_blank" rel="noopener noreferrer">Disponibilità su TMDB</a></p>`
      );
    }
    if (!rows.length) {
      return '<p class="card-watch-empty">Nessuna piattaforma indicata per l’Italia (TMDB).</p>';
    }
    return rows.join("");
  }

  async function hydrateCardWatchProviders(movieId, slotEl) {
    if (!slotEl) return;
    if (!apiKey || !apiKey.trim()) {
      slotEl.innerHTML = '<p class="card-watch-empty">Configura l’API key per vedere le piattaforme.</p>';
      return;
    }
    slotEl.innerHTML = '<p class="card-watch-loading">Sto chiedendo a TMDB dove passarlo in Italia…</p>';
    try {
      let it;
      if (watchProvidersCardCache.has(movieId)) {
        it = watchProvidersCardCache.get(movieId);
      } else {
        it = await loadWatchProviders(movieId);
        watchProvidersCardCache.set(movieId, it);
      }
      slotEl.innerHTML = summarizeProvidersIT(it);
    } catch (_) {
      slotEl.innerHTML =
        '<p class="card-watch-empty">Non sono riuscita a caricare le piattaforme. Riprova tra un attimo.</p>';
    }
  }

  function renderWatchScreen(movie, providersIT) {
    const titleEl = $("watch-movie-title");
    const hero = $("watch-hero");
    const sections = $("watch-sections");
    const empty = $("watch-empty");
    if (!titleEl || !hero || !sections || !empty) return;

    titleEl.textContent = movie.title || "—";
    const altPoster = escapeHtml(movie.title || "Locandina");
    hero.innerHTML = `
      <img class="watch-poster" src="${movie.poster}" alt="${altPoster}" loading="lazy">
      <p class="watch-year">${movie.year ? escapeHtml(String(movie.year)) : ""}</p>
    `;

    const labels = {
      flatrate: "In abbonamento (streaming)",
      rent: "Noleggio digitale",
      buy: "Acquisto digitale",
      ads: "Gratis con pubblicità",
      free: "Gratis"
    };

    const keys = ["flatrate", "rent", "buy", "ads", "free"];
    let any = false;
    sections.innerHTML = "";

    keys.forEach((key) => {
      const list = providersIT && providersIT[key];
      if (!list || !list.length) return;
      any = true;
      const wrap = document.createElement("div");
      wrap.className = "watch-section";
      wrap.innerHTML = `<h3 class="watch-section-title">${labels[key] || key}</h3>`;
      const row = document.createElement("div");
      row.className = "watch-provider-row";
      list.forEach((p) => {
        const logo = p.logo_path ? IMG_LOGO + p.logo_path : IMG_FALLBACK;
        const name = escapeHtml(p.provider_name || "");
        const div = document.createElement("div");
        div.className = "watch-provider";
        div.innerHTML = `<img src="${logo}" alt="" width="36" height="36" loading="lazy"><span>${name}</span>`;
        row.appendChild(div);
      });
      wrap.appendChild(row);
      sections.appendChild(wrap);
    });

    if (providersIT && providersIT.link && /^https?:\/\//i.test(providersIT.link)) {
      any = true;
      const linkWrap = document.createElement("p");
      linkWrap.className = "watch-tmdb-link";
      const a = document.createElement("a");
      a.href = providersIT.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Apri la scheda TMDB (dettagli e link)";
      linkWrap.appendChild(a);
      sections.appendChild(linkWrap);
    }

    empty.hidden = any;
    sections.hidden = !any;
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
    syncGenreChipSelection();
  }

  function syncGenreChipSelection() {
    const wrap = $("genre-chips");
    if (!wrap) return;
    wrap.querySelectorAll(".chip").forEach((btn) => {
      btn.classList.toggle("selected", genreIds.includes(+btn.dataset.id));
    });
  }

  function renderMoodChips() {
    const wrap = $("mood-chips");
    if (!wrap) return;
    wrap.innerHTML = MOOD_PRESETS.map(
      (p, i) =>
        `<button type="button" class="mood-chip" data-mood-index="${i}">${escapeHtml(p.label)}</button>`
    ).join("");
    wrap.querySelectorAll(".mood-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = MOOD_PRESETS[+btn.dataset.moodIndex];
        if (preset) applyMoodPreset(preset);
      });
    });
  }

  function applyMoodPreset(p) {
    if (!checkApiKey()) return;
    sessionSwipeWhy = p.whyLine;
    genreIds = p.genreIds.slice();
    includeAnimation = p.includeAnimation !== false;
    yearFilter = p.yearFilter || "";
    ratingFilter = p.ratingFilter || "";
    providerIds = [];
    if (yearFilterSelect) yearFilterSelect.value = yearFilter;
    if (ratingFilterSelect) ratingFilterSelect.value = ratingFilter;
    const incl = $("include-animation");
    if (incl) incl.checked = includeAnimation;
    platformChipsWrap?.querySelectorAll(".chip-platform").forEach((b) => b.classList.remove("selected"));
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formSimilar?.classList.add("hidden");
    formWatch?.classList.add("hidden");
    formStyle?.classList.remove("hidden");
    renderGenreChips();
    showApiHint("Perfetto. Controlla i filtri se vuoi, poi «Inizia a swipare».");
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
    const whyBlurb =
      sessionSwipeWhy.trim() ||
      "Titoli scelti tra i più amati su TMDB, in linea con la tua ricerca: se ti parla, un like.";
    toShow.forEach((movie, i) => {
      const fullOverview = movie.overview || "";
      const overviewText = fullOverview.trim() || "Trama non ancora disponibile — ma il poster parla da solo.";
      const card = document.createElement("div");
      card.className = "movie-card stack-" + i;
      card.dataset.movieId = movie.id;
      card.dataset.stackIndex = String(i);
      card.innerHTML = `
        <div class="card-poster-wrap">
          <img class="card-poster" src="${movie.poster}" alt="" loading="lazy">
          <div class="card-poster-hint">Swipa dalla locandina ↔</div>
          <div class="card-overlay like-overlay">LIKE</div>
          <div class="card-overlay nope-overlay">NOPE</div>
        </div>
        <div class="card-body">
          <div class="card-scroll">
            <h3 class="card-title">${escapeHtml(movie.title)}</h3>
            <p class="card-meta">${movie.year ? escapeHtml(String(movie.year)) : ""}</p>
            <p class="card-rating">${movie.rating ? "★ " + movie.rating.toFixed(1) + " / 10 (TMDB)" : ""}</p>
            <div class="card-section card-why-block">
              <h4 class="card-section-title">Perché potrebbe piacerti</h4>
              <p class="card-why-text">${escapeHtml(whyBlurb)}</p>
            </div>
            <div class="card-section">
              <h4 class="card-section-title">Trama</h4>
              <p class="card-overview">${escapeHtml(overviewText)}</p>
            </div>
            <div class="card-section card-watch-block">
              <h4 class="card-section-title">Dove vederlo (Italia)</h4>
              <div class="card-watch-slot" data-movie-id="${movie.id}"></div>
            </div>
          </div>
        </div>
      `;
      const posterWrap = card.querySelector(".card-poster-wrap");
      if (posterWrap) attachSwipeListeners(posterWrap, card, movie);
      const watchSlot = card.querySelector(".card-watch-slot");
      hydrateCardWatchProviders(movie.id, watchSlot);
      stack.appendChild(card);
    });

    updateSwipeCounts();
  }

  function attachSwipeListeners(gestureEl, cardEl, movie) {
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

    gestureEl.addEventListener("mousedown", (e) => onStart(e.clientX));
    gestureEl.addEventListener("touchstart", (e) => {
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
    placeholder.classList.remove("card-placeholder--loading");
    placeholder.classList.add("card-placeholder--done");
    placeholder.innerHTML = `
      <div class="card-placeholder-inner">
        <p class="card-placeholder-title">Hai visto tutte le proposte di questo giro</p>
        <p class="card-placeholder-sub">Dai un’occhiata ai match con i cuoricini, oppure torna alla home per una nuova ricerca.</p>
      </div>
    `;
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
    const whyMatch = sessionSwipeWhy.trim();
    likedMovies.forEach((m) => {
      const div = document.createElement("div");
      div.className = "match-card";
      const whyHtml = whyMatch
        ? `<p class="match-card-why"><span class="match-card-why-label">Perché era in lista</span>${escapeHtml(whyMatch)}</p>`
        : `<p class="match-card-why match-card-why--muted"><span class="match-card-why-label">Perché era in lista</span>Titoli che hai scelto tu durante lo swipe.</p>`;
      div.innerHTML = `
        <img src="${m.poster}" alt="${escapeHtml(m.title || "Locandina")}">
        <div class="match-card-info">
          <h3 class="match-card-title">${escapeHtml(m.title)}</h3>
          <p class="match-card-meta">${m.year ? escapeHtml(String(m.year)) : ""}</p>
          ${whyHtml}
          <p class="match-card-overview">${escapeHtml(m.overview || "")}</p>
        </div>
      `;
      list.appendChild(div);
    });
  }

  function startSwipe(movies, opts) {
    watchProvidersCardCache.clear();
    currentMovies = movies;
    stackIndex = 0;
    likedMovies = [];
    if (opts && opts.whyLine) sessionSwipeWhy = opts.whyLine;
    showScreen("screen-swipe");
    const placeholder = $("card-placeholder");
    if (placeholder) {
      placeholder.classList.remove("card-placeholder--done");
      placeholder.classList.add("card-placeholder--loading");
      placeholder.innerHTML = `
        <div class="card-placeholder-inner">
          <span class="card-placeholder-spinner" aria-hidden="true"></span>
          <p class="card-placeholder-title">Sto assemblando le proposte…</p>
          <p class="card-placeholder-sub">Ancora un attimo.</p>
        </div>
      `;
    }
    renderCardsStack();
  }

  const homePicks = $("home-picks");
  const formStyle = $("form-style");
  const formSimilar = $("form-similar");
  const formWatch = $("form-watch");
  const yearFilterSelect = $("year-filter");
  const platformChipsWrap = $("platform-chips");
  const yearFilterSimilarSelect = $("year-filter-similar");
  const ratingFilterSimilarSelect = $("rating-filter-similar");
  const ratingFilterSelect = $("rating-filter");

  $("btn-by-style")?.addEventListener("click", () => {
    sessionSwipeWhy = "";
    genreIds = [];
    yearFilter = "";
    ratingFilter = "";
    providerIds = [];
    if (yearFilterSelect) yearFilterSelect.value = "";
    if (ratingFilterSelect) ratingFilterSelect.value = "";
    platformChipsWrap?.querySelectorAll(".chip-platform").forEach((b) => b.classList.remove("selected"));
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formStyle?.classList.remove("hidden");
    renderGenreChips();
  });

  $("btn-back-from-style")?.addEventListener("click", () => {
    formStyle?.classList.add("hidden");
    homePicks?.classList.remove("hidden");
    showSetupChoiceButtons();
  });

  $("btn-back-from-similar")?.addEventListener("click", () => {
    formSimilar?.classList.add("hidden");
    homePicks?.classList.remove("hidden");
    showSetupChoiceButtons();
  });

  $("btn-by-similar")?.addEventListener("click", () => {
    sessionSwipeWhy = "";
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formSimilar?.classList.remove("hidden");
    $("similar-input")?.focus();
  });

  $("btn-by-watch")?.addEventListener("click", () => {
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formWatch?.classList.remove("hidden");
    $("watch-input")?.focus();
  });

  $("btn-back-from-watch")?.addEventListener("click", () => {
    formWatch?.classList.add("hidden");
    homePicks?.classList.remove("hidden");
    showSetupChoiceButtons();
  });

  $("include-animation")?.addEventListener("change", (e) => {
    includeAnimation = e.target.checked;
  });

  yearFilterSelect?.addEventListener("change", (e) => {
    yearFilter = e.target.value;
  });

  ratingFilterSelect?.addEventListener("change", (e) => {
    ratingFilter = e.target.value;
  });

  platformChipsWrap?.querySelectorAll(".chip-platform")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("selected");
      providerIds = Array.from(platformChipsWrap.querySelectorAll(".chip-platform.selected")).map(
        (el) => +el.dataset.providerId
      );
    });
  });

  yearFilterSimilarSelect?.addEventListener("change", (e) => {
    yearFilterSimilar = e.target.value;
  });

  ratingFilterSimilarSelect?.addEventListener("change", (e) => {
    ratingFilterSimilar = e.target.value;
  });

  $("btn-start-style")?.addEventListener("click", async () => {
    if (!checkApiKey()) return;
    let ids = genreIds.length ? [...genreIds] : [35, 18, 16];
    if (!includeAnimation) ids = ids.filter((id) => id !== 16);
    genreIds = ids;
    const whyForSwipe =
      sessionSwipeWhy.trim() ||
      "Titoli in linea con i filtri che hai messo: se ti parla, metti un like.";
    try {
      showApiHint("Sto cercando film per te…");
      const movies = await loadDiscover();
      showApiHint("");
      if (movies.length === 0) {
        showApiHint(
          "Con questa combinazione non esce nulla. Prova a togliere un filtro o scegliere altri generi.",
          true
        );
        return;
      }
      startSwipe(movies, { whyLine: whyForSwipe });
    } catch (e) {
      showApiHint("Qualcosa non ha funzionato (rete o chiave TMDB). Controlla la connessione e config.js.", true);
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
      similarSuggestions?.classList.add("hidden");
      if (similarSuggestions) similarSuggestions.innerHTML = "";
      return;
    }
    similarDebounce = setTimeout(async () => {
      if (!apiKey) return;
      try {
        const list = await searchMovie(q);
        similarSuggestions.innerHTML = list.slice(0, 8).map(
          (m) => `<div class="similar-suggestion" data-id="${m.id}">${escapeHtml(m.title)}${m.year ? " (" + m.year + ")" : ""}</div>`
        ).join("");
        similarSuggestions?.classList.remove("hidden");
        similarSuggestions.querySelectorAll(".similar-suggestion").forEach((el) => {
          el.addEventListener("click", () => {
            selectedMovieId = +el.dataset.id;
            similarInput.value = el.textContent.trim();
            similarSuggestions.classList.add("hidden");
          });
        });
      } catch (_) {
        similarSuggestions?.classList.add("hidden");
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
      showApiHint("Non ho capito quale film intendi: scegline uno dalla lista o riscrivi il titolo.", true);
      return;
    }
    const seedTitle = similarInput?.value?.trim() || "quel film";
    try {
      showApiHint("Sto cercando titoli affini…");
      const movies = await loadSimilar(selectedMovieId);
      showApiHint("");
      if (movies.length === 0) {
        showApiHint(
          "TMDB non ha abbastanza suggerimenti con questi filtri. Prova ad abbassare il voto minimo o l’anno.",
          true
        );
        return;
      }
      startSwipe(movies, {
        whyLine: `Generi e raccomandazioni vicini a «${seedTitle}» (secondo TMDB).`
      });
    } catch (e) {
      showApiHint("Qualcosa non ha funzionato (rete o chiave TMDB). Riprova tra poco.", true);
    }
  });

  const watchInput = $("watch-input");
  const watchSuggestions = $("watch-suggestions");
  let watchDebounce = null;
  let watchSelectedMovieId = null;

  watchInput?.addEventListener("input", () => {
    watchSelectedMovieId = null;
    clearTimeout(watchDebounce);
    const q = watchInput.value.trim();
    if (q.length < 2) {
      watchSuggestions?.classList.add("hidden");
      if (watchSuggestions) watchSuggestions.innerHTML = "";
      return;
    }
    watchDebounce = setTimeout(async () => {
      if (!apiKey) return;
      try {
        const list = await searchMovie(q);
        watchSuggestions.innerHTML = list.slice(0, 8).map(
          (m) =>
            `<div class="similar-suggestion watch-suggestion" data-id="${m.id}">${escapeHtml(m.title)}${m.year ? " (" + m.year + ")" : ""}</div>`
        ).join("");
        watchSuggestions?.classList.remove("hidden");
        watchSuggestions.querySelectorAll(".watch-suggestion").forEach((el) => {
          el.addEventListener("click", () => {
            watchSelectedMovieId = +el.dataset.id;
            watchInput.value = el.textContent.trim();
            watchSuggestions.classList.add("hidden");
          });
        });
      } catch (_) {
        watchSuggestions?.classList.add("hidden");
      }
    }, 300);
  });

  async function openWatchProvidersForMovie(movieId) {
    const details = await tmdb(`/movie/${movieId}`, {});
    const movie = normalizeMovie(details);
    const providersIT = await loadWatchProviders(movieId);
    renderWatchScreen(movie, providersIT);
    showScreen("screen-watch");
  }

  $("btn-search-watch")?.addEventListener("click", async () => {
    if (!checkApiKey()) return;
    let id = watchSelectedMovieId;
    if (!id) {
      const q = watchInput?.value?.trim();
      if (q) {
        const list = await searchMovie(q);
        if (list.length) id = list[0].id;
      }
    }
    if (!id) {
      showApiHint("Scegli un titolo dai suggerimenti mentre digiti, così andiamo sul sicuro.", true);
      return;
    }
    try {
      showApiHint("Sto controllando dove lo passano in Italia…");
      await openWatchProvidersForMovie(id);
      showApiHint("");
    } catch (e) {
      showApiHint("Non riesco a contattare TMDB. Controlla rete e chiave in config.js.", true);
    }
  });

  $("btn-back-from-watch-screen")?.addEventListener("click", () => {
    showScreen("screen-setup");
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formStyle?.classList.add("hidden");
    formSimilar?.classList.add("hidden");
    formWatch?.classList.remove("hidden");
  });

  $("btn-watch-another")?.addEventListener("click", () => {
    showScreen("screen-setup");
    hideSetupChoiceButtons();
    homePicks?.classList.add("hidden");
    formWatch?.classList.remove("hidden");
    if (watchInput) watchInput.value = "";
    watchSelectedMovieId = null;
    showApiHint("");
    watchInput?.focus();
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

  $("btn-back-to-setup")?.addEventListener("click", () => {
    showScreen("screen-setup");
  });

  $("btn-back-from-matches")?.addEventListener("click", () => {
    showScreen("screen-swipe");
  });

  $("btn-back-to-swipe")?.addEventListener("click", () => showScreen("screen-swipe"));

  $("btn-new-search")?.addEventListener("click", () => {
    showScreen("screen-setup");
    homePicks?.classList.remove("hidden");
    showSetupChoiceButtons();
    formStyle?.classList.add("hidden");
    formSimilar?.classList.add("hidden");
    formWatch?.classList.add("hidden");
    if (similarInput) similarInput.value = "";
    if (watchInput) watchInput.value = "";
    selectedMovieId = null;
    watchSelectedMovieId = null;
    sessionSwipeWhy = "";
    showApiHint("");
  });

  renderMoodChips();
  if (apiKey && apiKey.trim()) {
    showApiHint("Tutto pronto: scegli un mood, un percorso, e buona serata.");
  }
})();
