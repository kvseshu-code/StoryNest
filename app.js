/* =========================================================
   STORYNEST FRONTEND
   app.js
   Version: 2.1.0

   GitHub Pages
        ↓
   StoryNest Apps Script API
        ↓
   Google Sheets

   Compatible with the current StoryNest Code.gs API.

   IMPORTANT FIXES:
   - Health check no longer blocks story loading
   - Multiple API response formats supported
   - renderAll() added
   - Stories load independently from optional endpoints
   - Featured/categories/genres cannot break the main library
   - More tolerant single-story response handling
   - Better API error reporting
   - Preserves search, filters, favorites, audio,
     reading progress, preferences and story rendering
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     1. CONFIGURATION
  ======================================================= */

  const API_URL =
    "https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec";

  const APP_NAME = "StoryNest";

  const STORAGE_KEY =
    "storynest_preferences_v2";

  const FAVORITES_KEY =
    "storynest_favorites_v2";

  const PROGRESS_KEY =
    "storynest_progress_v2";


  /* =======================================================
     2. APPLICATION STATE
  ======================================================= */

  const state = {
    stories: [],
    featured: [],
    categories: [],
    genres: [],

    currentStory: null,

    searchQuery: "",
    category: "",
    genre: "",
    age: "",

    page: 1,
    pageSize: 20,

    loading: false,
    initialized: false,

    preferences: {
      theme: "light",
      textSize: "medium",
      readingWidth: "comfortable",
      narrationSpeed: 1
    },

    favorites: [],
    progress: {}
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


  function text(element, value) {
    if (!element) return;

    element.textContent =
      value == null
        ? ""
        : String(value);
  }


  function html(element, value) {
    if (!element) return;

    element.innerHTML =
      value == null
        ? ""
        : String(value);
  }


  /* =======================================================
     4. SAFE HTML / URL
  ======================================================= */

  function escapeHTML(value) {
    return String(
      value == null ? "" : value
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function safeURL(value) {
    const url =
      String(value || "").trim();

    if (!url) {
      return "";
    }

    try {
      const parsed =
        new URL(
          url,
          window.location.href
        );

      if (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:"
      ) {
        return parsed.href;
      }

      return "";

    } catch {
      return "";
    }
  }


  /* =======================================================
     5. STORAGE
  ======================================================= */

  function loadStorage() {
    try {
      const preferences =
        JSON.parse(
          localStorage.getItem(
            STORAGE_KEY
          ) || "{}"
        );


      const favorites =
        JSON.parse(
          localStorage.getItem(
            FAVORITES_KEY
          ) || "[]"
        );


      const progress =
        JSON.parse(
          localStorage.getItem(
            PROGRESS_KEY
          ) || "{}"
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
          favorites;
      }


      if (
        progress &&
        typeof progress === "object"
      ) {
        state.progress =
          progress;
      }

    } catch (error) {
      console.warn(
        "StoryNest storage could not be loaded.",
        error
      );
    }


    applyPreferences();
  }


  function savePreferences() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          state.preferences
        )
      );
    } catch (error) {
      console.warn(error);
    }
  }


  function saveFavorites() {
    try {
      localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(
          state.favorites
        )
      );
    } catch (error) {
      console.warn(error);
    }
  }


  function saveProgress() {
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify(
          state.progress
        )
      );
    } catch (error) {
      console.warn(error);
    }
  }


  /* =======================================================
     6. PREFERENCES
  ======================================================= */

  function applyPreferences() {
    const root =
      document.documentElement;

    const body =
      document.body;

    const theme =
      state.preferences.theme ||
      "light";


    root.dataset.theme =
      theme;


    if (body) {
      body.dataset.theme =
        theme;
    }


    root.style.setProperty(
      "--story-text-scale",
      getTextScale()
    );


    root.dataset.readingWidth =
      state.preferences.readingWidth ||
      "comfortable";


    root.dataset.textSize =
      state.preferences.textSize ||
      "medium";


    updatePreferenceControls();
  }


  function getTextScale() {
    switch (
      state.preferences.textSize
    ) {
      case "small":
        return "0.92";

      case "large":
        return "1.12";

      case "xlarge":
        return "1.25";

      default:
        return "1";
    }
  }


  function updatePreferenceControls() {
    $$("[data-theme]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.theme ===
            state.preferences.theme
        );
      });


    $$("[data-text-size]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.textSize ===
            state.preferences.textSize
        );
      });


    $$("[data-reading-width]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.readingWidth ===
            state.preferences.readingWidth
        );
      });
  }


  /* =======================================================
     7. API
  ======================================================= */

  async function api(
    action,
    params = {}
  ) {
    const query =
      new URLSearchParams();


    query.set(
      "action",
      action
    );


    Object.keys(params)
      .forEach((key) => {
        const value =
          params[key];

        if (
          value !== undefined &&
          value !== null &&
          String(value) !== ""
        ) {
          query.set(
            key,
            value
          );
        }
      });


    const url =
      `${API_URL}?${query.toString()}`;


    console.debug(
      "[StoryNest API]",
      url
    );


    let response;


    try {
      response =
        await fetch(
          url,
          {
            method: "GET",
            cache: "no-store",
            redirect: "follow"
          }
        );
    } catch (error) {
      throw new Error(
        `Unable to reach StoryNest API: ${
          error?.message ||
          "Network error"
        }`
      );
    }


    if (!response.ok) {
      throw new Error(
        `API request failed: HTTP ${
          response.status
        }`
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
      try {
        data =
          await response.json();
      } catch {
        throw new Error(
          "StoryNest API returned invalid JSON."
        );
      }

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


    console.debug(
      `[StoryNest API:${action}]`,
      data
    );


    if (
      !data
    ) {
      throw new Error(
        "StoryNest API returned an empty response."
      );
    }


    if (
      data.success === false
    ) {
      throw new Error(
        data.error ||
        data.message ||
        "StoryNest API returned an error."
      );
    }


    return data;
  }


  /* =======================================================
     8. RESPONSE HELPERS
  ======================================================= */

  function extractArray(
    response,
    keys = []
  ) {
    if (Array.isArray(response)) {
      return response;
    }


    if (
      response &&
      Array.isArray(response.data)
    ) {
      return response.data;
    }


    for (const key of keys) {
      if (
        response &&
        Array.isArray(
          response[key]
        )
      ) {
        return response[key];
      }
    }


    if (
      response &&
      response.data &&
      typeof response.data ===
        "object"
    ) {
      for (const key of keys) {
        if (
          Array.isArray(
            response.data[key]
          )
        ) {
          return response.data[key];
        }
      }
    }


    return [];
  }


  function extractStory(
    response
  ) {
    if (!response) {
      return null;
    }


    if (
      response.story &&
      typeof response.story ===
        "object"
    ) {
      return response.story;
    }


    if (
      response.data &&
      typeof response.data ===
        "object" &&
      !Array.isArray(response.data)
    ) {
      if (
        response.data.story &&
        typeof response.data.story ===
          "object"
      ) {
        return response.data.story;
      }

      return response.data;
    }


    if (
      response.result &&
      typeof response.result ===
        "object"
    ) {
      return response.result;
    }


    return null;
  }


  /* =======================================================
     9. API NORMALIZATION
  ======================================================= */

  function normalizeStory(raw) {
    if (!raw) {
      return null;
    }


    /*
     * Handle nested data wrappers.
     */

    if (
      raw.data &&
      typeof raw.data ===
        "object" &&
      !Array.isArray(raw.data)
    ) {
      raw =
        raw.data;
    }


    let meta = raw;

    let content = {};

    let characters = [];

    let audio = {};

    let media = {};

    let rights = {};


    /*
     * Handle:
     *
     * {
     *   story: {...}
     * }
     */

    if (
      raw.story &&
      typeof raw.story ===
        "object" &&
      !Array.isArray(raw.story)
    ) {
      const wrapper =
        raw;


      /*
       * Handle:
       *
       * {
       *   story: {
       *     story: {...},
       *     content: {...},
       *     characters: [...]
       *   }
       * }
       */

      if (
        wrapper.story.story &&
        typeof wrapper.story.story ===
          "object"
      ) {
        meta =
          wrapper.story.story;


        content =
          wrapper.story.content ||
          {};


        characters =
          wrapper.story.characters ||
          [];


        audio =
          wrapper.story.audio ||
          {};


        media =
          wrapper.story.media ||
          {};


        rights =
          wrapper.story.rights ||
          {};

      } else {
        meta =
          wrapper.story;
      }
    }


    /*
     * CONTENT sheet
     */

    const storyText =
      content.story_text ||
      content.story ||
      meta.story_text ||
      meta.story ||
      meta.content ||
      "";


    const description =
      content.introduction ||
      content.description ||
      meta.description ||
      "";


    return {
      story_id:
        meta.story_id ||
        meta.id ||
        "",


      slug:
        meta.slug ||
        "",


      title:
        meta.title ||
        "",


      subtitle:
        meta.subtitle ||
        "",


      description:
        description,


      category:
        meta.category ||
        meta.category_id ||
        "",


      genre:
        meta.genre ||
        meta.genre_id ||
        "",


      age_min:
        meta.age_min ??
        "",


      age_max:
        meta.age_max ??
        "",


      reading_level:
        meta.reading_level ||
        "",


      reading_time:
        meta.reading_time ||
        "",


      language:
        meta.language ||
        "English",


      author_name:
        meta.author_name ||
        "StoryNest Originals",


      story:
        storyText,


      lesson:
        content.lesson ||
        meta.lesson ||
        "",


      reflection:
        content.reflection ||
        meta.reflection ||
        "",


      discussion:
        content.discussion ||
        meta.discussion ||
        "",


      activity:
        content.creative_activity ||
        content.activity ||
        meta.activity ||
        "",


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
          meta.status ||
          ""
        ).toUpperCase(),


      audio_available:
        normalizeBoolean(
          audio.available ??
          meta.audio_available
        ),


      audio_url:
        safeURL(
          audio.url ||
          meta.audio_url ||
          ""
        ),


      cover_image:
        safeURL(
          media.cover_image ||
          meta.cover_image ||
          ""
        ),


      tags:
        normalizeTags(
          meta.tags
        ),


      rights_type:
        rights.type ||
        meta.rights_type ||
        "",


      rights_status:
        rights.status ||
        meta.rights_status ||
        "",


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
        .map((item) =>
          String(item).trim()
        )
        .filter(Boolean);
    }


    return String(value)
      .split(",")
      .map((item) =>
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
        .map((name) => ({
          name: name.trim()
        }))
        .filter(
          (item) => item.name
        );
    }
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
    ]
      .filter(Boolean);


    elements.forEach(
      (element) => {
        text(
          element,
          message
        );

        element.dataset.status =
          type;
      }
    );
  }


  function showLoading(
    message =
      "Loading stories..."
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


  function showError(
    message
  ) {
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
     11. INITIALIZATION
  ======================================================= */

  async function initialize() {
    loadStorage();

    bindEvents();

    showLoading(
      "Connecting to StoryNest..."
    );


    try {
      /*
       * HEALTH IS OPTIONAL.
       *
       * A health-check failure must NEVER
       * prevent stories from loading.
       */

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

      } catch (healthError) {
        console.warn(
          "Health check failed. Continuing:",
          healthError
        );
      }


      /*
       * STORIES ARE THE PRIMARY LOAD.
       */

      await loadStories();


      /*
       * Optional endpoints.
       * Their failure cannot break the
       * main story library.
       */

      await Promise.allSettled([
        loadFeatured(),
        loadCategories(),
        loadGenres()
      ]);


      state.initialized =
        true;


      renderAll();


    } catch (error) {
      console.error(
        "StoryNest initialization failed:",
        error
      );


      showError(
        error?.message ||
        "Unable to connect to StoryNest."
      );


      renderEmptyState(
        "Stories could not be loaded.",
        error?.message ||
        "Please refresh and try again."
      );

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     12. LOAD STORIES
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
              state.age
          }
        );


      console.debug(
        "[StoryNest] stories response:",
        response
      );


      const records =
        extractArray(
          response,
          [
            "stories",
            "results",
            "items"
          ]
        );


      state.stories =
        records
          .map(normalizeStory)
          .filter(Boolean);


      console.info(
        `[StoryNest] Loaded ${
          state.stories.length
        } stories`
      );


      const total =
        response?.pagination?.total ??
        response?.total ??
        state.stories.length;


      updateStoryCount(
        total
      );


      renderStoryLibrary();


      if (
        state.stories.length
      ) {
        setConnectionStatus(
          `${state.stories.length} ${
            state.stories.length === 1
              ? "story"
              : "stories"
          } available`,
          "online"
        );

      } else {
        setConnectionStatus(
          "StoryNest connected, but no stories were returned.",
          "normal"
        );
      }


      return state.stories;

    } catch (error) {
      console.error(
        "[StoryNest] loadStories failed:",
        error
      );


      state.stories = [];


      showError(
        `Stories could not be loaded: ${
          error?.message ||
          "Unknown API error"
        }`
      );


      renderEmptyState(
        "Stories could not be loaded.",
        error?.message ||
        "Please refresh and try again."
      );


      throw error;

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     13. LOAD FEATURED
  ======================================================= */

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


      const records =
        extractArray(
          response,
          [
            "featured",
            "stories",
            "results",
            "items"
          ]
        );


      state.featured =
        records
          .map(normalizeStory)
          .filter(Boolean);


      renderFeatured();

    } catch (error) {
      console.warn(
        "Featured stories unavailable:",
        error
      );


      state.featured = [];
    }
  }


  /* =======================================================
     14. LOAD CATEGORIES
  ======================================================= */

  async function loadCategories() {
    try {
      const response =
        await api(
          "categories"
        );


      state.categories =
        extractArray(
          response,
          [
            "categories",
            "results",
            "items"
          ]
        );


      renderCategories();

    } catch (error) {
      console.warn(
        "Categories unavailable:",
        error
      );
    }
  }


  /* =======================================================
     15. LOAD GENRES
  ======================================================= */

  async function loadGenres() {
    try {
      const response =
        await api(
          "genres"
        );


      state.genres =
        extractArray(
          response,
          [
            "genres",
            "results",
            "items"
          ]
        );


      renderGenres();

    } catch (error) {
      console.warn(
        "Genres unavailable:",
        error
      );
    }
  }


  /* =======================================================
     16. SEARCH
  ======================================================= */

  async function searchStories(
    query
  ) {
    const value =
      String(query || "")
        .trim();


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


      const records =
        extractArray(
          response,
          [
            "stories",
            "results",
            "items"
          ]
        );


      state.stories =
        records
          .map(normalizeStory)
          .filter(Boolean);


      updateStoryCount(
        response?.total ??
        response?.pagination?.total ??
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
      showError(
        `Search failed: ${
          error?.message ||
          "Search could not be completed."
        }`
      );

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     17. OPEN SINGLE STORY
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
            id: identifier
          }
        );


      console.debug(
        "[StoryNest] Single story response:",
        response
      );


      const rawStory =
        extractStory(
          response
        );


      if (!rawStory) {
        throw new Error(
          "Story was not returned by the API."
        );
      }


      const story =
        normalizeStory(
          rawStory
        );


      if (
        !story ||
        !story.title
      ) {
        throw new Error(
          "Story data could not be normalized."
        );
      }


      state.currentStory =
        story;


      renderStoryPage(
        story
      );


      updateReadingProgress(
        story
      );


      setConnectionStatus(
        "Story loaded",
        "online"
      );


      scrollToStory();


    } catch (error) {
      console.error(
        "[StoryNest] Story loading failed:",
        error
      );


      showError(
        error?.message ||
        "Unable to load this story."
      );


      renderStoryLoadError();

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     18. RENDER ALL
  ======================================================= */

  function renderAll() {
    renderStoryLibrary();

    renderFeatured();

    renderCategories();

    renderGenres();

    updateStoryCount(
      state.stories.length
    );


    if (
      state.currentStory
    ) {
      renderStoryPage(
        state.currentStory
      );
    }
  }


  /* =======================================================
     19. STORY PAGE
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


    if (metadata) {
      html(
        metadata,
        [
          story.category,

          story.age_min !== "" &&
          story.age_max !== ""
            ? `Ages ${escapeHTML(
                story.age_min
              )}–${escapeHTML(
                story.age_max
              )}`
            : "",

          story.reading_time
            ? `${escapeHTML(
                story.reading_time
              )} min read`
            : "",

          story.language
        ]
          .filter(Boolean)
          .map(
            (item) =>
              `<span>${escapeHTML(
                item
              )}</span>`
          )
          .join("")
      );
    }


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


    renderAudio(
      story
    );


    renderFavoriteButton(
      story
    );
  }


  /* =======================================================
     20. COVER
  ======================================================= */

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

      image.hidden =
        false;

    } else {
      image.removeAttribute(
        "src"
      );

      image.alt = "";

      image.hidden =
        true;
    }
  }


  /* =======================================================
     21. STORY CONTENT
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
      console.warn(
        "Story content container not found."
      );

      return;
    }


    const storyText =
      String(
        story.story || ""
      ).trim();


    if (!storyText) {
      html(
        container,
        `
          <div class="story-empty">
            <strong>
              This story is being prepared.
            </strong>

            <p>
              The story content has not been published yet.
            </p>
          </div>
        `
      );

      return;
    }


    /*
     * Preserve paragraphs while escaping
     * backend HTML.
     */

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


    html(
      container,
      paragraphs
        .map(
          (paragraph) =>
            `<p>${escapeHTML(
              paragraph
            )}</p>`
        )
        .join("")
    );
  }


  /* =======================================================
     22. CHARACTERS
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


    html(
      container,
      story.characters
        .map(
          (character) => {
            const name =
              character?.name ||
              "Character";


            const role =
              character?.role ||
              "";


            return `
              <article class="character-card">

                <h3>
                  ${escapeHTML(
                    name
                  )}
                </h3>

                ${
                  role
                    ? `
                      <p>
                        ${escapeHTML(
                          role
                        )}
                      </p>
                    `
                    : ""
                }

              </article>
            `;
          }
        )
        .join("")
    );
  }


  /* =======================================================
     23. OPTIONAL STORY CONTENT
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


    if (!textValue) {
      element.hidden =
        true;

      return;
    }


    element.hidden =
      false;


    html(
      element,
      `<p>${escapeHTML(
        textValue
      )}</p>`
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


  /* =======================================================
     24. AUDIO
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


    audioElement.addEventListener(
      "timeupdate",
      updateAudioProgress
    );


    audioElement.addEventListener(
      "loadedmetadata",
      updateAudioDuration
    );


    audioElement.addEventListener(
      "ended",
      () => {
        updateAudioButtons(
          false
        );
      }
    );


    audioElement.addEventListener(
      "error",
      () => {
        console.warn(
          "Audio could not be loaded."
        );


        updateAudioButtons(
          false
        );


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
      story.audio_available &&
      !!story.audio_url;


    if (player) {
      player.hidden =
        !available;
    }


    if (!available) {
      updateAudioButtons(
        false
      );

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


    updateAudioButtons(
      !audio.paused
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


    try {
      if (
        audio.paused
      ) {
        await audio.play();

        updateAudioButtons(
          true
        );

      } else {
        audio.pause();

        updateAudioButtons(
          false
        );
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
    )
      .forEach(
        (button) => {
          button.setAttribute(
            "aria-label",
            isPlaying
              ? "Pause narration"
              : "Play narration"
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
          }
        }
      );
  }


  function updateAudioProgress() {
    const audio =
      getAudioElement();


    if (
      !audio.duration
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
    )
      .forEach(
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
    )
      .forEach(
        (element) => {
          text(
            element,
            formatTime(
              audio.currentTime
            )
          );
        }
      );
  }


  function updateAudioDuration() {
    const audio =
      getAudioElement();


    $$(
      "[data-audio-duration], #audioDuration"
    )
      .forEach(
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
      !Number.isFinite(
        value
      )
    ) {
      return;
    }


    state.preferences
      .narrationSpeed =
      value;


    savePreferences();


    const audio =
      getAudioElement();


    audio.playbackRate =
      value;
  }


  function seekAudio(
    percent
  ) {
    const audio =
      getAudioElement();


    if (
      !audio.duration
    ) {
      return;
    }


    audio.currentTime =
      audio.duration *
      (
        Number(percent) /
        100
      );
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


    const minutes =
      Math.floor(
        seconds / 60
      );


    const remaining =
      Math.floor(
        seconds % 60
      );


    return `${minutes}:${String(
      remaining
    ).padStart(2, "0")}`;
  }


  /* =======================================================
     25. FAVORITES
  ======================================================= */

  function isFavorite(
    storyId
  ) {
    return state.favorites
      .includes(
        storyId
      );
  }


  function toggleFavorite(
    storyId
  ) {
    if (!storyId) {
      return;
    }


    if (
      isFavorite(
        storyId
      )
    ) {
      state.favorites =
        state.favorites.filter(
          (id) =>
            id !== storyId
        );

    } else {
      state.favorites.push(
        storyId
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
  }


  function renderFavoriteButton(
    story
  ) {
    $$(
      "[data-favorite-story], #favoriteStory, .favorite-story"
    )
      .forEach(
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
     26. STORY CARD
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
      story.audio_available &&
      story.audio_url
        ? `<span>Audio</span>`
        : "";


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
        >

          <div class="story-card-cover">
            ${cover}
          </div>


          <div class="story-card-content">

            <div class="story-card-meta">

              ${
                story.category
                  ? `
                    <span>
                      ${escapeHTML(
                        story.category
                      )}
                    </span>
                  `
                  : ""
              }


              ${
                age
                  ? `<span>${age}</span>`
                  : ""
              }


              ${audio}

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

              ${
                story.reading_time
                  ? `
                    <span>
                      ${escapeHTML(
                        story.reading_time
                      )}
                      min read
                    </span>
                  `
                  : ""
              }


              <span>
                Read →
              </span>

            </div>

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
        >
          ${
            favorite
              ? "★"
              : "☆"
          }
        </button>

      </article>
    `;
  }


  /* =======================================================
     27. STORY LIBRARY
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
      console.warn(
        "Story library container not found."
      );

      return;
    }


    if (
      !state.stories.length
    ) {
      renderEmptyState(
        "No stories found.",
        "Try another search or filter."
      );

      return;
    }


    html(
      container,
      state.stories
        .map(storyCard)
        .join("")
    );


    bindDynamicStoryCards(
      container
    );
  }


  /* =======================================================
     28. FEATURED
  ======================================================= */

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


    html(
      container,
      state.featured
        .map(storyCard)
        .join("")
    );


    bindDynamicStoryCards(
      container
    );
  }


  /* =======================================================
     29. CATEGORIES
  ======================================================= */

  function renderCategories() {
    const selects =
      $$(
        "#categoryFilter, [data-category-filter]"
      );


    selects.forEach(
      (select) => {
        const current =
          select.value;


        html(
          select,
          `
            <option value="">
              All categories
            </option>
          ` +
          state.categories
            .map(
              (item) => {
                const name =
                  typeof item ===
                  "string"
                    ? item
                    : item?.name ||
                      item?.title ||
                      item?.category ||
                      "";


                if (!name) {
                  return "";
                }


                return `
                  <option
                    value="${escapeHTML(
                      name
                    )}"
                  >
                    ${escapeHTML(
                      name
                    )}
                  </option>
                `;
              }
            )
            .join("")
        );


        select.value =
          current ||
          state.category;
      }
    );
  }


  /* =======================================================
     30. GENRES
  ======================================================= */

  function renderGenres() {
    const selects =
      $$(
        "#genreFilter, [data-genre-filter]"
      );


    selects.forEach(
      (select) => {
        const current =
          select.value;


        html(
          select,
          `
            <option value="">
              All genres
            </option>
          ` +
          state.genres
            .map(
              (item) => {
                const name =
                  typeof item ===
                  "string"
                    ? item
                    : item?.name ||
                      item?.title ||
                      item?.genre ||
                      "";


                if (!name) {
                  return "";
                }


                return `
                  <option
                    value="${escapeHTML(
                      name
                    )}"
                  >
                    ${escapeHTML(
                      name
                    )}
                  </option>
                `;
              }
            )
            .join("")
        );


        select.value =
          current ||
          state.genre;
      }
    );
  }


  /* =======================================================
     31. STORY COUNT
  ======================================================= */

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
  }


  /* =======================================================
     32. EMPTY STATE
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


    html(
      container,
      `
        <div class="empty-state">

          <h3>
            ${escapeHTML(
              title
            )}
          </h3>

          <p>
            ${escapeHTML(
              description
            )}
          </p>

          <button
            type="button"
            data-reset-filters
          >
            Reset filters
          </button>

        </div>
      `
    );


    bindResetButtons();
  }


  function bindResetButtons() {
    $$(
      "[data-reset-filters], #resetFilters"
    )
      .forEach(
        (button) => {
          button.onclick =
            resetFilters;
        }
      );
  }


  /* =======================================================
     33. STORY LOAD ERROR
  ======================================================= */

  function renderStoryLoadError() {
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


    html(
      container,
      `
        <div class="story-empty">

          <strong>
            We couldn't open this story.
          </strong>

          <p>
            Please return to the story library
            and try again.
          </p>

        </div>
      `
    );
  }


  /* =======================================================
     34. NAVIGATION
  ======================================================= */

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


    setTimeout(
      () => {
        page.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      },
      50
    );
  }


  function closeStory() {
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


    const audio =
      getAudioElement();


    try {
      audio.pause();

      audio.currentTime =
        0;

    } catch {}


    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }


  /* =======================================================
     35. READING PROGRESS
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
      state.progress[
        story.story_id
      ];


    if (
      saved == null
    ) {
      return;
    }


    const progress =
      Math.max(
        0,
        Math.min(
          100,
          Number(saved)
        )
      );


    const bar =
      firstExisting(
        "#readingProgress",
        "[data-reading-progress]"
      );


    if (bar) {
      bar.style.width =
        `${progress}%`;
    }
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


    const height =
      content.scrollHeight;


    const viewport =
      window.innerHeight;


    const contentTop =
      window.scrollY +
      rect.top;


    const current =
      Math.max(
        0,
        window.scrollY -
        contentTop +
        100
      );


    const maximum =
      Math.max(
        1,
        height -
        viewport
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
  }


  /* =======================================================
     36. FILTERS
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


    state.category =
      category?.value || "";


    state.genre =
      genre?.value || "";


    state.age =
      age?.value || "";


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

    state.searchQuery =
      "";

    state.page =
      1;


    $$(
      "#categoryFilter, [data-category-filter]"
    )
      .forEach(
        (element) => {
          element.value =
            "";
        }
      );


    $$(
      "#genreFilter, [data-genre-filter]"
    )
      .forEach(
        (element) => {
          element.value =
            "";
        }
      );


    $$(
      "#ageFilter, [data-age-filter]"
    )
      .forEach(
        (element) => {
          element.value =
            "";
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
     37. DYNAMIC STORY CARDS
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
          button.onclick =
            () => {
              openStory(
                button.dataset
                  .openStory
              );
            };
        }
      );


    $$(
      "[data-save-story]",
      root
    )
      .forEach(
        (button) => {
          button.onclick =
            (event) => {
              event.stopPropagation();


              toggleFavorite(
                button.dataset
                  .saveStory
              );
            };
        }
      );
  }


  /* =======================================================
     38. EVENTS
  ======================================================= */

  function bindEvents() {

    /*
     * Navigation
     */

    $$(
      "[data-open-story]"
    )
      .forEach(
        (button) => {
          button.onclick =
            () => {
              openStory(
                button.dataset
                  .openStory
              );
            };
        }
      );


    $$(
      "[data-close-story], #closeStory, .close-story"
    )
      .forEach(
        (button) => {
          button.onclick =
            closeStory;
        }
      );


    /*
     * Search
     */

    const searchInputs =
      $$(
        "#searchInput, [data-search-input]"
      );


    searchInputs.forEach(
      (input) => {
        if (
          input.dataset.bound
        ) {
          return;
        }


        input.dataset.bound =
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


    /*
     * Search submit
     */

    $$(
      "[data-search-submit]"
    )
      .forEach(
        (button) => {
          button.onclick =
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
            };
        }
      );


    /*
     * Filters
     */

    $$(
      "#categoryFilter, [data-category-filter], " +
      "#genreFilter, [data-genre-filter], " +
      "#ageFilter, [data-age-filter]"
    )
      .forEach(
        (element) => {
          if (
            element.dataset
              .filterBound
          ) {
            return;
          }


          element.dataset
            .filterBound =
            "true";


          element.addEventListener(
            "change",
            applyFilters
          );
        }
      );


    bindResetButtons();


    /*
     * Refresh
     */

    $$(
      "#refreshButton, [data-refresh]"
    )
      .forEach(
        (button) => {
          button.onclick =
            async () => {
              await initialize();
            };
        }
      );


    /*
     * Audio
     */

    $$(
      "[data-audio-toggle], #audioPlay, .audio-play"
    )
      .forEach(
        (button) => {
          button.onclick =
            toggleAudio;
        }
      );


    $$(
      "[data-audio-speed], #audioSpeed"
    )
      .forEach(
        (select) => {
          if (
            select.dataset
              .audioBound
          ) {
            return;
          }


          select.dataset
            .audioBound =
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
            element.tagName ===
            "INPUT"
          ) {
            element.addEventListener(
              "input",
              () =>
                seekAudio(
                  element.value
                )
            );
          }
        }
      );


    /*
     * Favorite button
     */

    $$(
      "[data-favorite-story], #favoriteStory, .favorite-story"
    )
      .forEach(
        (button) => {
          button.onclick =
            () => {
              if (
                state.currentStory
              ) {
                toggleFavorite(
                  state.currentStory
                    .story_id
                );
              }
            };
        }
      );


    /*
     * Theme
     */

    $$(
      "[data-theme]"
    )
      .forEach(
        (button) => {
          if (
            button.dataset
              .themeBound
          ) {
            return;
          }


          button.dataset
            .themeBound =
            "true";


          button.addEventListener(
            "click",
            () => {
              const theme =
                button.dataset
                  .theme;


              if (!theme) {
                return;
              }


              state.preferences
                .theme =
                theme;


              savePreferences();

              applyPreferences();
            }
          );
        }
      );


    /*
     * Text size
     */

    $$(
      "[data-text-size]"
    )
      .forEach(
        (button) => {
          if (
            button.dataset
              .textBound
          ) {
            return;
          }


          button.dataset
            .textBound =
            "true";


          button.addEventListener(
            "click",
            () => {
              const value =
                button.dataset
                  .textSize;


              if (!value) {
                return;
              }


              state.preferences
                .textSize =
                value;


              savePreferences();

              applyPreferences();
            }
          );
        }
      );


    /*
     * Reading width
     */

    $$(
      "[data-reading-width]"
    )
      .forEach(
        (button) => {
          if (
            button.dataset
              .widthBound
          ) {
            return;
          }


          button.dataset
            .widthBound =
            "true";


          button.addEventListener(
            "click",
            () => {
              const value =
                button.dataset
                  .readingWidth;


              if (!value) {
                return;
              }


              state.preferences
                .readingWidth =
                value;


              savePreferences();

              applyPreferences();
            }
          );
        }
      );


    /*
     * Back to stories
     */

    $$(
      "[data-back-to-stories], #backToStories"
    )
      .forEach(
        (button) => {
          button.onclick =
            closeStory;
        }
      );


    /*
     * Keyboard shortcuts
     */

    if (
      !document.body.dataset
        .storyNestKeyboardBound
    ) {
      document.body.dataset
        .storyNestKeyboardBound =
        "true";


      document.addEventListener(
        "keydown",
        (event) => {

          if (
            event.key ===
              "Escape" &&
            state.currentStory
          ) {
            closeStory();
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
          }
        }
      );
    }


    /*
     * Reading progress
     */

    if (
      !window.__storyNestScrollBound
    ) {
      window.__storyNestScrollBound =
        true;


      window.addEventListener(
        "scroll",
        throttle(
          trackReadingProgress,
          250
        ),
        {
          passive: true
        }
      );
    }


    /*
     * Online/offline
     */

    if (
      !window.__storyNestNetworkBound
    ) {
      window.__storyNestNetworkBound =
        true;


      window.addEventListener(
        "online",
        () => {
          setConnectionStatus(
            "Connection restored",
            "online"
          );
        }
      );


      window.addEventListener(
        "offline",
        () => {
          setConnectionStatus(
            "You are offline",
            "offline"
          );
        }
      );
    }
  }


  /* =======================================================
     39. UTILITIES
  ======================================================= */

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
     40. GLOBAL STORYNEST API
  ======================================================= */

  window.StoryNest = {
    api,

    loadStories,

    loadFeatured,

    loadCategories,

    loadGenres,

    searchStories,

    openStory,

    closeStory,

    toggleFavorite,

    toggleAudio,

    setAudioSpeed,

    renderAll,

    normalizeStory,

    state
  };


  /* =======================================================
     41. START APPLICATION
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );

  } else {
    initialize();
  }

})();
