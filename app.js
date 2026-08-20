/* =========================================================
   STORYNEST FRONTEND
   app.js
   Version: 3.0.0

   GitHub Pages
        ↓
   StoryNest Apps Script API
        ↓
   Google Sheets

   MAJOR FEATURES
   ---------------------------------------------------------
   Reading
   - Reading progress
   - Reading position
   - Estimated reading time
   - Text size
   - Line height
   - Reading width
   - Focus mode
   - Previous / next story

   Audio
   - Play / pause
   - Seek
   - Progress
   - Volume
   - Playback speed
   - Floating mini-player
   - Persistent audio navigation
   - Audio unavailable state
   - Browser SpeechSynthesis fallback

   Discovery
   - Featured
   - Categories
   - Genres
   - Age
   - Reading level
   - Reading time
   - Search
   - Result count
   - Recently added
   - Recommended
   - Related stories

   Personalization
   - Saved stories
   - Recently read
   - Reading preferences
   - Theme
   - Font size
   - Line height
   - Narration speed
   - LocalStorage

   UX
   - Skeleton loading
   - Retry
   - Empty states
   - Offline metadata cache
   - API status
   - Automatic refresh
   - Lazy covers
   - Smooth navigation

   Accessibility
   - Keyboard navigation
   - ARIA
   - Focus states
   - Reduced motion
   - Accessible buttons
   - Mobile friendly controls

   Security
   - Escaped Sheet metadata
   - Story content rendered through DOM APIs
   - Safe URL validation
   - No arbitrary third-party scripts
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     1. CONFIGURATION
  ======================================================= */

  const API_URL =
    "https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec";

  const APP_NAME = "StoryNest";
  const APP_VERSION = "3.0.0";

  const STORAGE_KEY =
    "storynest_preferences_v3";

  const FAVORITES_KEY =
    "storynest_favorites_v3";

  const PROGRESS_KEY =
    "storynest_progress_v3";

  const RECENT_KEY =
    "storynest_recent_v3";

  const AUDIO_KEY =
    "storynest_audio_v3";

  const CACHE_KEY =
    "storynest_metadata_cache_v3";

  const CACHE_TTL =
    1000 * 60 * 60 * 24;

  const AUTO_REFRESH_MS =
    1000 * 60 * 5;

  const MAX_RECENT =
    20;

  const DEFAULT_PAGE_SIZE =
    20;


  /* =======================================================
     2. APPLICATION STATE
  ======================================================= */

  const state = {

    stories: [],

    allKnownStories: [],

    featured: [],

    categories: [],

    genres: [],

    currentStory: null,

    currentStoryIndex: -1,

    recentStories: [],

    recommended: [],

    related: [],

    searchQuery: "",

    category: "",

    genre: "",

    age: "",

    readingLevel: "",

    readingTime: "",

    sort: "recent",

    page: 1,

    pageSize: DEFAULT_PAGE_SIZE,

    loading: false,

    initialized: false,

    offline: !navigator.onLine,

    lastRefresh: 0,

    focusMode: false,

    reducedMotion:
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches,

    preferences: {

      theme: "light",

      textSize: "medium",

      lineHeight: "comfortable",

      readingWidth: "comfortable",

      narrationSpeed: 1,

      volume: 1

    },

    favorites: [],

    progress: {},

    audioProgress: {},

    cache: {},

    audio: {

      storyId: "",

      storyTitle: "",

      src: "",

      isPlaying: false

    },

    speech: {

      active: false,

      storyId: "",

      paragraphIndex: 0,

      utterance: null

    }

  };


  /* =======================================================
     3. DOM HELPERS
  ======================================================= */

  const $ = (
    selector,
    root = document
  ) => root.querySelector(selector);


  const $$ = (
    selector,
    root = document
  ) => Array.from(
    root.querySelectorAll(selector)
  );


  function firstExisting(...selectors) {

    for (const selector of selectors) {

      const element = $(selector);

      if (element) {
        return element;
      }

    }

    return null;
  }


  function text(
    element,
    value
  ) {

    if (!element) return;

    element.textContent =
      value == null
        ? ""
        : String(value);

  }


  function clearElement(element) {

    if (!element) return;

    while (element.firstChild) {
      element.removeChild(
        element.firstChild
      );
    }

  }


  function setHidden(
    element,
    hidden
  ) {

    if (!element) return;

    element.hidden = !!hidden;

  }


  function createElement(
    tag,
    options = {}
  ) {

    const element =
      document.createElement(tag);

    if (options.className) {
      element.className =
        options.className;
    }

    if (options.text !== undefined) {
      element.textContent =
        String(options.text);
    }

    if (options.attrs) {

      Object.entries(
        options.attrs
      ).forEach(
        ([name, value]) => {

          if (
            value !== undefined &&
            value !== null
          ) {
            element.setAttribute(
              name,
              String(value)
            );
          }

        }
      );

    }

    return element;

  }


  /* =======================================================
     4. SECURITY HELPERS
  ======================================================= */

  function escapeHTML(value) {

    return String(
      value == null
        ? ""
        : value
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function safeURL(value) {

    const raw =
      String(value || "")
        .trim();

    if (!raw) {
      return "";
    }

    try {

      const parsed =
        new URL(
          raw,
          window.location.href
        );

      if (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:"
      ) {
        return parsed.href;
      }

    } catch {}

    return "";

  }


  function safeAudioURL(value) {

    const url =
      safeURL(value);

    if (!url) {
      return "";
    }

    return url;

  }


  function safeImageURL(value) {

    return safeURL(value);

  }


  function normalizeText(value) {

    return String(
      value == null
        ? ""
        : value
    ).trim();

  }


  /* =======================================================
     5. STORAGE
  ======================================================= */

  function readJSON(
    key,
    fallback
  ) {

    try {

      const value =
        localStorage.getItem(key);

      if (!value) {
        return fallback;
      }

      return JSON.parse(value);

    } catch (error) {

      console.warn(
        `[StoryNest] Storage read failed: ${key}`,
        error
      );

      return fallback;

    }

  }


  function writeJSON(
    key,
    value
  ) {

    try {

      localStorage.setItem(
        key,
        JSON.stringify(value)
      );

      return true;

    } catch (error) {

      console.warn(
        `[StoryNest] Storage write failed: ${key}`,
        error
      );

      return false;

    }

  }


  function loadStorage() {

    const preferences =
      readJSON(
        STORAGE_KEY,
        {}
      );

    const favorites =
      readJSON(
        FAVORITES_KEY,
        []
      );

    const progress =
      readJSON(
        PROGRESS_KEY,
        {}
      );

    const recent =
      readJSON(
        RECENT_KEY,
        []
      );

    const audio =
      readJSON(
        AUDIO_KEY,
        {}
      );

    const cache =
      readJSON(
        CACHE_KEY,
        {}
      );


    if (
      preferences &&
      typeof preferences === "object"
    ) {

      state.preferences = {
        ...state.preferences,
        ...preferences
      };

    }


    if (Array.isArray(favorites)) {

      state.favorites =
        favorites
          .map(String)
          .filter(Boolean);

    }


    if (
      progress &&
      typeof progress === "object"
    ) {

      state.progress =
        progress;

    }


    if (Array.isArray(recent)) {

      state.recentStories =
        recent;

    }


    if (
      audio &&
      typeof audio === "object"
    ) {

      state.audioProgress =
        audio;

    }


    if (
      cache &&
      typeof cache === "object"
    ) {

      state.cache =
        cache;

    }


    applyPreferences();

  }


  function savePreferences() {

    writeJSON(
      STORAGE_KEY,
      state.preferences
    );

  }


  function saveFavorites() {

    writeJSON(
      FAVORITES_KEY,
      state.favorites
    );

  }


  function saveProgress() {

    writeJSON(
      PROGRESS_KEY,
      state.progress
    );

  }


  function saveRecent() {

    writeJSON(
      RECENT_KEY,
      state.recentStories
    );

  }


  function saveAudioProgress() {

    writeJSON(
      AUDIO_KEY,
      state.audioProgress
    );

  }


  function saveCache() {

    writeJSON(
      CACHE_KEY,
      state.cache
    );

  }


  /* =======================================================
     6. PREFERENCES
  ======================================================= */

  function getTextScale() {

    switch (
      state.preferences.textSize
    ) {

      case "small":
        return "0.90";

      case "large":
        return "1.10";

      case "xlarge":
        return "1.24";

      default:
        return "1";

    }

  }


  function getLineHeight() {

    switch (
      state.preferences.lineHeight
    ) {

      case "tight":
        return "1.55";

      case "wide":
        return "2.0";

      default:
        return "1.75";

    }

  }


  function getReadingWidth() {

    switch (
      state.preferences.readingWidth
    ) {

      case "narrow":
        return "680px";

      case "wide":
        return "1000px";

      default:
        return "820px";

    }

  }


  function applyPreferences() {

    const root =
      document.documentElement;

    const body =
      document.body;

    root.dataset.theme =
      state.preferences.theme;

    root.dataset.textSize =
      state.preferences.textSize;

    root.dataset.readingWidth =
      state.preferences.readingWidth;

    root.dataset.lineHeight =
      state.preferences.lineHeight;


    root.style.setProperty(
      "--story-text-scale",
      getTextScale()
    );

    root.style.setProperty(
      "--story-line-height",
      getLineHeight()
    );

    root.style.setProperty(
      "--story-reading-width",
      getReadingWidth()
    );


    if (body) {

      body.dataset.theme =
        state.preferences.theme;

      body.classList.toggle(
        "storynest-focus-mode",
        state.focusMode
      );

    }


    updatePreferenceControls();

    updateAudioVolume();

  }


  function updatePreferenceControls() {

    $$("[data-theme]")
      .forEach(
        (button) => {

          button.classList.toggle(
            "active",
            button.dataset.theme ===
            state.preferences.theme
          );

          button.setAttribute(
            "aria-pressed",
            String(
              button.dataset.theme ===
              state.preferences.theme
            )
          );

        }
      );


    $$("[data-text-size]")
      .forEach(
        (button) => {

          button.classList.toggle(
            "active",
            button.dataset.textSize ===
            state.preferences.textSize
          );

          button.setAttribute(
            "aria-pressed",
            String(
              button.dataset.textSize ===
              state.preferences.textSize
            )
          );

        }
      );


    $$("[data-reading-width]")
      .forEach(
        (button) => {

          button.classList.toggle(
            "active",
            button.dataset.readingWidth ===
            state.preferences.readingWidth
          );

        }
      );


    $$("[data-line-height]")
      .forEach(
        (button) => {

          button.classList.toggle(
            "active",
            button.dataset.lineHeight ===
            state.preferences.lineHeight
          );

        }
      );

  }


  function setTheme(theme) {

    if (!theme) return;

    state.preferences.theme =
      theme;

    savePreferences();
    applyPreferences();

  }


  function setTextSize(size) {

    if (!size) return;

    state.preferences.textSize =
      size;

    savePreferences();
    applyPreferences();

  }


  function setLineHeight(value) {

    if (!value) return;

    state.preferences.lineHeight =
      value;

    savePreferences();
    applyPreferences();

  }


  function setReadingWidth(value) {

    if (!value) return;

    state.preferences.readingWidth =
      value;

    savePreferences();
    applyPreferences();

  }


  /* =======================================================
     7. API
  ======================================================= */

  async function api(
    action,
    params = {},
    options = {}
  ) {

    const query =
      new URLSearchParams();

    query.set(
      "action",
      action
    );


    Object.keys(params)
      .forEach(
        (key) => {

          const value =
            params[key];

          if (
            value !== undefined &&
            value !== null &&
            String(value) !== ""
          ) {

            query.set(
              key,
              String(value)
            );

          }

        }
      );


    const url =
      `${API_URL}?${query.toString()}`;


    console.debug(
      "[StoryNest API]",
      action,
      params
    );


    let response;

    try {

      response =
        await fetch(
          url,
          {
            method: "GET",
            cache:
              options.cache ||
              "no-store",
            redirect: "follow"
          }
        );

    } catch (error) {

      state.offline =
        !navigator.onLine;

      throw new Error(
        navigator.onLine
          ? "Network request failed."
          : "You are currently offline."
      );

    }


    if (!response.ok) {

      throw new Error(
        `API request failed: HTTP ${response.status}`
      );

    }


    const contentType =
      response.headers.get(
        "content-type"
      ) || "";


    let data;


    if (
      contentType.includes(
        "application/json"
      )
    ) {

      data =
        await response.json();

    } else {

      const raw =
        await response.text();

      try {

        data =
          JSON.parse(raw);

      } catch {

        throw new Error(
          "StoryNest API returned an invalid response."
        );

      }

    }


    if (
      !data ||
      data.success === false
    ) {

      throw new Error(
        data?.error ||
        "StoryNest API returned an error."
      );

    }


    state.offline = false;

    return data;

  }


  /* =======================================================
     8. NORMALIZATION
  ======================================================= */

  function normalizeStory(raw) {

    if (!raw) {
      return null;
    }


    let meta =
      raw;

    let content = {};

    let characters = [];

    let audio = {};

    let media = {};

    let rights = {};


    if (
      raw.story &&
      typeof raw.story === "object" &&
      !Array.isArray(raw.story)
    ) {

      const wrapper =
        raw;


      if (
        wrapper.story.story &&
        typeof wrapper.story.story ===
        "object"
      ) {

        meta =
          wrapper.story.story;

        content =
          wrapper.story.content || {};

        characters =
          wrapper.story.characters || [];

        audio =
          wrapper.story.audio || {};

        media =
          wrapper.story.media || {};

        rights =
          wrapper.story.rights || {};

      } else {

        meta =
          wrapper.story;

      }

    }


    const storyText =
      content.story_text ||
      meta.story ||
      meta.story_text ||
      meta.content ||
      "";


    const description =
      content.introduction ||
      meta.description ||
      "";


    const cover =
      safeImageURL(
        media.cover_image ||
        meta.cover_image ||
        ""
      );


    const audioURL =
      safeAudioURL(
        audio.url ||
        meta.audio_url ||
        ""
      );


    const normalized = {

      story_id:
        normalizeText(
          meta.story_id
        ),

      slug:
        normalizeText(
          meta.slug
        ),

      title:
        normalizeText(
          meta.title
        ),

      subtitle:
        normalizeText(
          meta.subtitle
        ),

      description:
        normalizeText(
          description
        ),

      category:
        normalizeText(
          meta.category ||
          meta.category_id
        ),

      genre:
        normalizeText(
          meta.genre ||
          meta.genre_id
        ),

      age_min:
        meta.age_min ??
        "",

      age_max:
        meta.age_max ??
        "",

      reading_level:
        normalizeText(
          meta.reading_level
        ),

      reading_time:
        meta.reading_time ??
        "",

      language:
        normalizeText(
          meta.language
        ) ||
        "English",

      author_name:
        normalizeText(
          meta.author_name
        ) ||
        "StoryNest Originals",

      story:
        String(
          storyText || ""
        ),

      lesson:
        normalizeText(
          content.lesson ||
          meta.lesson
        ),

      reflection:
        normalizeText(
          content.reflection ||
          meta.reflection
        ),

      discussion:
        normalizeText(
          content.discussion ||
          meta.discussion
        ),

      activity:
        normalizeText(
          content.creative_activity ||
          meta.activity
        ),

      characters:
        Array.isArray(characters)
          ? characters
          : parseCharacters(
              meta.characters
            ),

      featured:
        normalizeBoolean(
          meta.featured
        ),

      status:
        String(
          meta.status || ""
        ).toUpperCase(),

      audio_available:
        normalizeBoolean(
          audio.available ??
          meta.audio_available
        ) &&
        !!audioURL,

      audio_url:
        audioURL,

      cover_image:
        cover,

      tags:
        normalizeTags(
          meta.tags
        ),

      rights_type:
        normalizeText(
          rights.type ||
          meta.rights_type
        ),

      rights_status:
        normalizeText(
          rights.status ||
          meta.rights_status
        ),

      published_at:
        meta.published_at ||
        "",

      created_at:
        meta.created_at ||
        "",

      updated_at:
        meta.updated_at ||
        ""

    };


    normalized.estimated_minutes =
      calculateReadingTime(
        normalized.story,
        normalized.reading_time
      );


    normalized.search_text =
      [
        normalized.title,
        normalized.subtitle,
        normalized.description,
        normalized.category,
        normalized.genre,
        normalized.reading_level,
        normalized.tags.join(" "),
        normalized.author_name
      ]
        .join(" ")
        .toLowerCase();


    return normalized;

  }


  function normalizeBoolean(value) {

    if (
      value === true ||
      value === 1
    ) {
      return true;
    }


    const normalized =
      String(value || "")
        .toLowerCase()
        .trim();


    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "1"
    );

  }


  function normalizeTags(value) {

    if (!value) {
      return [];
    }


    if (Array.isArray(value)) {

      return value
        .map(
          (item) =>
            String(item).trim()
        )
        .filter(Boolean);

    }


    return String(value)
      .split(",")
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);

  }


  function parseCharacters(value) {

    if (!value) {
      return [];
    }


    if (Array.isArray(value)) {
      return value;
    }


    try {

      const parsed =
        JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed
        : [];

    } catch {

      return String(value)
        .split(",")
        .map(
          (name) => ({
            name:
              name.trim()
          })
        )
        .filter(
          (item) =>
            item.name
        );

    }

  }


  /* =======================================================
     9. READING TIME
  ======================================================= */

  function calculateReadingTime(
    content,
    backendValue
  ) {

    const supplied =
      Number(
        String(
          backendValue || ""
        )
          .replace(/[^\d.]/g, "")
      );


    if (
      Number.isFinite(supplied) &&
      supplied > 0
    ) {

      return Math.max(
        1,
        Math.round(supplied)
      );

    }


    const words =
      String(
        content || ""
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;


    if (!words) {
      return 1;
    }


    return Math.max(
      1,
      Math.ceil(
        words / 200
      )
    );

  }


  /* =======================================================
     10. STATUS UI
  ======================================================= */

  function setConnectionStatus(
    message,
    type = "normal"
  ) {

    const elements = [

      firstExisting(
        "#connectionStatus",
        ".connection-status",
        "[data-connection-status]"
      ),

      firstExisting(
        "#statusMessage",
        ".status-message",
        "[data-status]"
      )

    ].filter(Boolean);


    elements.forEach(
      (element) => {

        text(
          element,
          message
        );

        element.dataset.status =
          type;

        element.setAttribute(
          "role",
          "status"
        );

      }
    );


    updateGeneratedStatus(
      message,
      type
    );

  }


  function updateGeneratedStatus(
    message,
    type
  ) {

    const indicator =
      $("#storynestGeneratedStatus");

    if (!indicator) {
      return;
    }


    text(
      indicator.querySelector(
       ("[data-generated-status-text]")
      ),
      message
    );


    indicator.dataset.status =
      type;

  }


  function showLoading(
    message = "Loading stories..."
  ) {

    state.loading = true;

    setConnectionStatus(
      message,
      "loading"
    );

  }


  function hideLoading() {

    state.loading = false;

  }


  function showError(message) {

    console.error(
      "[StoryNest]",
      message
    );

    setConnectionStatus(
      message,
      "error"
    );

  }


  /* =======================================================
     11. CACHE
  ======================================================= */

  function cacheData() {

    state.cache = {

      timestamp:
        Date.now(),

      stories:
        state.stories,

      featured:
        state.featured,

      categories:
        state.categories,

      genres:
        state.genres

    };


    saveCache();

  }


  function restoreCachedData() {

    const cache =
      state.cache;


    if (
      !cache ||
      !cache.timestamp
    ) {
      return false;
    }


    if (
      Date.now() -
      Number(cache.timestamp) >
      CACHE_TTL
    ) {

      return false;

    }


    if (
      Array.isArray(
        cache.stories
      )
    ) {

      state.stories =
        cache.stories;

    }


    if (
      Array.isArray(
        cache.featured
      )
    ) {

      state.featured =
        cache.featured;

    }


    if (
      Array.isArray(
        cache.categories
      )
    ) {

      state.categories =
        cache.categories;

    }


    if (
      Array.isArray(
        cache.genres
      )
    ) {

      state.genres =
        cache.genres;

    }


    return (
      state.stories.length > 0
    );

  }


  /* =======================================================
     12. INITIALIZATION
  ======================================================= */

  async function initialize() {

    loadStorage();

    injectEnhancementStyles();

    ensureGeneratedUI();

    bindEvents();

    showSkeletons();

    showLoading(
      "Connecting to StoryNest..."
    );


    if (!navigator.onLine) {

      state.offline = true;

      if (
        restoreCachedData()
      ) {

        renderAll();

        setConnectionStatus(
          "Offline — showing cached stories",
          "offline"
        );

      } else {

        renderEmptyState(
          "You are offline.",
          "Connect to the internet and try again."
        );

        setConnectionStatus(
          "You are offline",
          "offline"
        );

      }

      state.initialized =
        true;

      hideLoading();

      return;

    }


    try {

      const health =
        await api("health");


      console.info(
        "StoryNest backend:",
        health
      );


      setConnectionStatus(
        "StoryNest is online",
        "online"
      );


      await Promise.all([

        loadStories(),

        loadFeatured(),

        loadCategories(),

        loadGenres()

      ]);


      state.initialized =
        true;

      state.lastRefresh =
        Date.now();


      cacheData();

      renderAll();

      updateRecentlyRead();

      renderRecommended();


    } catch (error) {

      console.error(
        "StoryNest initialization failed:",
        error
      );


      if (
        restoreCachedData()
      ) {

        renderAll();

        setConnectionStatus(
          "Offline mode — showing cached stories",
          "offline"
        );

      } else {

        showError(
          "Unable to connect to StoryNest."
        );

        renderAPIError(
          "StoryNest is temporarily unavailable.",
          "Please check your connection and try again."
        );

      }

    } finally {

      hideLoading();

    }

  }


  /* =======================================================
     13. LOAD STORIES
  ======================================================= */

  async function loadStories() {

    showLoading(
      "Loading stories..."
    );


    try {

      const response =
        await api(
          "stories",
          {
            page:
              state.page,

            pageSize:
              state.pageSize,

            category:
              state.category,

            genre:
              state.genre,

            age:
              state.age,

            readingLevel:
              state.readingLevel,

            readingTime:
              state.readingTime

          }
        );


      const records =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];


      state.stories =
        records
          .map(
            normalizeStory
          )
          .filter(Boolean);


      state.allKnownStories =
        mergeStories(
          state.allKnownStories,
          state.stories
        );


      updateStoryCount(
        response.pagination?.total ??
        state.stories.length
      );


      renderStoryLibrary();

      renderRecentlyAdded();

      renderRecommended();

      cacheData();


      setConnectionStatus(
        navigator.onLine
          ? "Stories updated"
          : "Offline",
        navigator.onLine
          ? "online"
          : "offline"
      );


      return state.stories;


    } catch (error) {

      console.error(
        "Stories loading failed:",
        error
      );


      if (
        restoreCachedData()
      ) {

        renderStoryLibrary();

        setConnectionStatus(
          "Showing cached stories",
          "offline"
        );

      } else {

        renderAPIError(
          "Stories could not be loaded.",
          error.message ||
          "Please try again."
        );

      }


      throw error;


    } finally {

      hideLoading();

    }

  }


  async function loadFeatured() {

    try {

      const response =
        await api(
          "featured",
          {
            page: 1,
            pageSize: 10
          }
        );


      state.featured =
        Array.isArray(
          response.data
        )
          ? response.data
              .map(
                normalizeStory
              )
              .filter(Boolean)
          : [];


      state.allKnownStories =
        mergeStories(
          state.allKnownStories,
          state.featured
        );


      renderFeatured();

    } catch (error) {

      console.warn(
        "Featured stories unavailable:",
        error
      );

      state.featured = [];

    }

  }


  async function loadCategories() {

    try {

      const response =
        await api(
          "categories"
        );


      state.categories =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];


      renderCategories();

    } catch (error) {

      console.warn(
        "Categories unavailable:",
        error
      );

    }

  }


  async function loadGenres() {

    try {

      const response =
        await api(
          "genres"
        );


      state.genres =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];


      renderGenres();

    } catch (error) {

      console.warn(
        "Genres unavailable:",
        error
      );

    }

  }


  /* =======================================================
     14. SEARCH
  ======================================================= */

  async function searchStories(
    query
  ) {

    const value =
      String(
        query || ""
      ).trim();


    state.searchQuery =
      value;


    if (!value) {

      await loadStories();

      return;

    }


    showLoading(
      `Searching for "${value}"...`
    );


    try {

      const response =
        await api(
          "search",
          {
            q: value
          }
        );


      state.stories =
        Array.isArray(
          response.data
        )
          ? response.data
              .map(
                normalizeStory
              )
              .filter(Boolean)
          : [];


      state.allKnownStories =
        mergeStories(
          state.allKnownStories,
          state.stories
        );


      updateStoryCount(
        response.total ??
        state.stories.length
      );


      renderStoryLibrary();


      setConnectionStatus(
        `${state.stories.length} ${
          state.stories.length === 1
            ? "story"
            : "stories"
        } found`,
        "online"
      );


    } catch (error) {

      console.error(
        "Search failed:",
        error
      );


      showError(
        "Search could not be completed."
      );


      renderAPIError(
        "Search unavailable.",
        "Please try again."
      );

    } finally {

      hideLoading();

    }

  }


  /* =======================================================
     15. STORY LOADING
  ======================================================= */

  async function openStory(
    identifier
  ) {

    if (!identifier) {
      return;
    }


    showLoading(
      "Opening story..."
    );


    try {

      const response =
        await api(
          "story",
          {
            id:
              identifier
          }
        );


      if (
        !response ||
        !response.story
      ) {

        throw new Error(
          "Story was not returned by the API."
        );

      }


      const story =
        normalizeStory(
          response.story
        );


      if (!story) {

        throw new Error(
          "Story data could not be normalized."
        );

      }


      state.currentStory =
        story;


      state.currentStoryIndex =
        findStoryIndex(
          story.story_id
        );


      rememberStory(
        story
      );


      renderStoryPage(
        story
      );


      updateReadingProgress(
        story
      );


      restoreAudioPosition(
        story
      );


      updateRecommendedForStory(
        story
      );


      setConnectionStatus(
        "Story loaded",
        "online"
      );


      showStoryPage();


      scrollToStory();


    } catch (error) {

      console.error(
        "Story loading failed:",
        error
      );


      showError(
        "Unable to load this story."
      );


      renderStoryLoadError();

    } finally {

      hideLoading();

    }

  }


  /* =======================================================
     16. STORY PAGE
  ======================================================= */

  function renderStoryPage(
    story
  ) {

    const page =
      firstExisting(
        "#storyPage",
        ".story-page",
        "[data-story-page]"
      );


    if (!page) {

      console.warn(
        "Story page container not found."
      );

      return;

    }


    page.hidden =
      false;


    const title =
      firstExisting(
        "#storyTitle",
        ".story-title",
        "[data-story-title]"
      );


    const subtitle =
      firstExisting(
        "#storySubtitle",
        ".story-subtitle",
        "[data-story-subtitle]"
      );


    const description =
      firstExisting(
        "#storyDescription",
        ".story-description",
        "[data-story-description]"
      );


    const metadata =
      firstExisting(
        "#storyMeta",
        ".story-meta",
        "[data-story-meta]"
      );


    text(
      title,
      story.title
    );


    text(
      subtitle,
      story.subtitle
    );


    text(
      description,
      story.description
    );


    renderStoryMetadata(
      metadata,
      story
    );


    renderAuthor(
      story
    );


    renderCover(
      story
    );


    renderStoryContent(
      story
    );


    renderCharacters(
      story
    );


    renderLesson(
      story
    );


    renderReflection(
      story
    );


    renderDiscussion(
      story
    );


    renderActivity(
      story
    );


    renderTags(
      story
    );


    renderAudio(
      story
    );


    renderFavoriteButton(
      story
    );


    renderReadingControls();

  }


  function renderStoryMetadata(
    container,
    story
  ) {

    if (!container) {
      return;
    }


    clearElement(
      container
    );


    const values = [

      story.category,

      story.genre,

      story.age_min !== "" &&
      story.age_max !== ""
        ? `Ages ${story.age_min}–${story.age_max}`
        : "",

      story.reading_level
        ? `Level: ${story.reading_level}`
        : "",

      `${story.estimated_minutes} min read`,

      story.language

    ]
      .filter(Boolean);


    values.forEach(
      (value) => {

        const span =
          createElement(
            "span",
            {
              text:
                value
            }
          );

        container.appendChild(
          span
        );

      }
    );

  }


  function renderAuthor(
    story
  ) {

    $$(
      "#storyAuthor, .story-author, [data-story-author]"
    ).forEach(
      (element) => {

        text(
          element,
          story.author_name
        );

      }
    );

  }


  function renderCover(
    story
  ) {

    const image =
      firstExisting(
        "#storyCover",
        ".story-cover img",
        "[data-story-cover]"
      );


    if (!image) {
      return;
    }


    if (
      story.cover_image
    ) {

      image.src =
        story.cover_image;

      image.alt =
        story.title ||
        "StoryNest story";

      image.loading =
        "lazy";

      image.decoding =
        "async";

      image.hidden =
        false;

      image.onerror =
        () => {

          image.removeAttribute(
            "src"
          );

          image.hidden =
            true;

        };

    } else {

      image.removeAttribute(
        "src"
      );

      image.alt =
        "";

      image.hidden =
        true;

    }

  }


  /* =======================================================
     17. SAFE STORY CONTENT
  ======================================================= */

  function renderStoryContent(
    story
  ) {

    const container =
      firstExisting(
        "#storyContent",
        "#storyText",
        ".story-content",
        ".story-text",
        "[data-story-content]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    const storyText =
      String(
        story.story || ""
      ).trim();


    if (!storyText) {

      const empty =
        createElement(
          "div",
          {
            className:
              "story-empty"
          }
        );


      const heading =
        createElement(
          "strong",
          {
            text:
              "This story is being prepared."
          }
        );


      const paragraph =
        createElement(
          "p",
          {
            text:
              "The story content has not been published yet."
          }
        );


      empty.appendChild(
        heading
      );

      empty.appendChild(
        paragraph
      );

      container.appendChild(
        empty
      );

      return;

    }


    const paragraphs =
      storyText
        .split(
          /\n\s*\n|\r?\n/
        )
        .map(
          (paragraph) =>
            paragraph.trim()
        )
        .filter(Boolean);


    paragraphs.forEach(
      (paragraph) => {

        const p =
          document.createElement(
            "p"
          );

        /*
         * IMPORTANT:
         * Sheet content is inserted as a text node.
         * No raw HTML is interpreted.
         */
        p.appendChild(
          document.createTextNode(
            paragraph
          )
        );


        container.appendChild(
          p
        );

      }
    );


    container.dataset.storyRendered =
      "true";

  }


  /* =======================================================
     18. CHARACTERS
  ======================================================= */

  function renderCharacters(
    story
  ) {

    const container =
      firstExisting(
        "#characters",
        "#storyCharacters",
        ".characters",
        "[data-characters]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    if (
      !Array.isArray(
        story.characters
      ) ||
      !story.characters.length
    ) {

      container.hidden =
        true;

      return;

    }


    container.hidden =
      false;


    story.characters.forEach(
      (character) => {

        const article =
          createElement(
            "article",
            {
              className:
                "character-card"
            }
          );


        const name =
          createElement(
            "h3",
            {
              text:
                character.name ||
                "Character"
            }
          );


        article.appendChild(
          name
        );


        if (character.role) {

          article.appendChild(
            createElement(
              "p",
              {
                text:
                  character.role
              }
            )
          );

        }


        container.appendChild(
          article
        );

      }
    );

  }


  /* =======================================================
     19. OPTIONAL STORY SECTIONS
  ======================================================= */

  function renderOptionalText(
    selectors,
    value
  ) {

    const element =
      firstExisting(
        ...selectors
      );


    if (!element) {
      return;
    }


    const textValue =
      String(
        value || ""
      ).trim();


    clearElement(
      element
    );


    if (!textValue) {

      element.hidden =
        true;

      return;

    }


    element.hidden =
      false;


    const paragraph =
      document.createElement(
        "p"
      );


    paragraph.appendChild(
      document.createTextNode(
        textValue
      )
    );


    element.appendChild(
      paragraph
    );

  }


  function renderLesson(
    story
  ) {

    renderOptionalText(
      [
        "#storyLesson",
        "#lesson",
        ".story-lesson",
        "[data-story-lesson]"
      ],
      story.lesson
    );

  }


  function renderReflection(
    story
  ) {

    renderOptionalText(
      [
        "#storyReflection",
        "#reflection",
        ".story-reflection",
        "[data-story-reflection]"
      ],
      story.reflection
    );

  }


  function renderDiscussion(
    story
  ) {

    renderOptionalText(
      [
        "#storyDiscussion",
        "#discussion",
        ".story-discussion",
        "[data-story-discussion]"
      ],
      story.discussion
    );

  }


  function renderActivity(
    story
  ) {

    renderOptionalText(
      [
        "#storyActivity",
        "#activity",
        ".story-activity",
        "[data-story-activity]"
      ],
      story.activity
    );

  }


  function renderTags(
    story
  ) {

    const container =
      firstExisting(
        "#storyTags",
        ".story-tags",
        "[data-story-tags]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    if (
      !story.tags.length
    ) {

      container.hidden =
        true;

      return;

    }


    container.hidden =
      false;


    story.tags.forEach(
      (tag) => {

        const element =
          createElement(
            "span",
            {
              className:
                "story-tag",
              text:
                tag
            }
          );


        container.appendChild(
          element
        );

      }
    );

  }


  /* =======================================================
     20. AUDIO ENGINE
  ======================================================= */

  let audioElement =
    null;


  function getAudioElement() {

    if (audioElement) {
      return audioElement;
    }


    audioElement =
      document.createElement(
        "audio"
      );


    audioElement.preload =
      "metadata";

    audioElement.setAttribute(
      "aria-label",
      "Story narration"
    );


    audioElement.addEventListener(
      "timeupdate",
      updateAudioProgress
    );


    audioElement.addEventListener(
      "loadedmetadata",
      updateAudioDuration
    );


    audioElement.addEventListener(
      "play",
      () => {

        state.audio.isPlaying =
          true;

        updateAudioButtons(
          true
        );

        updateMiniPlayer();

      }
    );


    audioElement.addEventListener(
      "pause",
      () => {

        state.audio.isPlaying =
          false;

        updateAudioButtons(
          false
        );

        updateMiniPlayer();

      }
    );


    audioElement.addEventListener(
      "ended",
      () => {

        state.audio.isPlaying =
          false;

        updateAudioButtons(
          false
        );

        updateMiniPlayer();

      }
    );


    audioElement.addEventListener(
      "error",
      () => {

        console.warn(
          "Audio could not be loaded."
        );


        state.audio.isPlaying =
          false;


        updateAudioButtons(
          false
        );


        updateMiniPlayer();


        setConnectionStatus(
          "Narration could not be loaded.",
          "error"
        );

      }
    );


    return audioElement;

  }


  function renderAudio(
    story
  ) {

    const player =
      firstExisting(
        "#audioPlayer",
        ".audio-player",
        "[data-audio-player]"
      );


    const available =
      !!(
        story.audio_available &&
        story.audio_url
      );


    if (player) {

      player.hidden =
        false;

      player.dataset.available =
        String(
          available
        );

    }


    updateAudioAvailabilityUI(
      available
    );


    if (!available) {

      /*
       * Do not pretend that speech synthesis
       * is uploaded narration.
       */
      updateAudioButtons(
        false
      );


      updateMiniPlayer();

      return;

    }


    const audio =
      getAudioElement();


    if (
      audio.src !==
      story.audio_url
    ) {

      audio.src =
        story.audio_url;

    }


    audio.playbackRate =
      Number(
        state.preferences
          .narrationSpeed || 1
      );


    audio.volume =
      Number(
        state.preferences
          .volume ?? 1
      );


    state.audio.storyId =
      story.story_id;

    state.audio.storyTitle =
      story.title;

    state.audio.src =
      story.audio_url;


    restoreAudioPosition(
      story
    );


    updateAudioButtons(
      !audio.paused
    );


    updateMiniPlayer();

  }


  function updateAudioAvailabilityUI(
    available
  ) {

    $$(
      "[data-audio-unavailable]"
    ).forEach(
      (element) => {

        element.hidden =
          available;

      }
    );


    $$(
      "[data-audio-real]"
    ).forEach(
      (element) => {

        element.hidden =
          !available;

      }
    );


    $$(
      "[data-speech-fallback]"
    ).forEach(
      (element) => {

        element.hidden =
          available ||
          !speechSupported();

      }
    );

  }


  async function toggleAudio() {

    const story =
      state.currentStory;


    if (
      !story ||
      !story.audio_available ||
      !story.audio_url
    ) {

      setConnectionStatus(
        "Narration is not available for this story.",
        "normal"
      );


      if (
        speechSupported()
      ) {

        announceSpeechAvailability();

      }


      return;

    }


    stopSpeech();


    const audio =
      getAudioElement();


    if (
      audio.src !==
      story.audio_url
    ) {

      audio.src =
        story.audio_url;

    }


    try {

      if (audio.paused) {

        await audio.play();

      } else {

        audio.pause();

      }

    } catch (error) {

      console.error(
        "Audio playback failed:",
        error
      );


      setConnectionStatus(
        "Narration could not be started.",
        "error"
      );

    }

  }


  function updateAudioButtons(
    isPlaying
  ) {

    $$(
      "[data-audio-toggle], #audioPlay, .audio-play"
    ).forEach(
      (button) => {

        button.setAttribute(
          "aria-label",
          isPlaying
            ? "Pause narration"
            : "Play narration"
        );


        button.setAttribute(
          "aria-pressed",
          String(isPlaying)
        );


        const label =
          button.querySelector(
            "[data-audio-label]"
          );


        if (label) {

          text(
            label,
            isPlaying
              ? "Pause"
              : "Play"
          );

        } else {

          const textNode =
            button.dataset.playText;


          if (
            textNode
          ) {

            button.textContent =
              isPlaying
                ? button.dataset.pauseText ||
                  "Pause"
                : textNode;

          }

        }

      }
    );

  }


  function updateAudioProgress() {

    const audio =
      getAudioElement();


    if (
      !Number.isFinite(
        audio.duration
      ) ||
      audio.duration <= 0
    ) {

      return;

    }


    const percent =
      (
        audio.currentTime /
        audio.duration
      ) * 100;


    $$(
      "[data-audio-progress], #audioProgress"
    ).forEach(
      (element) => {

        if (
          element.tagName ===
          "INPUT"
        ) {

          element.value =
            percent;

        } else {

          element.style.width =
            `${percent}%`;

        }

      }
    );


    $$(
      "[data-audio-current], #audioCurrent"
    ).forEach(
      (element) => {

        text(
          element,
          formatTime(
            audio.currentTime
          )
        );

      }
    );


    $$(
      "[data-audio-percent]"
    ).forEach(
      (element) => {

        text(
          element,
          `${Math.round(percent)}%`
        );

      }
    );


    if (
      state.audio.storyId
    ) {

      state.audioProgress[
        state.audio.storyId
      ] =
        audio.currentTime;


      saveAudioProgress();

    }

  }


  function updateAudioDuration() {

    const audio =
      getAudioElement();


    $$(
      "[data-audio-duration], #audioDuration"
    ).forEach(
      (element) => {

        text(
          element,
          formatTime(
            audio.duration
          )
        );

      }
    );

  }


  function setAudioSpeed(
    speed
  ) {

    const value =
      Number(speed);


    if (
      !Number.isFinite(value)
    ) {
      return;
    }


    const allowed = [
      0.75,
      1,
      1.25,
      1.5,
      2
    ];


    const nearest =
      allowed.reduce(
        (best, current) =>
          Math.abs(
            current - value
          ) <
          Math.abs(
            best - value
          )
            ? current
            : best
      );


    state.preferences
      .narrationSpeed =
      nearest;


    savePreferences();


    const audio =
      getAudioElement();


    audio.playbackRate =
      nearest;


    $$(
      "[data-audio-speed], #audioSpeed"
    ).forEach(
      (select) => {

        select.value =
          String(nearest);

      }
    );

  }


  function seekAudio(
    percent
  ) {

    const audio =
      getAudioElement();


    if (
      !Number.isFinite(
        audio.duration
      )
    ) {
      return;
    }


    const value =
      Math.max(
        0,
        Math.min(
          100,
          Number(percent)
        )
      );


    audio.currentTime =
      audio.duration *
      (value / 100);

  }


  function seekAudioRelative(
    seconds
  ) {

    const audio =
      getAudioElement();


    if (
      !Number.isFinite(
        audio.duration
      )
    ) {
      return;
    }


    audio.currentTime =
      Math.max(
        0,
        Math.min(
          audio.duration,
          audio.currentTime +
          seconds
        )
      );

  }


  function setAudioVolume(
    value
  ) {

    const volume =
      Math.max(
        0,
        Math.min(
          1,
          Number(value)
        )
      );


    state.preferences.volume =
      volume;


    savePreferences();

    updateAudioVolume();

  }


  function updateAudioVolume() {

    const audio =
      getAudioElement();


    audio.volume =
      Number(
        state.preferences.volume ?? 1
      );


    $$(
      "[data-audio-volume], #audioVolume"
    ).forEach(
      (element) => {

        if (
          element.tagName ===
          "INPUT"
        ) {

          element.value =
            audio.volume;

        }

      }
    );

  }


  function restoreAudioPosition(
    story
  ) {

    if (
      !story?.story_id
    ) {
      return;
    }


    const saved =
      Number(
        state.audioProgress[
          story.story_id
        ]
      );


    if (
      !Number.isFinite(saved) ||
      saved <= 0
    ) {

      return;

    }


    const audio =
      getAudioElement();


    const restore =
      () => {

        if (
          Number.isFinite(
            audio.duration
          ) &&
          saved <
          audio.duration
        ) {

          audio.currentTime =
            saved;

        }

      };


    if (
      audio.readyState >= 1
    ) {

      restore();

    } else {

      audio.addEventListener(
        "loadedmetadata",
        restore,
        {
          once: true
        }
      );

    }

  }


  function formatTime(
    seconds
  ) {

    if (
      !Number.isFinite(
        seconds
      )
    ) {

      return "0:00";

    }


    const hours =
      Math.floor(
        seconds / 3600
      );


    const minutes =
      Math.floor(
        (
          seconds % 3600
        ) / 60
      );


    const remaining =
      Math.floor(
        seconds % 60
      );


    if (hours > 0) {

      return `${hours}:${
        String(minutes)
          .padStart(2, "0")
      }:${
        String(remaining)
          .padStart(2, "0")
      }`;

    }


    return `${minutes}:${
      String(remaining)
        .padStart(2, "0")
    }`;

  }


  /* =======================================================
     21. SPEECH SYNTHESIS FALLBACK
  ======================================================= */

  function speechSupported() {

    return (
      "speechSynthesis" in
      window
    );

  }


  function announceSpeechAvailability() {

    setConnectionStatus(
      "Uploaded narration is unavailable. Read Aloud is available.",
      "normal"
    );

  }


  function toggleSpeech() {

    if (
      !speechSupported()
    ) {

      setConnectionStatus(
        "Read Aloud is not supported by this browser.",
        "error"
      );

      return;

    }


    if (
      state.speech.active
    ) {

      stopSpeech();

      return;

    }


    startSpeech();

  }


  function startSpeech() {

    const story =
      state.currentStory;


    if (
      !story ||
      !story.story
    ) {

      return;

    }


    stopAudio();


    const paragraphs =
      String(
        story.story
      )
        .split(
          /\n\s*\n|\r?\n/
        )
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean);


    if (
      !paragraphs.length
    ) {

      return;

    }


    state.speech.active =
      true;

    state.speech.storyId =
      story.story_id;

    state.speech.paragraphIndex =
      0;


    speakParagraphs(
      paragraphs
    );

  }


  function speakParagraphs(
    paragraphs
  ) {

    if (
      !state.speech.active
    ) {

      return;

    }


    const index =
      state.speech.paragraphIndex;


    if (
      index >=
      paragraphs.length
    ) {

      stopSpeech();

      return;

    }


    const utterance =
      new SpeechSynthesisUtterance(
        paragraphs[index]
      );


    utterance.rate =
      Number(
        state.preferences
          .narrationSpeed || 1
      );


    utterance.volume =
      Number(
        state.preferences
          .volume ?? 1
      );


    utterance.onend =
      () => {

        if (
          !state.speech.active
        ) {
          return;
        }


        state.speech
          .paragraphIndex++;


        speakParagraphs(
          paragraphs
        );

      };


    utterance.onerror =
      () => {

        stopSpeech();

        setConnectionStatus(
          "Read Aloud could not continue.",
          "error"
        );

      };


    state.speech.utterance =
      utterance;


    window.speechSynthesis
      .speak(
        utterance
      );


    updateSpeechButtons(
      true
    );

  }


  function stopSpeech() {

    if (
      speechSupported()
    ) {

      window.speechSynthesis
        .cancel();

    }


    state.speech.active =
      false;

    state.speech.utterance =
      null;

    updateSpeechButtons(
      false
    );

  }


  function updateSpeechButtons(
    active
  ) {

    $$(
      "[data-speech-toggle], #speechReadAloud"
    ).forEach(
      (button) => {

        button.setAttribute(
          "aria-label",
          active
            ? "Stop Read Aloud"
            : "Read story aloud"
        );


        button.setAttribute(
          "aria-pressed",
          String(active)
        );


        const label =
          button.querySelector(
            "[data-speech-label]"
          );


        if (label) {

          text(
            label,
            active
              ? "Stop"
              : "Read Aloud"
          );

        }

      }
    );

  }


  function stopAudio() {

    if (!audioElement) {
      return;
    }


    try {

      audioElement.pause();

    } catch {}

  }


  /* =======================================================
     22. FLOATING AUDIO PLAYER
  ======================================================= */

  function ensureMiniPlayer() {

    if (
      $("#storynestMiniPlayer")
    ) {

      return;

    }


    const player =
      createElement(
        "section",
        {
          className:
            "storynest-mini-player",
          attrs: {
            id:
              "storynestMiniPlayer",
            "aria-label":
              "StoryNest audio player",
            role:
              "region"
          }
        }
      );


    const title =
      createElement(
        "div",
        {
          className:
            "storynest-mini-title",
          attrs: {
            "data-mini-title":
              ""
          },
          text:
            "StoryNest"
        }
      );


    const controls =
      createElement(
        "div",
        {
          className:
            "storynest-mini-controls"
        }
      );


    const back =
      createElement(
        "button",
        {
          attrs: {
            type:
              "button",
            "aria-label":
              "Seek back 15 seconds",
            "data-mini-back":
              ""
          },
          text:
            "−15"
        }
      );


    const play =
      createElement(
        "button",
        {
          attrs: {
            type:
              "button",
            "aria-label":
              "Play narration",
            "data-mini-play":
              ""
          },
          text:
            "▶"
        }
      );


    const forward =
      createElement(
        "button",
        {
          attrs: {
            type:
              "button",
            "aria-label":
              "Seek forward 15 seconds",
            "data-mini-forward":
              ""
          },
          text:
            "+15"
        }
      );


    const progress =
      createElement(
        "input",
        {
          attrs: {
            type:
              "range",
            min:
              "0",
            max:
              "100",
            value:
              "0",
            step:
              "0.1",
            "aria-label":
              "Narration progress",
            "data-mini-progress":
              ""
          }
        }
      );


    controls.appendChild(
      back
    );

    controls.appendChild(
      play
    );

    controls.appendChild(
      forward
    );


    player.appendChild(
      title
    );

    player.appendChild(
      progress
    );

    player.appendChild(
      controls
    );


    document.body.appendChild(
      player
    );


    play.addEventListener(
      "click",
      toggleAudio
    );


    back.addEventListener(
      "click",
      () =>
        seekAudioRelative(
          -15
        )
    );


    forward.addEventListener(
      "click",
      () =>
        seekAudioRelative(
          15
        )
    );


    progress.addEventListener(
      "input",
      () =>
        seekAudio(
          progress.value
        )
    );

  }


  function updateMiniPlayer() {

    const player =
      $("#storynestMiniPlayer");


    if (!player) {
      return;
    }


    const hasAudio =
      !!(
        state.audio.src
      );


    player.hidden =
      !hasAudio;


    if (!hasAudio) {
      return;
    }


    text(
      player.querySelector(
        "[data-mini-title]"
      ),
      state.audio.storyTitle ||
      "StoryNest narration"
    );


    const play =
      player.querySelector(
        "[data-mini-play]"
      );


    if (play) {

      play.textContent =
        state.audio.isPlaying
          ? "❚❚"
          : "▶";


      play.setAttribute(
        "aria-label",
        state.audio.isPlaying
          ? "Pause narration"
          : "Play narration"
      );

    }


    const progress =
      player.querySelector(
        "[data-mini-progress]"
      );


    if (
      progress &&
      audioElement &&
      Number.isFinite(
        audioElement.duration
      )
    ) {

      progress.value =
        (
          audioElement.currentTime /
          audioElement.duration
        ) * 100;

    }

  }


  /* =======================================================
     23. FAVORITES / BOOKMARKS
  ======================================================= */

  function isFavorite(
    storyId
  ) {

    return state.favorites.includes(
      String(storyId)
    );

  }


  function toggleFavorite(
    storyId
  ) {

    if (!storyId) {
      return;
    }


    const id =
      String(storyId);


    if (
      isFavorite(id)
    ) {

      state.favorites =
        state.favorites.filter(
          (item) =>
            item !== id
        );

    } else {

      state.favorites.push(
        id
      );

    }


    saveFavorites();


    if (
      state.currentStory
    ) {

      renderFavoriteButton(
        state.currentStory
      );

    }


    renderStoryLibrary();

    renderRecommended();

  }


  function renderFavoriteButton(
    story
  ) {

    $$(
      "[data-favorite-story], #favoriteStory, .favorite-story"
    ).forEach(
      (button) => {

        const active =
          isFavorite(
            story.story_id
          );


        button.classList.toggle(
          "active",
          active
        );


        button.setAttribute(
          "aria-pressed",
          String(active)
        );


        button.setAttribute(
          "aria-label",
          active
            ? "Remove story from saved stories"
            : "Save story"
        );


        const label =
          button.querySelector(
            "[data-favorite-label]"
          );


        if (label) {

          text(
            label,
            active
              ? "Saved"
              : "Save"
          );

        }

      }
    );

  }


  /* =======================================================
     24. RECENTLY READ
  ======================================================= */

  function rememberStory(
    story
  ) {

    if (
      !story?.story_id
    ) {

      return;

    }


    const item = {

      id:
        story.story_id,

      title:
        story.title,

      slug:
        story.slug,

      cover_image:
        story.cover_image,

      category:
        story.category,

      reading_time:
        story.estimated_minutes,

      timestamp:
        Date.now()

    };


    state.recentStories =
      [
        item,
        ...state.recentStories
          .filter(
            (entry) =>
              String(entry.id) !==
              String(story.story_id)
          )

      ]
        .slice(
          0,
          MAX_RECENT
        );


    saveRecent();

    updateRecentlyRead();

  }


  function updateRecentlyRead() {

    renderRecentlyRead();

  }


  function renderRecentlyRead() {

    const container =
      firstExisting(
        "#recentlyRead",
        "#recentStories",
        ".recently-read",
        "[data-recently-read]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    if (
      !state.recentStories.length
    ) {

      container.hidden =
        true;

      return;

    }


    container.hidden =
      false;


    state.recentStories
      .slice(
        0,
        6
      )
      .forEach(
        (item) => {

          const button =
            createElement(
              "button",
              {
                className:
                  "recent-story",
                attrs: {
                  type:
                    "button",
                  "data-open-story":
                    item.id
                }
              }
            );


          if (
            item.cover_image
          ) {

            const image =
              createElement(
                "img",
                {
                  attrs: {
                    src:
                      safeImageURL(
                        item.cover_image
                      ),
                    alt:
                      item.title ||
                      "Story",
                    loading:
                      "lazy"
                  }
                }
              );


            button.appendChild(
              image
            );

          }


          button.appendChild(
            createElement(
              "span",
              {
                text:
                  item.title ||
                  "Untitled story"
              }
            )
          );


          container.appendChild(
            button
          );

        }
      );


    bindDynamicStoryCards(
      container
    );

  }


  /* =======================================================
     25. STORY CARDS
  ======================================================= */

  function storyCard(
    story
  ) {

    const favorite =
      isFavorite(
        story.story_id
      );


    const cover =
      story.cover_image
        ? `
          <img
            src="${escapeHTML(
              story.cover_image
            )}"
            alt="${escapeHTML(
              story.title
            )}"
            loading="lazy"
            decoding="async"
          >
        `
        : `
          <div
            class="story-cover-placeholder"
            aria-hidden="true"
          >
            SN
          </div>
        `;


    const age =
      story.age_min !== "" &&
      story.age_max !== ""
        ? `Ages ${escapeHTML(
            story.age_min
          )}–${escapeHTML(
            story.age_max
          )}`
        : "";


    const audio =
      story.audio_available
        ? `<span aria-label="Narration available">Audio</span>`
        : "";


    const progress =
      Number(
        state.progress[
          story.story_id
        ] || 0
      );


    return `
      <article
        class="story-card"
        data-story-id="${escapeHTML(
          story.story_id
        )}"
        data-story-slug="${escapeHTML(
          story.slug
        )}"
      >

        <button
          class="story-card-main"
          type="button"
          data-open-story="${escapeHTML(
            story.story_id
          )}"
          aria-label="Read ${escapeHTML(
            story.title
          )}"
        >

          <div class="story-card-cover">
            ${cover}
          </div>

          <div class="story-card-content">

            <div class="story-card-meta">

              ${
                story.category
                  ? `<span>${escapeHTML(
                      story.category
                    )}</span>`
                  : ""
              }

              ${
                story.genre
                  ? `<span>${escapeHTML(
                      story.genre
                    )}</span>`
                  : ""
              }

              ${
                age
                  ? `<span>${age}</span>`
                  : ""
              }

              ${
                audio
              }

            </div>

            <h3>
              ${escapeHTML(
                story.title
              )}
            </h3>

            ${
              story.subtitle
                ? `
                  <p class="story-card-subtitle">
                    ${escapeHTML(
                      story.subtitle
                    )}
                  </p>
                `
                : ""
            }

            ${
              story.description
                ? `
                  <p class="story-card-description">
                    ${escapeHTML(
                      story.description
                    )}
                  </p>
                `
                : ""
            }

            <div class="story-card-footer">

              <span>
                ${escapeHTML(
                  story.estimated_minutes
                )} min read
              </span>

              <span>
                Read →
              </span>

            </div>

            ${
              progress > 0
                ? `
                  <div
                    class="story-card-progress"
                    aria-label="${progress}% read"
                  >
                    <span
                      style="width:${progress}%"
                    ></span>
                  </div>
                `
                : ""
            }

          </div>

        </button>

        <button
          type="button"
          class="story-card-save ${
            favorite
              ? "active"
              : ""
          }"
          data-save-story="${escapeHTML(
            story.story_id
          )}"
          aria-label="${
            favorite
              ? "Remove from saved stories"
              : "Save story"
          }"
          aria-pressed="${favorite}"
        >
          ${favorite ? "★" : "☆"}
        </button>

      </article>
    `;

  }


  /* =======================================================
     26. STORY LIBRARY
  ======================================================= */

  function renderStoryLibrary() {

    const container =
      firstExisting(
        "#storyGrid",
        "#storiesGrid",
        "#storyList",
        ".story-grid",
        ".stories-grid",
        ".story-list",
        "[data-story-grid]"
      );


    if (!container) {
      return;
    }


    let stories =
      applyClientFilters(
        state.stories
      );


    stories =
      sortStories(
        stories
      );


    if (!stories.length) {

      renderEmptyState(
        "No stories found.",
        "Try another search or clear your filters."
      );

      return;

    }


    htmlSafeCards(
      container,
      stories
    );


    bindDynamicStoryCards();

    updateStoryCount(
      stories.length
    );

  }


  function htmlSafeCards(
    container,
    stories
  ) {

    /*
     * storyCard() escapes every Sheet
     * value before HTML construction.
     */
    container.innerHTML =
      stories
        .map(
          storyCard
        )
        .join("");

  }


  function renderFeatured() {

    const container =
      firstExisting(
        "#featuredGrid",
        "#featuredStories",
        ".featured-grid",
        "[data-featured]"
      );


    if (!container) {
      return;
    }


    if (
      !state.featured.length
    ) {

      container.hidden =
        true;

      return;

    }


    container.hidden =
      false;


    htmlSafeCards(
      container,
      state.featured
    );


    bindDynamicStoryCards(
      container
    );

  }


  function renderRecentlyAdded() {

    const container =
      firstExisting(
        "#recentlyAdded",
        "#recentlyAddedStories",
        ".recently-added",
        "[data-recently-added]"
      );


    if (!container) {
      return;
    }


    const stories =
      [...state.allKnownStories]
        .sort(
          compareNewest
        )
        .slice(
          0,
          6
        );


    if (!stories.length) {

      container.hidden =
        true;

      return;

    }


    container.hidden =
      false;


    htmlSafeCards(
      container,
      stories
    );


    bindDynamicStoryCards(
      container
    );

  }


  /* =======================================================
     27. FILTERING / DISCOVERY
  ======================================================= */

  function applyClientFilters(
    stories
  ) {

    let result =
      [...stories];


    if (
      state.searchQuery
    ) {

      const query =
        state.searchQuery
          .toLowerCase()
          .trim();


      result =
        result.filter(
          (story) =>
            story.search_text
              .includes(
                query
              )
        );

    }


    if (
      state.category
    ) {

      result =
        result.filter(
          (story) =>
            story.category
              .toLowerCase() ===
            state.category
              .toLowerCase()
        );

    }


    if (
      state.genre
    ) {

      result =
        result.filter(
          (story) =>
            story.genre
              .toLowerCase() ===
            state.genre
              .toLowerCase()
        );

    }


    if (
      state.age
    ) {

      result =
        result.filter(
          (story) =>
            storyMatchesAge(
              story,
              state.age
            )
        );

    }


    if (
      state.readingLevel
    ) {

      result =
        result.filter(
          (story) =>
            story.reading_level
              .toLowerCase() ===
            state.readingLevel
              .toLowerCase()
        );

    }


    if (
      state.readingTime
    ) {

      result =
        result.filter(
          (story) =>
            storyMatchesReadingTime(
              story,
              state.readingTime
            )
        );

    }


    return result;

  }


  function storyMatchesAge(
    story,
    value
  ) {

    const age =
      Number(value);


    if (
      !Number.isFinite(age)
    ) {
      return true;
    }


    const min =
      Number(
        story.age_min
      );


    const max =
      Number(
        story.age_max
      );


    if (
      !Number.isFinite(min) &&
      !Number.isFinite(max)
    ) {

      return false;

    }


    return (
      (
        !Number.isFinite(min) ||
        age >= min
      ) &&
      (
        !Number.isFinite(max) ||
        age <= max
      )
    );

  }


  function storyMatchesReadingTime(
    story,
    value
  ) {

    const minutes =
      Number(
        story.estimated_minutes
      );


    if (
      !Number.isFinite(
        minutes
      )
    ) {
      return true;
    }


    switch (value) {

      case "short":
        return minutes <= 5;

      case "medium":
        return (
          minutes > 5 &&
          minutes <= 15
        );

      case "long":
        return minutes > 15;

      default:
        return true;

    }

  }


  function sortStories(
    stories
  ) {

    const result =
      [...stories];


    switch (
      state.sort
    ) {

      case "title":
        return result.sort(
          (a, b) =>
            a.title.localeCompare(
              b.title
            )
        );


      case "short":
        return result.sort(
          (a, b) =>
            a.estimated_minutes -
            b.estimated_minutes
        );


      case "long":
        return result.sort(
          (a, b) =>
            b.estimated_minutes -
            a.estimated_minutes
        );


      case "recent":
      default:
        return result.sort(
          compareNewest
        );

    }

  }


  function compareNewest(
    a,
    b
  ) {

    const dateA =
      getStoryDate(
        a
      );


    const dateB =
      getStoryDate(
        b
      );


    return (
      dateB - dateA
    );

  }


  function getStoryDate(
    story
  ) {

    const value =
      story.updated_at ||
      story.published_at ||
      story.created_at ||
      0;


    const timestamp =
      Date.parse(
        value
      );


    return Number.isFinite(
      timestamp
    )
      ? timestamp
      : 0;

  }


  /* =======================================================
     28. RECOMMENDATIONS
  ======================================================= */

  function mergeStories(
    existing,
    incoming
  ) {

    const map =
      new Map();


    [
      ...(existing || []),
      ...(incoming || [])
    ]
      .forEach(
        (story) => {

          if (
            story?.story_id
          ) {

            map.set(
              String(
                story.story_id
              ),
              story
            );

          }

        }
      );


    return Array.from(
      map.values()
    );

  }


  function updateRecommendedForStory(
    story
  ) {

    const pool =
      mergeStories(
        state.allKnownStories,
        [
          ...state.stories,
          ...state.featured
        ]
      );


    state.related =
      pool
        .filter(
          (item) =>
            item.story_id !==
            story.story_id
        )
        .map(
          (item) => ({
            story:
              item,
            score:
              recommendationScore(
                story,
                item
              )
          })
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )
        .slice(
          0,
          6
        )
        .map(
          (item) =>
            item.story
        );


    renderRelated();

  }


  function renderRecommended() {

    const current =
      state.currentStory;


    if (current) {

      updateRecommendedForStory(
        current
      );

      return;

    }


    const pool =
      mergeStories(
        state.allKnownStories,
        [
          ...state.stories,
          ...state.featured
        ]
      );


    state.recommended =
      pool
        .filter(
          (story) =>
            !isFavorite(
              story.story_id
            )
        )
        .sort(
          compareNewest
        )
        .slice(
          0,
          6
        );


    const container =
      firstExisting(
        "#recommendedStories",
        "#recommended",
        ".recommended-stories",
        "[data-recommended]"
      );


    if (!container) {
      return;
    }


    container.hidden =
      !state.recommended.length;


    if (
      !state.recommended.length
    ) {
      return;
    }


    htmlSafeCards(
      container,
      state.recommended
    );


    bindDynamicStoryCards(
      container
    );

  }


  function recommendationScore(
    source,
    candidate
  ) {

    let score = 0;


    if (
      source.category &&
      candidate.category &&
      source.category.toLowerCase() ===
      candidate.category.toLowerCase()
    ) {

      score += 5;

    }


    if (
      source.genre &&
      candidate.genre &&
      source.genre.toLowerCase() ===
      candidate.genre.toLowerCase()
    ) {

      score += 5;

    }


    const sourceTags =
      new Set(
        source.tags
          .map(
            (tag) =>
              tag.toLowerCase()
          )
      );


    candidate.tags.forEach(
      (tag) => {

        if (
          sourceTags.has(
            tag.toLowerCase()
          )
        ) {

          score += 2;

        }

      }
    );


    if (
      source.reading_level &&
      candidate.reading_level &&
      source.reading_level.toLowerCase() ===
      candidate.reading_level.toLowerCase()
    ) {

      score += 3;

    }


    return score;

  }


  function renderRelated() {

    const container =
      firstExisting(
        "#relatedStories",
        "#related",
        ".related-stories",
        "[data-related-stories]"
      );


    if (!container) {
      return;
    }


    container.hidden =
      !state.related.length;


    if (
      !state.related.length
    ) {
      return;
    }


    htmlSafeCards(
      container,
      state.related
    );


    bindDynamicStoryCards(
      container
    );

  }


  /* =======================================================
     29. CATEGORIES / GENRES
  ======================================================= */

  function renderCategories() {

    $$(
      "#categoryFilter, [data-category-filter]"
    )
      .forEach(
        (select) => {

          const current =
            select.value;


          clearElement(
            select
          );


          select.appendChild(
            createElement(
              "option",
              {
                attrs: {
                  value:
                    ""
                },
                text:
                  "All categories"
              }
            )
          );


          state.categories
            .forEach(
              (item) => {

                const name =
                  typeof item ===
                  "string"
                    ? item
                    : item.name;


                if (!name) {
                  return;
                }


                select.appendChild(
                  createElement(
                    "option",
                    {
                      attrs: {
                        value:
                          name
                      },
                      text:
                        name
                    }
                  )
                );

              }
            );


          select.value =
            current ||
            state.category;

        }
      );

  }


  function renderGenres() {

    $$(
      "#genreFilter, [data-genre-filter]"
    )
      .forEach(
        (select) => {

          const current =
            select.value;


          clearElement(
            select
          );


          select.appendChild(
            createElement(
              "option",
              {
                attrs: {
                  value:
                    ""
                },
                text:
                  "All genres"
              }
            )
          );


          state.genres
            .forEach(
              (item) => {

                const name =
                  typeof item ===
                  "string"
                    ? item
                    : item.name;


                if (!name) {
                  return;
                }


                select.appendChild(
                  createElement(
                    "option",
                    {
                      attrs: {
                        value:
                          name
                      },
                      text:
                        name
                    }
                  )
                );

              }
            );


          select.value =
            current ||
            state.genre;

        }
      );

  }


  function updateStoryCount(
    count
  ) {

    $$(
      "#storyCount, [data-story-count]"
    )
      .forEach(
        (element) => {

          text(
            element,
            count
          );

        }
      );


    $$(
      "[data-search-result-count]"
    )
      .forEach(
        (element) => {

          text(
            element,
            `${count} ${
              Number(count) === 1
                ? "story"
                : "stories"
            } found`
          );

        }
      );

  }


  /* =======================================================
     30. EMPTY / ERROR STATES
  ======================================================= */

  function renderEmptyState(
    title,
    description
  ) {

    const container =
      firstExisting(
        "#storyGrid",
        "#storiesGrid",
        "#storyList",
        ".story-grid",
        ".stories-grid",
        ".story-list",
        "[data-story-grid]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    const wrapper =
      createElement(
        "div",
        {
          className:
            "empty-state"
        }
      );


    wrapper.appendChild(
      createElement(
        "h3",
        {
          text:
            title
        }
      )
    );


    wrapper.appendChild(
      createElement(
        "p",
        {
          text:
            description
        }
      )
    );


    const button =
      createElement(
        "button",
        {
          attrs: {
            type:
              "button",
            "data-reset-filters":
              ""
          },
          text:
            "Clear filters"
        }
      );


    wrapper.appendChild(
      button
    );


    container.appendChild(
      wrapper
    );


    button.addEventListener(
      "click",
      resetFilters
    );

  }


  function renderAPIError(
    title,
    description
  ) {

    const container =
      firstExisting(
        "#storyGrid",
        "#storiesGrid",
        "#storyList",
        ".story-grid",
        ".stories-grid",
        ".story-list",
        "[data-story-grid]"
      );


    if (!container) {
      return;
    }


    clearElement(
      container
    );


    const wrapper =
      createElement(
        "div",
        {
          className:
            "storynest-api-error"
        }
      );


    wrapper.appendChild(
      createElement(
        "h3",
        {
          text:
            title
        }
      )
    );


    wrapper.appendChild(
      createElement(
        "p",
        {
          text:
            description
        }
      )
    );


    const retry =
      createElement(
        "button",
        {
          attrs: {
            type:
              "button",
            "data-retry":
              ""
          },
          text:
            "Retry"
        }
      );


    wrapper.appendChild(
      retry
    );


    container.appendChild(
      wrapper
    );


    retry.addEventListener(
      "click",
      () => {

        initialize();

      }
    );

  }


  function showSkeletons() {

    const container =
      firstExisting(
        "#storyGrid",
        "#storiesGrid",
        "#storyList",
        ".story-grid",
        ".stories-grid",
        ".story-list",
        "[data-story-grid]"
      );


    if (!container) {
      return;
    }


    const cards =
      Array.from(
        {
          length:
            6
        }
      )
        .map(
          () => `
            <article
              class="storynest-skeleton-card"
              aria-hidden="true"
            >
              <div class="storynest-skeleton-cover"></div>
              <div class="storynest-skeleton-line"></div>
              <div class="storynest-skeleton-line short"></div>
              <div class="storynest-skeleton-line"></div>
            </article>
          `
        )
        .join("");


    container.innerHTML =
      cards;

  }


  /* =======================================================
     31. READING PROGRESS
  ======================================================= */

  function updateReadingProgress(
    story
  ) {

    if (
      !story?.story_id
    ) {
      return;
    }


    const saved =
      Number(
        state.progress[
          story.story_id
        ]
      );


    const progress =
      Number.isFinite(
        saved
      )
        ? Math.max(
            0,
            Math.min(
              100,
              saved
            )
          )
        : 0;


    updateProgressBars(
      progress
    );

  }


  function updateProgressBars(
    percent
  ) {

    $$(
      "#readingProgress, [data-reading-progress]"
    )
      .forEach(
        (bar) => {

          if (
            bar.tagName ===
            "INPUT"
          ) {

            bar.value =
              percent;

          } else {

            bar.style.width =
              `${percent}%`;

          }

        }
      );


    $$(
      "[data-reading-progress-text]"
    )
      .forEach(
        (element) => {

          text(
            element,
            `${Math.round(
              percent
            )}%`
          );

        }
      );

  }


  function trackReadingProgress() {

    const story =
      state.currentStory;


    if (
      !story?.story_id
    ) {
      return;
    }


    const content =
      firstExisting(
        "#storyContent",
        "#storyText",
        ".story-content",
        ".story-text",
        "[data-story-content]"
      );


    if (!content) {
      return;
    }


    const rect =
      content.getBoundingClientRect();


    const top =
      window.scrollY +
      rect.top;


    const contentHeight =
      Math.max(
        1,
        content.scrollHeight
      );


    const viewport =
      window.innerHeight;


    const current =
      Math.max(
        0,
        window.scrollY -
        top +
        viewport * 0.25
      );


    const maximum =
      Math.max(
        1,
        contentHeight -
        viewport * 0.5
      );


    const percent =
      Math.round(
        Math.min(
          100,
          (
            current /
            maximum
          ) * 100
        )
      );


    state.progress[
      story.story_id
    ] =
      percent;


    saveProgress();

    updateProgressBars(
      percent
    );


    if (
      percent >= 95
    ) {

      markStoryCompleted(
        story.story_id
      );

    }

  }


  function markStoryCompleted(
    storyId
  ) {

    state.progress[
      storyId
    ] =
      100;

    saveProgress();

  }


  /* =======================================================
     32. READING CONTROLS
  ======================================================= */

  function renderReadingControls() {

    updatePreferenceControls();

    updateProgressBars(
      Number(
        state.progress[
          state.currentStory?.story_id
        ] || 0
      )
    );

  }


  function toggleFocusMode() {

    state.focusMode =
      !state.focusMode;


    document.body.classList.toggle(
      "storynest-focus-mode",
      state.focusMode
    );


    $$(
      "[data-focus-toggle], #focusMode"
    )
      .forEach(
        (button) => {

          button.setAttribute(
            "aria-pressed",
            String(
              state.focusMode
            )
          );


          const label =
            button.querySelector(
              "[data-focus-label]"
            );


          if (label) {

            text(
              label,
              state.focusMode
                ? "Exit focus"
                : "Focus mode"
            );

          }

        }
      );

  }


  /* =======================================================
     33. PREVIOUS / NEXT
  ======================================================= */

  function findStoryIndex(
    storyId
  ) {

    const list =
      mergeStories(
        state.stories,
        [
          ...state.featured,
          ...state.allKnownStories
        ]
      );


    return list.findIndex(
      (story) =>
        String(
          story.story_id
        ) ===
        String(
          storyId
        )
    );

  }


  function getNavigationStories() {

    return mergeStories(
      state.stories,
      [
        ...state.featured,
        ...state.allKnownStories
      ]
    );

  }


  function openPreviousStory() {

    const stories =
      getNavigationStories();


    const index =
      findStoryIndex(
        state.currentStory?.story_id
      );


    if (
      index <= 0
    ) {

      setConnectionStatus(
        "This is the first story.",
        "normal"
      );

      return;

    }


    openStory(
      stories[index - 1]
        .story_id
    );

  }


  function openNextStory() {

    const stories =
      getNavigationStories();


    const index =
      findStoryIndex(
        state.currentStory?.story_id
      );


    if (
      index < 0 ||
      index >=
      stories.length - 1
    ) {

      setConnectionStatus(
        "This is the last story.",
        "normal"
      );

      return;

    }


    openStory(
      stories[index + 1]
        .story_id
    );

  }


  /* =======================================================
     34. FILTERS
  ======================================================= */

  async function applyFilters() {

    const category =
      firstExisting(
        "#categoryFilter",
        "[data-category-filter]"
      );


    const genre =
      firstExisting(
        "#genreFilter",
        "[data-genre-filter]"
      );


    const age =
      firstExisting(
        "#ageFilter",
        "[data-age-filter]"
      );


    const readingLevel =
      firstExisting(
        "#readingLevelFilter",
        "[data-reading-level-filter]"
      );


    const readingTime =
      firstExisting(
        "#readingTimeFilter",
        "[data-reading-time-filter]"
      );


    const sort =
      firstExisting(
        "#sortStories",
        "[data-sort-stories]"
      );


    state.category =
      category?.value ||
      "";


    state.genre =
      genre?.value ||
      "";


    state.age =
      age?.value ||
      "";


    state.readingLevel =
      readingLevel?.value ||
      "";


    state.readingTime =
      readingTime?.value ||
      "";


    state.sort =
      sort?.value ||
      "recent";


    state.searchQuery =
      "";


    state.page =
      1;


    await loadStories();

  }


  async function resetFilters() {

    state.category =
      "";

    state.genre =
      "";

    state.age =
      "";

    state.readingLevel =
      "";

    state.readingTime =
      "";

    state.searchQuery =
      "";

    state.sort =
      "recent";

    state.page =
      1;


    $$(
      "#categoryFilter, [data-category-filter], " +
      "#genreFilter, [data-genre-filter], " +
      "#ageFilter, [data-age-filter], " +
      "#readingLevelFilter, [data-reading-level-filter], " +
      "#readingTimeFilter, [data-reading-time-filter]"
    )
      .forEach(
        (element) => {

          element.value =
            "";

        }
      );


    $$(
      "#sortStories, [data-sort-stories]"
    )
      .forEach(
        (element) => {

          element.value =
            "recent";

        }
      );


    $$(
      "#searchInput, [data-search-input]"
    )
      .forEach(
        (element) => {

          element.value =
            "";

        }
      );


    await loadStories();

  }


  /* =======================================================
     35. DYNAMIC STORY EVENTS
  ======================================================= */

  function bindDynamicStoryCards(
    root = document
  ) {

    $$(
      "[data-open-story]",
      root
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {

            return;

          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            (event) => {

              event.preventDefault();


              openStory(
                button.dataset.openStory
              );

            }
          );

        }
      );


    $$(
      "[data-save-story]",
      root
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {

            return;

          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            (event) => {

              event.preventDefault();

              event.stopPropagation();


              toggleFavorite(
                button.dataset.saveStory
              );

            }
          );

        }
      );

  }


  /* =======================================================
     36. EVENT BINDING
  ======================================================= */

  let globalEventsBound =
    false;


  function bindEvents() {

    bindDynamicStoryCards();


    /* Navigation */

    $$(
      "[data-close-story], #closeStory, .close-story"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            closeStory
          );

        }
      );


    $$(
      "[data-back-to-stories], #backToStories"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            closeStory
          );

        }
      );


    /* Search */

    const searchInputs =
      $$(
        "#searchInput, [data-search-input]"
      );


    searchInputs
      .forEach(
        (input) => {

          if (
            input.dataset.storynestBound
          ) {
            return;

          }


          input.dataset.storynestBound =
            "true";


          let timer;


          input.addEventListener(
            "input",
            () => {

              clearTimeout(
                timer
              );


              timer =
                setTimeout(
                  () =>
                    searchStories(
                      input.value
                    ),
                  350
                );

            }
          );


          input.addEventListener(
            "keydown",
            (event) => {

              if (
                event.key ===
                "Enter"
              ) {

                event.preventDefault();

                clearTimeout(
                  timer
                );


                searchStories(
                  input.value
                );

              }


              if (
                event.key ===
                "Escape"
              ) {

                input.value =
                  "";

                searchStories(
                  ""
                );

              }

            }
          );

        }
      );


    $$(
      "[data-search-submit]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () => {

              const input =
                firstExisting(
                  "#searchInput",
                  "[data-search-input]"
                );


              if (input) {

                searchStories(
                  input.value
                );

              }

            }
          );

        }
      );


    /* Filters */

    $$(
      "#categoryFilter, [data-category-filter], " +
      "#genreFilter, [data-genre-filter], " +
      "#ageFilter, [data-age-filter], " +
      "#readingLevelFilter, [data-reading-level-filter], " +
      "#readingTimeFilter, [data-reading-time-filter], " +
      "#sortStories, [data-sort-stories]"
    )
      .forEach(
        (element) => {

          if (
            element.dataset.storynestBound
          ) {
            return;
          }


          element.dataset.storynestBound =
            "true";


          element.addEventListener(
            "change",
            applyFilters
          );

        }
      );


    $$(
      "[data-reset-filters], #resetFilters"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            resetFilters
          );

        }
      );


    /* Refresh */

    $$(
      "#refreshButton, [data-refresh]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            async () => {

              await refreshApplication(
                true
              );

            }
          );

        }
      );


    /* Audio */

    $$(
      "[data-audio-toggle], #audioPlay, .audio-play"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            toggleAudio
          );

        }
      );


    $$(
      "[data-speech-toggle], #speechReadAloud"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            toggleSpeech
          );

        }
      );


    $$(
      "[data-audio-speed], #audioSpeed"
    )
      .forEach(
        (select) => {

          if (
            select.dataset.storynestBound
          ) {
            return;
          }


          select.dataset.storynestBound =
            "true";


          select.addEventListener(
            "change",
            () =>
              setAudioSpeed(
                select.value
              )
          );

        }
      );


    $$(
      "[data-audio-progress], #audioProgress"
    )
      .forEach(
        (element) => {

          if (
            element.tagName !==
            "INPUT"
          ) {
            return;
          }


          if (
            element.dataset.storynestBound
          ) {
            return;
          }


          element.dataset.storynestBound =
            "true";


          element.addEventListener(
            "input",
            () =>
              seekAudio(
                element.value
              )
          );

        }
      );


    $$(
      "[data-audio-back], #audioBack"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () =>
              seekAudioRelative(
                -15
              )
          );

        }
      );


    $$(
      "[data-audio-forward], #audioForward"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () =>
              seekAudioRelative(
                15
              )
          );

        }
      );


    $$(
      "[data-audio-volume], #audioVolume"
    )
      .forEach(
        (element) => {

          if (
            element.dataset.storynestBound
          ) {
            return;
          }


          element.dataset.storynestBound =
            "true";


          element.addEventListener(
            "input",
            () =>
              setAudioVolume(
                element.value
              )
          );

        }
      );


    /* Save */

    $$(
      "[data-favorite-story], #favoriteStory, .favorite-story"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () => {

              if (
                state.currentStory
              ) {

                toggleFavorite(
                  state.currentStory
                    .story_id
                );

              }

            }
          );

        }
      );


    /* Theme */

    $$(
      "[data-theme]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () =>
              setTheme(
                button.dataset.theme
              )
          );

        }
      );


    /* Text size */

    $$(
      "[data-text-size]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () =>
              setTextSize(
                button.dataset.textSize
              )
          );

        }
      );


    /* Line height */

    $$(
      "[data-line-height]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () =>
              setLineHeight(
                button.dataset.lineHeight
              )
          );

        }
      );


    /* Reading width */

    $$(
      "[data-reading-width]"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            () =>
              setReadingWidth(
                button.dataset.readingWidth
              )
          );

        }
      );


    /* Focus mode */

    $$(
      "[data-focus-toggle], #focusMode"
    )
      .forEach(
        (button) => {

          if (
            button.dataset.storynestBound
          ) {
            return;
          }


          button.dataset.storynestBound =
            "true";


          button.addEventListener(
            "click",
            toggleFocusMode
          );

        }
      );


    /* Previous / next */

    $$(
      "[data-previous-story], #previousStory"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            openPreviousStory
          );

        }
      );


    $$(
      "[data-next-story], #nextStory"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            openNextStory
          );

        }
      );


    /* Global events only once */

    if (
      globalEventsBound
    ) {
      return;
    }


    globalEventsBound =
      true;


    document.addEventListener(
      "keydown",
      handleKeyboard
    );


    window.addEventListener(
      "scroll",
      throttle(
        trackReadingProgress,
        250
      ),
      {
        passive:
          true
      }
    );


    window.addEventListener(
      "online",
      handleOnline
    );


    window.addEventListener(
      "offline",
      handleOffline
    );


    document.addEventListener(
      "visibilitychange",
      () => {

        if (
          document.visibilityState ===
          "visible"
        ) {

          refreshIfNeeded();

        }

      }
    );


    window.addEventListener(
      "beforeunload",
      persistCurrentState
    );


    setInterval(
      refreshIfNeeded,
      AUTO_REFRESH_MS
    );

  }


  /* =======================================================
     37. KEYBOARD ACCESSIBILITY
  ======================================================= */

  function handleKeyboard(
    event
  ) {

    if (
      event.key ===
      "Escape"
    ) {

      if (
        state.speech.active
      ) {

        stopSpeech();

        return;

      }


      if (
        state.focusMode
      ) {

        toggleFocusMode();

        return;

      }


      if (
        state.currentStory
      ) {

        closeStory();

      }

      return;

    }


    if (
      event.key ===
      "/" &&
      !isTypingTarget(
        event.target
      )
    ) {

      event.preventDefault();


      const input =
        firstExisting(
          "#searchInput",
          "[data-search-input]"
        );


      if (input) {

        input.focus();

      }

      return;

    }


    if (
      !state.currentStory ||
      isTypingTarget(
        event.target
      )
    ) {

      return;

    }


    if (
      event.key ===
      "ArrowLeft"
    ) {

      openPreviousStory();

    }


    if (
      event.key ===
      "ArrowRight"
    ) {

      openNextStory();

    }


    if (
      event.key ===
      " "
    ) {

      event.preventDefault();

      toggleAudio();

    }

  }


  function isTypingTarget(
    element
  ) {

    if (!element) {
      return false;
    }


    const tag =
      element.tagName;


    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      element.isContentEditable
    );

  }


  /* =======================================================
     38. ONLINE / OFFLINE
  ======================================================= */

  function handleOnline() {

    state.offline =
      false;


    setConnectionStatus(
      "Connection restored",
      "online"
    );


    refreshApplication(
      false
    );

  }


  function handleOffline() {

    state.offline =
      true;


    setConnectionStatus(
      "You are offline — cached stories remain available",
      "offline"
    );

  }


  /* =======================================================
     39. AUTOMATIC REFRESH
  ======================================================= */

  async function refreshIfNeeded() {

    if (
      !navigator.onLine ||
      state.loading
    ) {

      return;

    }


    if (
      Date.now() -
      state.lastRefresh <
      AUTO_REFRESH_MS
    ) {

      return;

    }


    await refreshApplication(
      false
    );

  }


  async function refreshApplication(
    manual
  ) {

    if (
      state.loading
    ) {
      return;
    }


    try {

      showLoading(
        manual
          ? "Refreshing StoryNest..."
          : "Checking for new stories..."
      );


      await Promise.all([
        loadStories(),
        loadFeatured(),
        loadCategories(),
        loadGenres()
      ]);


      state.lastRefresh =
        Date.now();


      cacheData();


      setConnectionStatus(
        "StoryNest is up to date",
        "online"
      );


    } catch (error) {

      console.warn(
        "Automatic refresh failed:",
        error
      );


      if (manual) {

        showError(
          "Refresh failed. Please try again."
        );

      }

    } finally {

      hideLoading();

    }

  }


  /* =======================================================
     40. STORY NAVIGATION
  ======================================================= */

  function showStoryPage() {

    const page =
      firstExisting(
        "#storyPage",
        ".story-page",
        "[data-story-page]"
      );


    if (page) {

      page.hidden =
        false;

    }


    $$(
      "[data-library], #library"
    )
      .forEach(
        (element) => {

          if (
            element !== page
          ) {

            element.dataset.storynestHidden =
              "story-open";

          }

        }
      );

  }


  function scrollToStory() {

    const page =
      firstExisting(
        "#storyPage",
        ".story-page",
        "[data-story-page]"
      );


    if (!page) {
      return;
    }


    const behavior =
      state.reducedMotion
        ? "auto"
        : "smooth";


    setTimeout(
      () => {

        page.scrollIntoView(
          {
            behavior,
            block:
              "start"
          }
        );

      },
      50
    );

  }


  function closeStory() {

    stopSpeech();


    /*
     * Deliberately do NOT destroy the
     * audio element or reset currentTime.
     *
     * This allows the floating player
     * to continue while navigating.
     */

    state.currentStory =
      null;


    const page =
      firstExisting(
        "#storyPage",
        ".story-page",
        "[data-story-page]"
      );


    if (page) {

      page.hidden =
        true;

    }


    $$(
      "[data-library], #library"
    )
      .forEach(
        (element) => {

          element.dataset.storynestHidden =
            "";

        }
      );


    renderRecommended();


    const behavior =
      state.reducedMotion
        ? "auto"
        : "smooth";


    window.scrollTo(
      {
        top:
          0,
        behavior
      }
    );

  }


  /* =======================================================
     41. GLOBAL STATE PERSISTENCE
  ======================================================= */

  function persistCurrentState() {

    savePreferences();

    saveFavorites();

    saveProgress();

    saveRecent();

    saveAudioProgress();

  }


  /* =======================================================
     42. GENERATED UI
  ======================================================= */

  function ensureGeneratedUI() {

    ensureMiniPlayer();

    ensureGeneratedStatus();

  }


  function ensureGeneratedStatus() {

    if (
      $("#storynestGeneratedStatus")
    ) {

      return;

    }


    const element =
      createElement(
        "div",
        {
          className:
            "storynest-generated-status",
          attrs: {
            id:
              "storynestGeneratedStatus",
            role:
              "status",
            "aria-live":
              "polite"
          }
        }
      );


    const textElement =
      createElement(
        "span",
        {
          attrs: {
            "data-generated-status-text":
              ""
          },
          text:
            "StoryNest"
        }
      );


    element.appendChild(
      textElement
    );


    document.body.appendChild(
      element
    );

  }


  /* =======================================================
     43. GENERATED READING TOOLBAR
  ======================================================= */

  function ensureReadingToolbar() {

    if (
      $("#storynestReadingToolbar")
    ) {

      return;

    }


    const storyPage =
      firstExisting(
        "#storyPage",
        ".story-page",
        "[data-story-page]"
      );


    if (!storyPage) {
      return;
    }


    const toolbar =
      createElement(
        "div",
        {
          className:
            "storynest-reading-toolbar",
          attrs: {
            id:
              "storynestReadingToolbar",
            role:
              "toolbar",
            "aria-label":
              "Reading controls"
          }
        }
      );


    const controls = [

      {
        label:
          "A−",
        title:
          "Smaller text",
        action:
          () =>
            setTextSize(
              "small"
            )
      },

      {
        label:
          "A",
        title:
          "Medium text",
        action:
          () =>
            setTextSize(
              "medium"
            )
      },

      {
        label:
          "A+",
        title:
          "Larger text",
        action:
          () =>
            setTextSize(
              "large"
            )
      },

      {
        label:
          "Focus",
        title:
          "Toggle focus mode",
        action:
          toggleFocusMode
      }

    ];


    controls.forEach(
      (item) => {

        const button =
          createElement(
            "button",
            {
              attrs: {
                type:
                  "button",
                title:
                  item.title
              },
              text:
                item.label
            }
          );


        button.addEventListener(
          "click",
          item.action
        );


        toolbar.appendChild(
          button
        );

      }
    );


    storyPage.prepend(
      toolbar
    );

  }


  /* =======================================================
     44. ENHANCEMENT STYLES
  ======================================================= */

  function injectEnhancementStyles() {

    if (
      $("#storynestEnhancementStyles")
    ) {

      return;

    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "storynestEnhancementStyles";


    style.textContent = `

      :root {
        --story-text-scale: 1;
        --story-line-height: 1.75;
        --story-reading-width: 820px;
      }

      .story-content,
      .story-text,
      [data-story-content] {
        font-size:
          calc(1rem * var(--story-text-scale));
        line-height:
          var(--story-line-height);
        max-width:
          var(--story-reading-width);
        margin-left:
          auto;
        margin-right:
          auto;
      }

      .story-content p,
      .story-text p,
      [data-story-content] p {
        margin-top:
          0;
        margin-bottom:
          1.2em;
      }

      .storynest-focus-mode
      .storynest-reading-toolbar,
      .storynest-focus-mode
      header,
      .storynest-focus-mode
      nav,
      .storynest-focus-mode
      footer {
        opacity:
          .25;
        transition:
          opacity .2s ease;
      }

      .storynest-focus-mode
      .story-page {
        max-width:
          1000px;
        margin:
          0 auto;
      }

      .storynest-mini-player {
        position:
          fixed;
        left:
          16px;
        right:
          16px;
        bottom:
          16px;
        z-index:
          9999;
        display:
          flex;
        align-items:
          center;
        gap:
          10px;
        padding:
          10px 14px;
        border-radius:
          14px;
        background:
          var(--storynest-player-bg, #111);
        color:
          var(--storynest-player-color, #fff);
        box-shadow:
          0 10px 40px rgba(0,0,0,.22);
      }

      .storynest-mini-player input[type="range"] {
        flex:
          1;
      }

      .storynest-mini-controls {
        display:
          flex;
        gap:
          6px;
      }

      .storynest-mini-controls button {
        min-width:
          42px;
        min-height:
          36px;
      }

      .storynest-generated-status {
        position:
          fixed;
        right:
          14px;
        bottom:
          14px;
        z-index:
          9998;
        pointer-events:
          none;
        font-size:
          12px;
        opacity:
          .75;
      }

      .storynest-api-error,
      .empty-state {
        padding:
          40px 20px;
        text-align:
          center;
      }

      .storynest-api-error button,
      .empty-state button {
        cursor:
          pointer;
      }

      .storynest-skeleton-card {
        min-height:
          280px;
        padding:
          12px;
      }

      .storynest-skeleton-cover {
        height:
          160px;
        border-radius:
          12px;
        background:
          linear-gradient(
            90deg,
            rgba(128,128,128,.08),
            rgba(128,128,128,.18),
            rgba(128,128,128,.08)
          );
        background-size:
          200% 100%;
        animation:
          storynestSkeleton 1.3s infinite;
      }

      .storynest-skeleton-line {
        height:
          14px;
        margin-top:
          12px;
        border-radius:
          8px;
        background:
          rgba(128,128,128,.12);
      }

      .storynest-skeleton-line.short {
        width:
          60%;
      }

      .story-card-progress {
        height:
          4px;
        margin-top:
          8px;
        overflow:
          hidden;
        border-radius:
          10px;
        background:
          rgba(128,128,128,.15);
      }

      .story-card-progress span {
        display:
          block;
        height:
          100%;
      }

      .storynest-focus-mode
      .story-card,
      .storynest-focus-mode
      .story-grid {
        display:
          none;
      }

      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline:
          3px solid currentColor;
        outline-offset:
          3px;
      }

      @keyframes storynestSkeleton {
        from {
          background-position:
            200% 0;
        }
        to {
          background-position:
            -200% 0;
        }
      }

      @media
      (prefers-reduced-motion: reduce) {

        *,
        *::before,
        *::after {
          scroll-behavior:
            auto !important;
          animation-duration:
            .01ms !important;
          animation-iteration-count:
            1 !important;
          transition-duration:
            .01ms !important;
        }

      }

      @media (max-width: 700px) {

        .storynest-mini-player {
          left:
            8px;
          right:
            8px;
          bottom:
            8px;
          flex-wrap:
            wrap;
        }

        .storynest-mini-title {
          width:
            100%;
          white-space:
            nowrap;
          overflow:
            hidden;
          text-overflow:
            ellipsis;
        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


  /* =======================================================
     45. RENDER ALL
  ======================================================= */

  function renderAll() {

    renderCategories();

    renderGenres();

    renderFeatured();

    renderStoryLibrary();

    renderRecentlyAdded();

    renderRecentlyRead();

    renderRecommended();

    renderAudio(
      state.currentStory ||
      {}
    );


    if (
      state.currentStory
    ) {

      renderStoryPage(
        state.currentStory
      );

    }


    ensureReadingToolbar();

  }


  /* =======================================================
     46. UTILITY
  ======================================================= */

  function throttle(
    callback,
    delay
  ) {

    let lastCall =
      0;

    let timeout =
      null;


    return function (...args) {

      const now =
        Date.now();


      const remaining =
        delay -
        (
          now -
          lastCall
        );


      if (
        remaining <= 0
      ) {

        clearTimeout(
          timeout
        );


        timeout =
          null;


        lastCall =
          now;


        callback.apply(
          this,
          args
        );

      } else if (
        !timeout
      ) {

        timeout =
          setTimeout(
            () => {

              lastCall =
                Date.now();

              timeout =
                null;

              callback.apply(
                this,
                args
              );

            },
            remaining
          );

      }

    };

  }


  /* =======================================================
     47. PUBLIC API
  ======================================================= */

  window.StoryNest = {

    version:
      APP_VERSION,

    api,

    initialize,

    loadStories,

    loadFeatured,

    loadCategories,

    loadGenres,

    searchStories,

    openStory,

    closeStory,

    toggleFavorite,

    toggleAudio,

    toggleSpeech,

    stopSpeech,

    setAudioSpeed,

    setAudioVolume,

    seekAudio,

    seekAudioRelative,

    setTheme,

    setTextSize,

    setLineHeight,

    setReadingWidth,

    toggleFocusMode,

    openPreviousStory,

    openNextStory,

    resetFilters,

    refreshApplication,

    state

  };


  /* =======================================================
     48. START APPLICATION
  ======================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      ensureGeneratedUI();

      initialize();

    }
  );


})();
