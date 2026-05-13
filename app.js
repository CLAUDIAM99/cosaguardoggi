(function () {
  "use strict";

  /** Memorizza che l’utente ha già scelto sulla schermata iniziale (stessa sessione / tab). */
  const SETUP_GATE_STORAGE_KEY = "mp_setup_gate_v1";

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
    { id: 10759, name: "Sport" },
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
  const PROVIDER_FILTER_MONETIZATION_KEYS = ["flatrate", "ads", "free"];
  const DISCOVER_PROVIDER_MONETIZATION_TYPES = "flatrate|ads|free";
  const DISCOVER_PROVIDER_TARGET_COUNT = 20;
  const DISCOVER_PROVIDER_MAX_PAGES = 6;
  const WATCH_PROVIDER_VERIFY_BATCH_SIZE = 5;
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

  let firebaseDb = null;
  let firebaseUser = null;
  let savedMoviesUnsub = null;
  let firebaseReady = false;

  function firebaseConfigured() {
    const fb = window.MOVIE_PICKER_CONFIG && window.MOVIE_PICKER_CONFIG.firebase;
    return !!(fb && fb.apiKey && fb.projectId && typeof firebase !== "undefined");
  }

  function initFirebaseIfPossible() {
    firebaseReady = false;
    if (!firebaseConfigured()) return false;
    const cfg = window.MOVIE_PICKER_CONFIG.firebase;
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(cfg);
      }
      firebaseDb = firebase.firestore();
      firebaseReady = true;
      firebase.auth().onAuthStateChanged((user) => {
        firebaseUser = user;
        if (savedMoviesUnsub) {
          savedMoviesUnsub();
          savedMoviesUnsub = null;
        }
        if (user && firebaseDb) {
          savedMoviesUnsub = firebaseDb
            .collection("users")
            .doc(user.uid)
            .collection("likedMovies")
            .onSnapshot((snap) => {
              const libBtn = $("btn-open-library");
              if (libBtn) {
                libBtn.textContent =
                  snap.size > 0 ? `I miei film salvati (${snap.size})` : "I miei film salvati";
              }
            });
        }
        updateAuthPanels();
      });
      return true;
    } catch (e) {
      console.warn("Firebase init:", e);
      firebaseReady = false;
      firebaseDb = null;
      return false;
    }
  }

  function setAuthMsg(text, isError) {
    const el = document.getElementById("auth-msg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("auth-msg-error", !!isError);
  }

  function syncFirebaseGateButtons() {
    const row = document.getElementById("setup-gate-auth-row");
    const off = document.getElementById("setup-gate-firebase-off");
    if (!row || !off) return;
    const ok = firebaseConfigured();
    row.classList.toggle("hidden", !ok);
    off.classList.toggle("hidden", ok);
  }

  function updateAuthPanels() {
    const strip = document.getElementById("auth-strip");
    const guest = document.getElementById("auth-panel-guest");
    const userP = document.getElementById("auth-panel-user");
    const swipeHint = document.getElementById("swipe-auth-hint");
    if (!firebaseConfigured() || !firebaseReady) {
      strip?.classList.add("hidden");
      swipeHint?.classList.add("hidden");
      $("auth-google-block")?.classList.add("hidden");
      syncFirebaseGateButtons();
      return;
    }
    $("auth-google-block")?.classList.remove("hidden");
    strip?.classList.remove("hidden");
    swipeHint?.classList.toggle("hidden", !!firebaseUser);
    if (firebaseUser) {
      guest?.classList.add("hidden");
      userP?.classList.remove("hidden");
      const em = document.getElementById("auth-user-email");
      if (em) em.textContent = firebaseUser.email || "Account attivo";
    } else {
      guest?.classList.remove("hidden");
      userP?.classList.add("hidden");
    }
    syncFirebaseGateButtons();
  }

  async function persistLikeToCloud(movie) {
    if (!firebaseUser || !firebaseDb) return;
    try {
      await firebaseDb
        .collection("users")
        .doc(firebaseUser.uid)
        .collection("likedMovies")
        .doc(String(movie.id))
        .set(
          {
            title: movie.title || "",
            year: movie.year || "",
            poster: movie.poster || "",
            overview: movie.overview || "",
            rating: movie.rating ?? null,
            vote_count: movie.vote_count ?? 0,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
    } catch (e) {
      console.warn("Salvataggio cloud:", e);
    }
  }

  async function renderLibrary() {
    const list = $("library-list");
    const empty = $("library-empty");
    if (!list || !empty) return;
    list.innerHTML = "";
    if (!firebaseUser || !firebaseDb) {
      empty.textContent = "Accedi per vedere i film salvati.";
      empty.classList.remove("hidden");
      return;
    }
    try {
      const snap = await firebaseDb
        .collection("users")
        .doc(firebaseUser.uid)
        .collection("likedMovies")
        .get();
      if (snap.empty) {
        empty.classList.remove("hidden");
        return;
      }
      empty.classList.add("hidden");
      const rows = snap.docs
        .map((d) => ({ ...d.data(), id: Number(d.id) }))
        .sort((a, b) => {
          const sa = a.savedAt && a.savedAt.seconds ? a.savedAt.seconds : 0;
          const sb = b.savedAt && b.savedAt.seconds ? b.savedAt.seconds : 0;
          return sb - sa;
        });
      rows.forEach((m) => {
        const div = document.createElement("div");
        div.className = "match-card library-card";
        div.innerHTML = `
          <img src="${m.poster || IMG_FALLBACK}" alt="${escapeHtml(m.title || "Locandina")}">
          <div class="match-card-info">
            <h3 class="match-card-title">${escapeHtml(m.title || "")}</h3>
            <p class="match-card-meta">${m.year ? escapeHtml(String(m.year)) : ""}</p>
            <p class="match-card-overview">${escapeHtml(m.overview || "")}</p>
          </div>
        `;
        list.appendChild(div);
      });
    } catch (e) {
      empty.textContent = "Non riesco a caricare l’elenco. Controlla la connessione.";
      empty.classList.remove("hidden");
    }
  }

  const $ = (id) => document.getElementById(id);
  const showScreen = (id) => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const el = $(id);
    if (el) el.classList.add("active");
  };

  function applySetupGateVisibility() {
    const gate = $("setup-gate");
    const main = $("setup-after-gate");
    if (!gate || !main) return;
    if (sessionStorage.getItem(SETUP_GATE_STORAGE_KEY) === "1") {
      gate.classList.add("hidden");
      main.classList.remove("hidden");
    }
  }

  applySetupGateVisibility();

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

  function readSelectedGenreIds() {
    const wrap = $("genre-chips");
    if (!wrap) return genreIds.slice();
    return Array.from(wrap.querySelectorAll(".chip.selected")).map((e) => +e.dataset.id);
  }

  function buildWithGenresParam(ids) {
    if (!ids || !ids.length) return null;
    if (ids.length === 1) return String(ids[0]);
    return ids.join("|");
  }

  function providerIdsFromIT(providersIT, monetizationKeys) {
    const ids = new Set();
    if (!providersIT) return ids;
    monetizationKeys.forEach((key) => {
      (providersIT[key] || []).forEach((p) => {
        if (p && p.provider_id != null) ids.add(p.provider_id);
      });
    });
    return ids;
  }

  function movieAvailableOnSelectedProviders(providersIT, selectedProviderIds) {
    if (!selectedProviderIds.length) return true;
    if (!providersIT) return false;
    const available = providerIdsFromIT(providersIT, PROVIDER_FILTER_MONETIZATION_KEYS);
    return selectedProviderIds.some((id) => available.has(id));
  }

  async function getWatchProvidersITCached(movieId) {
    if (watchProvidersCardCache.has(movieId)) {
      return watchProvidersCardCache.get(movieId);
    }
    const it = await loadWatchProviders(movieId);
    watchProvidersCardCache.set(movieId, it);
    return it;
  }

  async function verifyMoviesOnSelectedProviders(movies, selectedProviderIds) {
    const verified = [];
    const seen = new Set();
    for (let i = 0; i < movies.length; i += WATCH_PROVIDER_VERIFY_BATCH_SIZE) {
      const batch = movies.slice(i, i + WATCH_PROVIDER_VERIFY_BATCH_SIZE);
      const checks = await Promise.all(
        batch.map(async (movie) => {
          const providersIT = await getWatchProvidersITCached(movie.id);
          return movieAvailableOnSelectedProviders(providersIT, selectedProviderIds) ? movie : null;
        })
      );
      checks.forEach((movie) => {
        if (!movie || seen.has(movie.id)) return;
        seen.add(movie.id);
        verified.push(movie);
      });
    }
    return verified;
  }

  function buildDiscoverParams(page) {
    const withGenres = buildWithGenresParam(genreIds);
    const params = { sort_by: "popularity.desc", page, watch_region: "IT" };
    if (withGenres) params.with_genres = withGenres;
    if (!includeAnimation) params.without_genres = "16";
    if (yearFilter) {
      params["primary_release_date.gte"] = `${yearFilter}-01-01`;
    }
    if (ratingFilter) {
      params["vote_average.gte"] = Number(ratingFilter);
      params["vote_count.gte"] = 100;
    }
    if (providerIds.length) {
      params.with_watch_providers = providerIds.join("|");
      params.with_watch_monetization_types = DISCOVER_PROVIDER_MONETIZATION_TYPES;
    }
    return params;
  }

  async function loadDiscover() {
    if (!providerIds.length) {
      const data = await tmdb("/discover/movie", buildDiscoverParams(1));
      return (data.results || []).map(normalizeMovie);
    }

    const selectedProviderIds = providerIds.slice();
    const verified = [];
    const seen = new Set();
    let page = 1;
    let totalPages = 1;

    while (verified.length < DISCOVER_PROVIDER_TARGET_COUNT && page <= DISCOVER_PROVIDER_MAX_PAGES) {
      const data = await tmdb("/discover/movie", buildDiscoverParams(page));
      totalPages = data.total_pages || 1;
      const candidates = (data.results || []).map(normalizeMovie).filter((movie) => !seen.has(movie.id));
      candidates.forEach((movie) => seen.add(movie.id));
      if (!candidates.length) break;

      const batchVerified = await verifyMoviesOnSelectedProviders(candidates, selectedProviderIds);
      batchVerified.forEach((movie) => {
        if (verified.length >= DISCOVER_PROVIDER_TARGET_COUNT || verified.some((m) => m.id === movie.id)) return;
        verified.push(movie);
      });

      if (page >= totalPages) break;
      page++;
    }

    return verified;
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
    if (!includeAnimation) {
      movies = movies.filter((m) => !(m.genre_ids || []).includes(16));
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
        genreIds = readSelectedGenreIds();
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
          <div class="card-poster-hint">Swipa la card ↔ · Scorri il testo per leggere</div>
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
      if (i === 0) attachSwipeListeners(card, movie);
      const watchSlot = card.querySelector(".card-watch-slot");
      hydrateCardWatchProviders(movie.id, watchSlot);
      stack.appendChild(card);
    });

    updateSwipeCounts();
  }

  function attachSwipeListeners(cardEl, movie) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let dragSamples = [];
    let axisLocked = null;
    const scrollEl = cardEl.querySelector(".card-scroll");

    function resetScrollPointer() {
      if (scrollEl) scrollEl.style.pointerEvents = "";
    }

    function beginDrag(clientX, clientY) {
      if (!cardEl.classList.contains("stack-0")) return;
      cardEl.classList.add("dragging");
      startX = clientX;
      startY = clientY;
      currentX = 0;
      dragSamples = [{ t: performance.now(), x: clientX }];
      axisLocked = null;
    }

    function velocityPxPerMs() {
      if (dragSamples.length < 2) return 0;
      const a = dragSamples[0];
      const b = dragSamples[dragSamples.length - 1];
      const dt = b.t - a.t;
      if (dt < 12) return 0;
      return (b.x - a.x) / dt;
    }

    function onMovePointer(clientX, clientY) {
      if (!cardEl.classList.contains("dragging")) return;
      const dx = clientX - startX;
      const dy = clientY - startY;

      if (!axisLocked) {
        if (Math.abs(dx) > 11 || Math.abs(dy) > 11) {
          if (Math.abs(dx) > Math.abs(dy) * 1.06) {
            axisLocked = "h";
            if (scrollEl) scrollEl.style.pointerEvents = "none";
          } else {
            axisLocked = "v";
            cardEl.classList.remove("dragging");
            resetScrollPointer();
            axisLocked = null;
            return;
          }
        } else return;
      }

      if (axisLocked !== "h") return;

      currentX = dx;
      dragSamples.push({ t: performance.now(), x: clientX });
      if (dragSamples.length > 8) dragSamples.shift();

      const rot = Math.min(20, Math.max(-20, currentX * 0.11));
      cardEl.style.transform = `translateX(calc(-50% + ${currentX}px)) rotate(${rot}deg)`;
      cardEl.classList.toggle("swipe-right", currentX > 36);
      cardEl.classList.toggle("swipe-left", currentX < -36);
    }

    function finishDrag() {
      if (!cardEl.classList.contains("dragging")) {
        axisLocked = null;
        return;
      }
      cardEl.classList.remove("dragging");
      resetScrollPointer();

      const vx = velocityPxPerMs();
      const COMMIT = 48;
      const VEL = 0.32;

      if (axisLocked === "h") {
        if (currentX > COMMIT || vx > VEL) {
          likeCard(cardEl, movie);
        } else if (currentX < -COMMIT || vx < -VEL) {
          nopeCard(cardEl, movie);
        } else {
          cardEl.style.transition =
            "transform 0.34s cubic-bezier(0.34, 1.45, 0.64, 1)";
          cardEl.style.transform = "";
          cardEl.classList.remove("swipe-right", "swipe-left");
          setTimeout(() => {
            cardEl.style.transition = "";
          }, 360);
        }
      }

      axisLocked = null;
      currentX = 0;
      dragSamples = [];
    }

    cardEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      beginDrag(e.clientX, e.clientY);
      function mm(ev) {
        onMovePointer(ev.clientX, ev.clientY);
      }
      function mu() {
        window.removeEventListener("mousemove", mm);
        window.removeEventListener("mouseup", mu);
        finishDrag();
      }
      window.addEventListener("mousemove", mm);
      window.addEventListener("mouseup", mu);
    });

    cardEl.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        beginDrag(t.clientX, t.clientY);
      },
      { passive: true }
    );

    cardEl.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        onMovePointer(t.clientX, t.clientY);
        if (axisLocked === "h") e.preventDefault();
      },
      { passive: false }
    );

    cardEl.addEventListener("touchend", finishDrag);
    cardEl.addEventListener("touchcancel", finishDrag);
  }

  function likeCard(cardEl, movie) {
    cardEl.style.transition = "";
    cardEl.offsetHeight;
    cardEl.style.transition = "transform 0.28s ease-out, opacity 0.28s ease-out";
    cardEl.style.transform = "translateX(135%) rotate(18deg)";
    cardEl.style.opacity = "0";
    setTimeout(() => {
      likedMovies.push(movie);
      persistLikeToCloud(movie);
      stackIndex++;
      renderCardsStack();
      if (stackIndex >= currentMovies.length) showPlaceholderOrMatches();
    }, 260);
  }

  function nopeCard(cardEl, movie) {
    cardEl.style.transition = "";
    cardEl.offsetHeight;
    cardEl.style.transition = "transform 0.28s ease-out, opacity 0.28s ease-out";
    cardEl.style.transform = "translateX(-135%) rotate(-18deg)";
    cardEl.style.opacity = "0";
    setTimeout(() => {
      stackIndex++;
      renderCardsStack();
      if (stackIndex >= currentMovies.length) showPlaceholderOrMatches();
    }, 260);
  }

  function showPlaceholderOrMatches() {
    const stack = $("cards-stack");
    const placeholder = $("card-placeholder");
    if (!stack || !placeholder) return;
    stack.querySelectorAll(".movie-card").forEach((el) => el.remove());
    $("deck-progress")?.classList.add("hidden");
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
    updateDeckProgress();
  }

  function updateDeckProgress() {
    const el = $("deck-progress");
    if (!el) return;
    const total = currentMovies.length;
    if (!total || stackIndex >= total) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.textContent = `${stackIndex + 1} / ${total}`;
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
    genreIds = readSelectedGenreIds();
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

  let authUiMode = "login";

  function authErrorIt(e) {
    const c = e && e.code;
    if (c === "auth/user-not-found") return "Nessun account con questa email. Passa a «Registrati».";
    if (c === "auth/wrong-password") return "Password non corretta.";
    if (c === "auth/invalid-email") return "Inserisci un’email valida.";
    if (c === "auth/invalid-credential") return "Email o password non riconosciute.";
    if (c === "auth/email-already-in-use") return "Questa email è già registrata: usa «Accedi».";
    if (c === "auth/weak-password") return "Scegli una password di almeno 6 caratteri.";
    if (c === "auth/too-many-requests") return "Troppi tentativi. Aspetta un minuto e riprova.";
    if (c === "auth/popup-closed-by-user") return "Accesso annullato: hai chiuso la finestra di Google.";
    if (c === "auth/popup-blocked-by-browser" || c === "auth/popup-blocked")
      return "Il browser ha bloccato la finestra di accesso: consenti i popup per questo sito e riprova, oppure usa email e password.";
    if (c === "auth/account-exists-with-different-credential")
      return "Esiste già un account con questa email registrato in altro modo: accedi con email e password, oppure usa la Console Firebase per collegare gli accessi.";
    if (c === "auth/operation-not-allowed")
      return "Accesso con Google non attivo: abilita il provider Google in Firebase Console → Authentication → Sign-in method.";
    if (c === "auth/network-request-failed") return "Errore di rete. Controlla la connessione e riprova.";
    if (c === "auth/cancelled-popup-request")
      return "È già in corso un altro accesso. Chiudi le altre finestre e riprova.";
    if (c === "auth/user-disabled") return "Questo account è stato disabilitato.";
    return "Qualcosa è andato storto. Riprova tra un attimo.";
  }

  function handleSuccessfulAuthUiCleanup() {
    const overlay = $("gate-modal-overlay");
    const modalWasOpen = !!(overlay && !overlay.classList.contains("hidden"));
    if (modalWasOpen) {
      closeGateModal({ restoreFocus: false });
      dismissSetupGate();
      requestAnimationFrame(() => $("mood-chips")?.querySelector(".mood-chip")?.focus());
    }
    const p = $("auth-password");
    if (p) p.value = "";
    const p2 = $("auth-password-confirm");
    if (p2) p2.value = "";
  }

  function setAuthUiMode(mode) {
    authUiMode = mode;
    const tLogin = $("tab-login");
    const tReg = $("tab-register");
    const wrap = $("auth-password-confirm-wrap");
    const btnForgot = $("btn-auth-forgot");
    const submit = $("btn-auth-submit");
    const hint = $("auth-mode-hint");
    tLogin?.classList.toggle("auth-tab--active", mode === "login");
    tReg?.classList.toggle("auth-tab--active", mode === "register");
    tLogin?.setAttribute("aria-selected", mode === "login" ? "true" : "false");
    tReg?.setAttribute("aria-selected", mode === "register" ? "true" : "false");
    wrap?.classList.toggle("hidden", mode !== "register");
    btnForgot?.classList.toggle("hidden", mode !== "login");
    if (hint) {
      hint.textContent =
        mode === "login"
          ? "Inserisci email e password per ritrovare i film salvati sul tuo account."
          : "Scegli email e password (min. 6 caratteri): da ora i ♥ si salvano nel cloud.";
    }
    if (submit) submit.textContent = mode === "login" ? "Accedi" : "Crea account";
    const pc = $("auth-password-confirm");
    if (pc && mode === "login") pc.value = "";
    const pwd = $("auth-password");
    if (pwd) pwd.setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
    setAuthMsg("");
  }

  $("tab-login")?.addEventListener("click", () => setAuthUiMode("login"));
  $("tab-register")?.addEventListener("click", () => setAuthUiMode("register"));

  let gateModalEscapeHandler = null;
  /** @type {Element | null} */
  let gateModalPreviousFocus = null;

  function openGateModal(mode) {
    if (!firebaseConfigured()) {
      showApiHint(
        "Per usare Accedi o Registrati completa Firebase in config.js (apiKey e projectId del progetto web).",
        true
      );
      return;
    }
    const overlay = $("gate-modal-overlay");
    const bodyEl = $("gate-modal-body");
    const strip = $("auth-strip");
    const slot = $("auth-strip-slot");
    if (!overlay || !bodyEl || !strip || !slot) return;
    if (!overlay.classList.contains("hidden")) return;

    gateModalPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bodyEl.appendChild(strip);
    strip.classList.remove("hidden");
    setAuthUiMode(mode === "register" ? "register" : "login");
    if (!firebaseReady) {
      setAuthMsg(
        "Firebase non si è avviato (errore di configurazione o di rete). Controlla config.js e la console del browser, poi ricarica.",
        true
      );
    }

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("gate-modal-open");

    gateModalEscapeHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeGateModal();
      }
    };
    document.addEventListener("keydown", gateModalEscapeHandler);

    requestAnimationFrame(() => {
      const email = $("auth-email");
      if (email) email.focus();
      else $("gate-modal-close")?.focus();
    });
  }

  /** @param {{ restoreFocus?: boolean }} [opts] */
  function closeGateModal(opts) {
    const overlay = $("gate-modal-overlay");
    const bodyEl = $("gate-modal-body");
    const slot = $("auth-strip-slot");
    const strip = $("auth-strip");
    if (!overlay || overlay.classList.contains("hidden")) return;

    const restoreFocus = !opts || opts.restoreFocus !== false;

    if (gateModalEscapeHandler) {
      document.removeEventListener("keydown", gateModalEscapeHandler);
      gateModalEscapeHandler = null;
    }
    document.body.classList.remove("gate-modal-open");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");

    if (strip && slot && bodyEl && strip.parentElement === bodyEl) {
      slot.appendChild(strip);
    }

    updateAuthPanels();

    if (
      restoreFocus &&
      gateModalPreviousFocus &&
      typeof gateModalPreviousFocus.focus === "function"
    ) {
      gateModalPreviousFocus.focus();
    }
    gateModalPreviousFocus = null;
  }

  function dismissSetupGate() {
    sessionStorage.setItem(SETUP_GATE_STORAGE_KEY, "1");
    $("setup-gate")?.classList.add("hidden");
    $("setup-after-gate")?.classList.remove("hidden");
  }

  $("btn-gate-continue")?.addEventListener("click", () => dismissSetupGate());
  $("btn-gate-login")?.addEventListener("click", () => openGateModal("login"));
  $("btn-gate-register")?.addEventListener("click", () => openGateModal("register"));

  $("gate-modal-backdrop")?.addEventListener("click", () => closeGateModal());
  $("gate-modal-close")?.addEventListener("click", () => closeGateModal());

  $("auth-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = $("btn-auth-submit");
    if (!firebaseConfigured()) {
      setAuthMsg("Aggiungi la configurazione Firebase in config.js (apiKey e projectId) per accedere.", true);
      return;
    }
    if (!firebaseReady) {
      setAuthMsg(
        "Firebase non è pronto. Controlla config.js e la console del browser, poi ricarica la pagina.",
        true
      );
      return;
    }
    const email = $("auth-email")?.value?.trim() || "";
    const pw = $("auth-password")?.value || "";
    const pw2 = $("auth-password-confirm")?.value || "";
    setAuthMsg("");
    if (!email || !pw) {
      setAuthMsg("Compila email e password.", true);
      return;
    }
    if (pw.length < 6) {
      setAuthMsg("La password deve avere almeno 6 caratteri.", true);
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
      if (authUiMode === "register") {
        if (pw !== pw2) {
          setAuthMsg("Le due password non coincidono.", true);
          return;
        }
        await firebase.auth().createUserWithEmailAndPassword(email, pw);
        setAuthMsg("Account creato. Benvenuta: i tuoi like da ora restano salvati.");
      } else {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
        setAuthMsg("");
      }
      handleSuccessfulAuthUiCleanup();
    } catch (err) {
      setAuthMsg(authErrorIt(err), true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  $("btn-auth-google")?.addEventListener("click", async () => {
    if (!firebaseConfigured()) {
      setAuthMsg("Configura Firebase in config.js per usare l’accesso con Google.", true);
      return;
    }
    if (!firebaseReady) {
      setAuthMsg(
        "Firebase non è pronto. Controlla config.js e la console del browser, poi ricarica la pagina.",
        true
      );
      return;
    }
    const btn = $("btn-auth-google");
    setAuthMsg("");
    if (btn) btn.disabled = true;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      // Popup è lo standard su GitHub Pages; se è bloccato, authErrorIt suggerisce i popup o email/password (alternativa: signInWithRedirect + getRedirectResult).
      await firebase.auth().signInWithPopup(provider);
      setAuthMsg("");
      handleSuccessfulAuthUiCleanup();
    } catch (err) {
      setAuthMsg(authErrorIt(err), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("btn-auth-forgot")?.addEventListener("click", async () => {
    if (!firebaseConfigured() || !firebaseReady) return;
    const email = $("auth-email")?.value?.trim() || "";
    setAuthMsg("");
    if (!email) {
      setAuthMsg("Scrivi la tua email nel campo sopra, poi clicca di nuovo qui.", true);
      return;
    }
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      setAuthMsg("Controlla la posta: ti abbiamo mandato un link per una nuova password.");
    } catch (err) {
      setAuthMsg(authErrorIt(err), true);
    }
  });

  $("btn-auth-logout")?.addEventListener("click", async () => {
    try {
      await firebase.auth().signOut();
      setAuthUiMode("login");
    } catch (_) {}
  });

  $("btn-open-library")?.addEventListener("click", async () => {
    await renderLibrary();
    showScreen("screen-library");
  });

  $("btn-back-from-library")?.addEventListener("click", () => {
    showScreen("screen-setup");
  });

  $("btn-library-home")?.addEventListener("click", () => {
    showScreen("screen-setup");
    homePicks?.classList.remove("hidden");
    showSetupChoiceButtons();
    formStyle?.classList.add("hidden");
    formSimilar?.classList.add("hidden");
    formWatch?.classList.add("hidden");
  });

  initFirebaseIfPossible();
  updateAuthPanels();
  syncFirebaseGateButtons();
  setAuthUiMode("login");

  renderMoodChips();
  if (apiKey && apiKey.trim()) {
    showApiHint("Tutto pronto: scegli un mood, un percorso, e buona serata.");
  }
})();
