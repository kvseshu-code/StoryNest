/* =========================================================
   STORYNEST FRONTEND
   app.js
   Version: 2.1.0

   GitHub Pages
        ↓
   StoryNest Apps Script API
        ↓
   Google Sheets

   IMPORTANT:
   This version preserves the existing StoryNest features
   while making API/story loading more tolerant.
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
     2. DOM HELPERS
  ======================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));


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
      value == null ? "" : String(value);
  }


  function html(element, value) {
    if (!element) return;

    element.innerHTML =
      value == null ? "" : String(value);
  }


  /* =======================================================
     3. SAFE HTML / URL
  ======================================================= */

  function escapeHTML(value) {
    return String(value == null ? "" : value)
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
     4. STORAGE
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
        "[StoryNest] Storage could not be loaded.",
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
      console.warn(
        "[StoryNest] Could not save preferences.",
        error
      );
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
      console.warn(
        "[StoryNest] Could not save favorites.",
        error
      );
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
      console.warn(
        "[StoryNest] Could not save progress.",
        error
      );
    }
  }


  /* =======================================================
     5. PREFERENCES
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

    $$("[data-theme]").forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.theme ===
            state.preferences.theme
        );
      }
    );


    $$("[data-text-size]").forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.textSize ===
            state.preferences.textSize
        );
      }
    );


    $$("[data-reading-width]").forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.readingWidth ===
            state.preferences.readingWidth
        );
      }
    );
  }


  /* =======================================================
     6. API
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


    Object.keys(params).forEach(
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
            value
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
            cache: "no-store",
            redirect: "follow"
          }
        );
    } catch (error) {
      throw new Error(
        `Unable to reach StoryNest API: ${
          error.message
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
      data =
        await response.json();
    } else {
      const raw =
        await response.text();

      try {
        data =
          JSON.parse(raw);
      } catch {
        console.error(
          "[StoryNest API] Invalid response:",
          raw
        );

        throw new Error(
          "StoryNest API returned an invalid response."
        );
      }
    }


    console.debug(
      "[StoryNest API RESPONSE]",
      action,
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
     7. RESPONSE HELPERS
  ======================================================= */

  function unwrapData(response) {
    if (!response) {
      return null;
    }


    if (
      response.data !== undefined
    ) {
      return response.data;
    }


    if (
      response.result !== undefined
    ) {
      return response.result;
    }


    return response;
  }


  function findStoryObject(response) {
    if (!response) {
      return null;
    }


    /*
     * Possible structures supported:
     *
     * response.story
     *
     * response.data
     *
     * response.data.story
     *
     * response.result.story
     *
     * response.story.story
     *
     */


    if (
      response.story &&
      typeof response.story === "object" &&
      !Array.isArray(response.story)
    ) {
      return response.story;
    }


    if (
      response.data &&
      typeof response.data === "object" &&
      !Array.isArray(response.data)
    ) {
      if (
        response.data.story &&
        typeof response.data.story === "object"
      ) {
        return response.data.story;
      }

      return response.data;
    }


    if (
      response.result &&
      typeof response.result === "object" &&
      !Array.isArray(response.result)
    ) {
      if (
        response.result.story &&
        typeof response.result.story === "object"
      ) {
        return response.result.story;
      }

      return response.result;
    }


    return null;
  }


  function findStoryRecords(response) {
    if (!response) {
      return [];
    }


    if (
      Array.isArray(response.data)
    ) {
      return response.data;
    }


    if (
      Array.isArray(response.stories)
    ) {
      return response.stories;
    }


    if (
      response.data &&
      Array.isArray(
        response.data.stories
      )
    ) {
      return response.data.stories;
    }


    if (
      response.result &&
      Array.isArray(
        response.result
      )
    ) {
      return response.result;
    }


    if (
      response.result &&
      Array.isArray(
        response.result.stories
      )
    ) {
      return response.result.stories;
    }


    return [];
  }


  /* =======================================================
     8. API NORMALIZATION
  ======================================================= */

  function normalizeStory(raw) {

    if (!raw) {
      return null;
    }


    /*
     * Some backend responses can contain:
     *
     * {
     *   story: {
     *     story: {...},
     *     content: {...}
     *   }
     *
     * }
     *
     * or:
     *
     * {
     *   story_id,
     *   title,
     *   story
     * }
     */


    let source =
      raw;


    /*
     * First unwrap common wrappers.
     */

    if (
      source.data &&
      typeof source.data === "object" &&
      !Array.isArray(source.data)
    ) {
      source =
        source.data;
    }


    if (
      source.story &&
      typeof source.story === "object" &&
      !Array.isArray(source.story)
    ) {

      /*
       * Detailed response:
       *
       * source.story.story
       * source.story.content
       * source.story.characters
       */

      if (
        source.story.story &&
        typeof source.story.story === "object"
      ) {
        source =
          source.story;
      }

      /*
       * Simple response:
       *
       * source.story = actual story object
       */
      else if (
        source.story.title ||
        source.story.story_id ||
        source.story.slug
      ) {
        source =
          source.story;
      }
    }


    let meta =
      source;


    let content =
      {};


    let characters =
      [];


    let audio =
      {};


    let media =
      {};


    let rights =
      {};


    /*
     * Detailed API structure.
     */

    if (
      source.story &&
      typeof source.story === "object" &&
      !Array.isArray(source.story)
    ) {

      if (
        source.story.title ||
        source.story.story_id ||
        source.story.slug
      ) {
        meta =
          source.story;
      }
    }


    if (
      source.content &&
      typeof source.content === "object"
    ) {
      content =
        source.content;
    }


    if (
      source.characters
    ) {
      characters =
        source.characters;
    }


    if (
      source.audio &&
      typeof source.audio === "object"
    ) {
      audio =
        source.audio;
    }


    if (
      source.media &&
      typeof source.media === "object"
    ) {
      media =
        source.media;
    }


    if (
      source.rights &&
      typeof source.rights === "object"
    ) {
      rights =
        source.rights;
    }


    /*
     * Sometimes content is nested inside
     * another story object.
     */

    if (
      meta.content &&
      typeof meta.content === "object"
    ) {
      content = {
        ...content,
        ...meta.content
      };
    }


    /*
     * STORY TEXT
     *
     * Support all known field names.
     */

    const storyText =
      firstValue(
        content.story_text,
        content.story,
        content.full_story,
        content.text,

        meta.story_text,
        meta.story,
        meta.full_story,
        meta.story_content,
        meta.content_text,

        typeof meta.content === "string"
          ? meta.content
          : ""
      );


    /*
     * DESCRIPTION
     */

    const description =
      firstValue(
        content.introduction,
        content.description,

        meta.description,
        meta.summary,
        meta.introduction,

        ""
      );


    /*
     * LESSON
     */

    const lesson =
      firstValue(
        content.lesson,
        content.moral,
        content.moral_lesson,

        meta.lesson,
        meta.moral,
        ""
      );


    /*
     * REFLECTION
     */

    const reflection =
      firstValue(
        content.reflection,
        meta.reflection,
        ""
      );


    /*
     * DISCUSSION
     */

    const discussion =
      firstValue(
        content.discussion,
        meta.discussion,
        ""
      );


    /*
     * ACTIVITY
     */

    const activity =
      firstValue(
        content.creative_activity,
        content.activity,

        meta.activity,
        meta.creative_activity,

        ""
      );


    /*
     * AUDIO
     */

    const audioAvailable =
      normalizeBoolean(
        audio.available ??
        audio.enabled ??
        meta.audio_available
      );


    const audioURL =
      safeURL(
        firstValue(
          audio.url,
          audio.audio_url,
          meta.audio_url,
          meta.audio,
          ""
        )
      );


    /*
     * COVER
     */

    const coverImage =
      safeURL(
        firstValue(
          media.cover_image,
          media.cover,
          meta.cover_image,
          meta.cover,
          meta.image,
          meta.thumbnail,
          ""
        )
      );


    /*
     * CHARACTERS
     */

    let normalizedCharacters =
      characters;


    if (
      !Array.isArray(
        normalizedCharacters
      )
    ) {
      normalizedCharacters =
        parseCharacters(
          firstValue(
            meta.characters,
            content.characters,
            ""
          )
        );
    }


    /*
     * ID
     */

    const storyId =
      firstValue(
        meta.story_id,
        meta.id,
        meta.ID,
        meta.storyId,
        ""
      );


    /*
     * SLUG
     */

    const slug =
      firstValue(
        meta.slug,
        meta.story_slug,
        meta.storySlug,
        ""
      );


    /*
     * CATEGORY
     */

    const category =
      firstValue(
        meta.category,
        meta.category_name,
        meta.category_id,
        ""
      );


    /*
     * GENRE
     */

    const genre =
      firstValue(
        meta.genre,
        meta.genre_name,
        meta.genre_id,
        ""
      );


    /*
     * TITLE
     */

    const title =
      firstValue(
        meta.title,
        meta.name,
        "Untitled Story"
      );


    const result = {
      story_id:
        String(storyId || ""),

      slug:
        String(slug || ""),

      title:
        String(title || ""),

      subtitle:
        firstValue(
          meta.subtitle,
          meta.tagline,
          ""
        ),

      description:
        description,

      category:
        category,

      genre:
        genre,

      age_min:
        firstValue(
          meta.age_min,
          meta.min_age,
          ""
        ),

      age_max:
        firstValue(
          meta.age_max,
          meta.max_age,
          ""
        ),

      reading_level:
        firstValue(
          meta.reading_level,
          meta.level,
          ""
        ),

      reading_time:
        firstValue(
          meta.reading_time,
          meta.read_time,
          meta.duration,
          ""
        ),

      language:
        firstValue(
          meta.language,
          meta.lang,
          "English"
        ),

      author_name:
        firstValue(
          meta.author_name,
          meta.author,
          "StoryNest Originals"
        ),

      story:
        String(
          storyText || ""
        ),

      lesson:
        String(
          lesson || ""
        ),

      reflection:
        String(
          reflection || ""
        ),

      discussion:
        String(
          discussion || ""
        ),

      activity:
        String(
          activity || ""
        ),

      characters:
        Array.isArray(
          normalizedCharacters
        )
          ? normalizedCharacters
          : [],

      featured:
        normalizeBoolean(
          meta.featured
        ),

      status:
        String(
          meta.status || ""
        ).toUpperCase(),

      audio_available:
        audioAvailable ||
        !!audioURL,

      audio_url:
        audioURL,

      cover_image:
        coverImage,

      tags:
        normalizeTags(
          firstValue(
            meta.tags,
            content.tags,
            ""
          )
        ),

      rights_type:
        firstValue(
          rights.type,
          meta.rights_type,
          ""
        ),

      rights_status:
        firstValue(
          rights.status,
          meta.rights_status,
          ""
        ),

      published_at:
        firstValue(
          meta.published_at,
          meta.published,
          ""
        ),

      created_at:
        firstValue(
          meta.created_at,
          ""
        ),

      updated_at:
        firstValue(
          meta.updated_at,
          ""
        )
    };


    console.debug(
      "[StoryNest] Normalized story:",
      result
    );


    return result;
  }


  function firstValue(...values) {
    for (
      const value of values
    ) {
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }

    return "";
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
      normalized === "1" ||
      normalized === "on"
    );
  }


  function normalizeTags(value) {

    if (!value) {
      return [];
    }


    if (
      Array.isArray(value)
    ) {
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


    if (
      Array.isArray(value)
    ) {
      return value;
    }


    try {
      const parsed =
        typeof value === "string"
          ? JSON.parse(value)
          : value;


      if (
        Array.isArray(parsed)
      ) {
        return parsed;
      }


      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return Object.keys(parsed)
          .map(
            (key) => ({
              name: key,
              role:
                parsed[key]
            })
          );
      }

    } catch {
      /* continue */
    }


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


  /* =======================================================
     9. STATUS UI
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
      }
    );
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
     10. INITIALIZE
  ======================================================= */

  let initializationPromise =
    null;


  async function initialize() {

    /*
     * Prevent multiple simultaneous
     * initialization requests.
     */

    if (
      initializationPromise
    ) {
      return initializationPromise;
    }


    initializationPromise =
      initializeInternal();


    try {
      return await initializationPromise;
    } finally {
      initializationPromise =
        null;
    }
  }


  async function initializeInternal() {

    loadStorage();

    bindEvents();

    showLoading(
      "Connecting to StoryNest..."
    );


    try {

      const health =
        await api(
          "health"
        );


      console.info(
        "[StoryNest] Backend:",
        health
      );


      setConnectionStatus(
        "StoryNest is online",
        "online"
      );


      /*
       * Load library data.
       *
       * If featured/categories/genres fail,
       * the main stories should still load.
       */

      await Promise.allSettled([
        loadStories(),
        loadFeatured(),
        loadCategories(),
        loadGenres()
      ]);


      state.initialized =
        true;


      renderAll();


      /*
       * If stories failed completely,
       * make the error visible.
       */

      if (
        !state.stories.length
      ) {
        console.warn(
          "[StoryNest] No stories were loaded."
        );
      }


    } catch (error) {

      console.error(
        "[StoryNest] Initialization failed:",
        error
      );


      showError(
        "Unable to connect to StoryNest. Please refresh and try again."
      );


      renderEmptyState(
        "StoryNest is temporarily unavailable.",
        "Please try again in a moment."
      );

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     11. LOAD STORIES
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


      const records =
        findStoryRecords(
          response
        );


      state.stories =
        records
          .map(
            normalizeStory
          )
          .filter(Boolean);


      console.debug(
        "[StoryNest] Stories loaded:",
        state.stories.length,
        state.stories
      );


      updateStoryCount(
        response.pagination?.total ??
        response.total ??
        state.stories.length
      );


      renderStoryLibrary();


      return state.stories;

    } catch (error) {

      console.error(
        "[StoryNest] loadStories failed:",
        error
      );


      state.stories = [];


      showError(
        "Stories could not be loaded."
      );


      renderEmptyState(
        "Stories could not be loaded.",
        "Please refresh and try again."
      );


      throw error;

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     12. FEATURED
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
        findStoryRecords(
          response
        );


      state.featured =
        records
          .map(
            normalizeStory
          )
          .filter(Boolean);


      renderFeatured();


    } catch (error) {

      console.warn(
        "[StoryNest] Featured stories unavailable:",
        error
      );


      state.featured = [];
    }
  }


  /* =======================================================
     13. CATEGORIES
  ======================================================= */

  async function loadCategories() {

    try {

      const response =
        await api(
          "categories"
        );


      const data =
        unwrapData(
          response
        );


      state.categories =
        Array.isArray(data)
          ? data
          : Array.isArray(
              response.data
            )
            ? response.data
            : [];


      renderCategories();


    } catch (error) {

      console.warn(
        "[StoryNest] Categories unavailable:",
        error
      );
    }
  }


  /* =======================================================
     14. GENRES
  ======================================================= */

  async function loadGenres() {

    try {

      const response =
        await api(
          "genres"
        );


      const data =
        unwrapData(
          response
        );


      state.genres =
        Array.isArray(data)
          ? data
          : Array.isArray(
              response.data
            )
            ? response.data
            : [];


      renderGenres();


    } catch (error) {

      console.warn(
        "[StoryNest] Genres unavailable:",
        error
      );
    }
  }


  /* =======================================================
     15. SEARCH
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


      const records =
        findStoryRecords(
          response
        );


      state.stories =
        records
          .map(
            normalizeStory
          )
          .filter(Boolean);


      updateStoryCount(
        response.total ??
        response.pagination?.total ??
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
        "[StoryNest] Search failed:",
        error
      );


      showError(
        "Search could not be completed."
      );

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     16. LOAD SINGLE STORY
  ======================================================= */

  async function openStory(
    identifier
  ) {

    if (
      !identifier
    ) {
      return;
    }


    const id =
      String(
        identifier
      ).trim();


    if (!id) {
      return;
    }


    showLoading(
      "Opening story..."
    );


    console.info(
      "[StoryNest] Opening story:",
      id
    );


    try {

      /*
       * Primary request.
       */

      let response =
        await api(
          "story",
          {
            id: id
          }
        );


      console.debug(
        "[StoryNest] Story API response:",
        response
      );


      let storyObject =
        findStoryObject(
          response
        );


      /*
       * If the API doesn't return a story
       * directly, try slug.
       */

      if (
        !storyObject
      ) {

        console.warn(
          "[StoryNest] Story not found by id. Trying slug..."
        );


        try {

          response =
            await api(
              "story",
              {
                slug: id
              }
            );


          storyObject =
            findStoryObject(
              response
            );

        } catch (
          slugError
        ) {

          console.warn(
            "[StoryNest] Slug lookup failed:",
            slugError
          );
        }
      }


      /*
       * Last fallback:
       *
       * Search the already-loaded story list.
       *
       * This is important because some Apps Script
       * deployments may expose the list correctly
       * but have an inconsistent detail endpoint.
       */

      if (
        !storyObject
      ) {

        const localStory =
          state.stories.find(
            (story) =>
              String(
                story.story_id
              ) === id ||
              String(
                story.slug
              ) === id
          );


        if (
          localStory
        ) {

          console.warn(
            "[StoryNest] Using story from loaded library."
          );


          state.currentStory =
            localStory;


          renderStoryPage(
            localStory
          );


          updateReadingProgress(
            localStory
          );


          setConnectionStatus(
            "Story loaded",
            "online"
          );


          scrollToStory();


          return;
        }
      }


      if (
        !storyObject
      ) {

        console.error(
          "[StoryNest] Could not find story in API response:",
          response
        );


        throw new Error(
          "Story was not returned by the API."
        );
      }


      const story =
        normalizeStory(
          storyObject
        );


      if (
        !story
      ) {
        throw new Error(
          "Story data could not be normalized."
        );
      }


      /*
       * If the detailed endpoint returned a
       * minimal object without content, try to
       * merge it with the library version.
       */

      const existing =
        state.stories.find(
          (item) =>
            (
              story.story_id &&
              item.story_id ===
                story.story_id
            ) ||
            (
              story.slug &&
              item.slug ===
                story.slug
            )
        );


      if (
        existing
      ) {

        if (
          !story.story
        ) {
          story.story =
            existing.story;
        }


        if (
          !story.description
        ) {
          story.description =
            existing.description;
        }


        if (
          !story.title
        ) {
          story.title =
            existing.title;
        }


        if (
          !story.cover_image
        ) {
          story.cover_image =
            existing.cover_image;
        }
      }


      state.currentStory =
        story;


      console.info(
        "[StoryNest] Final story:",
        story
      );


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
        "Unable to load this story."
      );


      renderStoryLoadError();

    } finally {
      hideLoading();
    }
  }


  /* =======================================================
     17. STORY PAGE
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
        "[StoryNest] Story page container not found."
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
            ? `Ages ${
                escapeHTML(
                  story.age_min
                )
              }–${
                escapeHTML(
                  story.age_max
                )
              }`
            : "",

          story.reading_time
            ? `${
                escapeHTML(
                  story.reading_time
                )
              } min read`
            : "",

          story.language,

          story.author_name
            ? `By ${
                escapeHTML(
                  story.author_name
                )
              }`
            : ""
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
     18. COVER
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

      image.alt =
        "";

      image.hidden =
        true;
    }
  }


  /* =======================================================
     19. STORY CONTENT
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
        "[StoryNest] Story content container not found."
      );

      return;
    }


    const storyText =
      String(
        story.story || ""
      ).trim();


    if (
      !storyText
    ) {

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
     * Preserve paragraphs.
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
     20. CHARACTERS
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

            if (
              typeof character ===
              "string"
            ) {
              character = {
                name:
                  character
              };
            }


            const name =
              character.name ||
              character.title ||
              "Character";


            const role =
              character.role ||
              character.description ||
              "";


            return `
              <article
                class="character-card"
              >

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
     21. OPTIONAL CONTENT
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


    if (
      !textValue
    ) {

      element.hidden =
        true;

      return;
    }


    element.hidden =
      false;


    const paragraphs =
      textValue
        .split(
          /\n\s*\n|\r?\n/
        )
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean);


    html(
      element,

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
     22. AUDIO
  ======================================================= */

  let audioElement =
    null;


  function getAudioElement() {

    if (
      audioElement
    ) {
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
          "[StoryNest] Audio could not be loaded."
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
        state.preferences.narrationSpeed ||
        1
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
        "[StoryNest] Audio playback failed:",
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


    state.preferences.narrationSpeed =
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
      !Number.isFinite(seconds)
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


    return `${minutes}:${
      String(
        remaining
      ).padStart(
        2,
        "0"
      )
    }`;
  }


  /* =======================================================
     23. FAVORITES
  ======================================================= */

  function isFavorite(
    storyId
  ) {

    return state.favorites.includes(
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
     24. STORY CARD
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
        ? `Ages ${
            escapeHTML(
              story.age_min
            )
          }–${
            escapeHTML(
              story.age_max
            )
          }`
        : "";


    const audio =
      story.audio_url
        ? `<span>Audio</span>`
        : "";


    const identifier =
      story.story_id ||
      story.slug;


    return `
      <article
        class="story-card"
        data-story-id="${escapeHTML(
          identifier
        )}"
        data-story-slug="${escapeHTML(
          story.slug
        )}"
      >

        <button
          class="story-card-main"
          type="button"
          data-open-story="${escapeHTML(
            identifier
          )}"
        >

          <div
            class="story-card-cover"
          >
            ${cover}
          </div>


          <div
            class="story-card-content"
          >

            <div
              class="story-card-meta"
            >

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
                  <p
                    class="story-card-subtitle"
                  >
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
                  <p
                    class="story-card-description"
                  >
                    ${escapeHTML(
                      story.description
                    )}
                  </p>
                `
                : ""
            }


            <div
              class="story-card-footer"
            >

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
            identifier
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
     25. STORY LIBRARY
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
        "[StoryNest] Story library container not found."
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
        .map(
          storyCard
        )
        .join("")
    );


    bindDynamicStoryCards(
      container
    );
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


    html(
      container,

      state.featured
        .map(
          storyCard
        )
        .join("")
    );


    bindDynamicStoryCards(
      container
    );
  }


  /* =======================================================
     26. CATEGORIES
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

          `<option value="">
            All categories
          </option>` +

          state.categories
            .map(
              (item) => {

                const name =
                  typeof item ===
                  "string"
                    ? item
                    : (
                        item?.name ||
                        item?.title ||
                        item?.category ||
                        ""
                      );


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
     27. GENRES
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

          `<option value="">
            All genres
          </option>` +

          state.genres
            .map(
              (item) => {

                const name =
                  typeof item ===
                  "string"
                    ? item
                    : (
                        item?.name ||
                        item?.title ||
                        item?.genre ||
                        ""
                      );


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
     28. STORY COUNT
  ======================================================= */

  function updateStoryCount(
    count
  ) {

    $$(
      "#storyCount, [data-story-count]"
    ).forEach(
      (element) => {

        text(
          element,
          count
        );
      }
    );
  }


  /* =======================================================
     29. EMPTY STATE
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


    bindEvents();
  }


  /* =======================================================
     30. STORY LOAD ERROR
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


          <button
            type="button"
            data-back-to-stories
          >
            Back to Stories
          </button>

        </div>
      `
    );


    bindEvents();
  }


  /* =======================================================
     31. NAVIGATION
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

        page.scrollIntoView(
          {
            behavior:
              "smooth",

            block:
              "start"
          }
        );

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

    } catch {
      /* ignore */
    }


    window.scrollTo(
      {
        top: 0,
        behavior: "smooth"
      }
    );
  }


  /* =======================================================
     32. READING PROGRESS
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
      saved === undefined
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


    /*
     * Calculate document-relative
     * reading position.
     */

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


    const bar =
      firstExisting(
        "#readingProgress",
        "[data-reading-progress]"
      );


    if (bar) {

      bar.style.width =
        `${percent}%`;
    }
  }


  /* =======================================================
     33. FILTERS
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
    ).forEach(
      (element) => {
        element.value =
          "";
      }
    );


    $$(
      "#genreFilter, [data-genre-filter]"
    ).forEach(
      (element) => {
        element.value =
          "";
      }
    );


    $$(
      "#ageFilter, [data-age-filter]"
    ).forEach(
      (element) => {
        element.value =
          "";
      }
    );


    $$(
      "#searchInput, [data-search-input]"
    ).forEach(
      (element) => {
        element.value =
          "";
      }
    );


    await loadStories();
  }


  /* =======================================================
     34. DYNAMIC STORY CARDS
  ======================================================= */

  function bindDynamicStoryCards(
    root = document
  ) {

    $$(
      "[data-open-story]",
      root
    ).forEach(
      (button) => {

        button.onclick =
          (event) => {

            event.preventDefault();

            openStory(
              button.dataset.openStory
            );
          };
      }
    );


    $$(
      "[data-save-story]",
      root
    ).forEach(
      (button) => {

        button.onclick =
          (event) => {

            event.preventDefault();

            event.stopPropagation();


            toggleFavorite(
              button.dataset.saveStory
            );
          };
      }
    );
  }


  /* =======================================================
     35. EVENT BINDING
  ======================================================= */

  let globalEventsBound =
    false;


  function bindEvents() {

    /*
     * Navigation
     */

    $$(
      "[data-open-story]"
    ).forEach(
      (button) => {

        button.onclick =
          (event) => {

            event.preventDefault();

            openStory(
              button.dataset.openStory
            );
          };
      }
    );


    $$(
      "[data-close-story], #closeStory, .close-story"
    ).forEach(
      (button) => {

        button.onclick =
          closeStory;
      }
    );


    /*
     * Search
     */

    $$(
      "#searchInput, [data-search-input]"
    ).forEach(
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


    /*
     * Search submit
     */

    $$(
      "[data-search-submit]"
    ).forEach(
      (button) => {

        if (
          button.dataset.storynestBound
        ) {
          return;
        }


        button.dataset.storynestBound =
          "true";


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
    ).forEach(
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


    /*
     * Reset filters
     */

    $$(
      "[data-reset-filters], #resetFilters"
    ).forEach(
      (button) => {

        button.onclick =
          resetFilters;
      }
    );


    /*
     * Refresh
     */

    $$(
      "#refreshButton, [data-refresh]"
    ).forEach(
      (button) => {

        if (
          button.dataset.storynestBound
        ) {
          return;
        }


        button.dataset.storynestBound =
          "true";


        button.onclick =
          async () => {

            try {

              await initialize();

            } catch (
              error
            ) {

              console.error(
                error
              );
            }
          };
      }
    );


    /*
     * Audio controls
     */

    $$(
      "[data-audio-toggle], #audioPlay, .audio-play"
    ).forEach(
      (button) => {

        if (
          button.dataset.storynestBound
        ) {
          return;
        }


        button.dataset.storynestBound =
          "true";


        button.onclick =
          toggleAudio;
      }
    );


    $$(
      "[data-audio-speed], #audioSpeed"
    ).forEach(
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
    ).forEach(
      (element) => {

        if (
          element.dataset.storynestBound
        ) {
          return;
        }


        if (
          element.tagName ===
          "INPUT"
        ) {

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
      }
    );


    /*
     * Favorite button
     */

    $$(
      "[data-favorite-story], #favoriteStory, .favorite-story"
    ).forEach(
      (button) => {

        button.onclick =
          (event) => {

            event.preventDefault();

            if (
              state.currentStory
            ) {

              toggleFavorite(
                state.currentStory.story_id
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
    ).forEach(
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

            const theme =
              button.dataset.theme;


            if (!theme) {
              return;
            }


            state.preferences.theme =
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
    ).forEach(
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

            const value =
              button.dataset.textSize;


            if (!value) {
              return;
            }


            state.preferences.textSize =
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
    ).forEach(
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

            const value =
              button.dataset.readingWidth;


            if (!value) {
              return;
            }


            state.preferences.readingWidth =
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
    ).forEach(
      (button) => {

        button.onclick =
          closeStory;
      }
    );


    /*
     * Global keyboard / scroll /
     * online events should only be
     * bound once.
     */

    if (
      globalEventsBound
    ) {
      return;
    }


    globalEventsBound =
      true;


    /*
     * Keyboard shortcuts
     */

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
          event.key === "/" &&
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


    /*
     * Reading progress
     */

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


    /*
     * Online status
     */

    window.addEventListener(
      "online",
      () => {

        setConnectionStatus(
          "Connection restored",
          "online"
        );
      }
    );


    /*
     * Offline status
     */

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


  /* =======================================================
     36. RENDER ALL
  ======================================================= */

  function renderAll() {

    renderStoryLibrary();

    renderFeatured();

    renderCategories();

    renderGenres();


    if (
      state.currentStory
    ) {

      renderStoryPage(
        state.currentStory
      );
    }
  }


  /* =======================================================
     37. UTILITY
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


    return function (
      ...args
    ) {

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
     38. GLOBAL STORYNEST API
  ======================================================= */

  window.StoryNest = {

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

    setAudioSpeed,

    state
  };


  /* =======================================================
     39. START APPLICATION
  ======================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initialize();

    }
  );

})();
