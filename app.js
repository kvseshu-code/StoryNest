/* ============================================================
   STORYNEST FRONTEND
   GitHub Pages + Google Apps Script
============================================================ */

"use strict";


/* ============================================================
   CONFIGURATION
============================================================ */

const STORYNEST_CONFIG = {

  API_URL:
    "https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec",

  PAGE_SIZE: 20,

  AUTO_REFRESH_MINUTES: 10,

  DEFAULT_LANGUAGE: "English"

};


/* ============================================================
   APPLICATION STATE
============================================================ */

const state = {

  stories: [],

  filteredStories: [],

  featured: null,

  currentStory: null,

  currentView: "home",

  currentPage: 1,

  searchQuery: "",

  ageFilter: "",

  readingFilter: "",

  categoryFilter: "",

  isLoading: false,

  apiOnline: false,

  audio: {

    enabled: false,

    currentUrl: "",

    currentTitle: "",

    playing: false

  }

};


/* ============================================================
   DOM HELPERS
============================================================ */

const $ = selector =>
  document.querySelector(selector);

const $$ = selector =>
  [...document.querySelectorAll(selector)];


/* ============================================================
   SAFE TEXT
============================================================ */

function escapeHTML(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ============================================================
   API
============================================================ */

async function apiRequest(action, params = {}) {

  const url = new URL(STORYNEST_CONFIG.API_URL);

  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {

      url.searchParams.set(
        key,
        value
      );

    }

  });

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {

    throw new Error(
      `API request failed: ${response.status}`
    );

  }

  const data = await response.json();

  if (!data || data.success === false) {

    throw new Error(
      data?.message ||
      "StoryNest API returned an error."
    );

  }

  return data;

}


/* ============================================================
   STATUS
============================================================ */

function setStatus(
  online,
  message
) {

  state.apiOnline = online;

  const dot = $("#statusDot");
  const text = $("#statusText");

  if (!dot || !text) {
    return;
  }

  dot.classList.toggle(
    "error",
    !online
  );

  text.textContent =
    message ||
    (
      online
        ? "StoryNest is online"
        : "StoryNest is temporarily unavailable"
    );

}


/* ============================================================
   TOAST
============================================================ */

let toastTimer = null;

function toast(message) {

  const element = $("#toast");

  if (!element) {
    return;
  }

  element.textContent = message;

  element.classList.add("visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    element.classList.remove("visible");

  }, 2800);

}


/* ============================================================
   NORMALIZATION
============================================================ */

function normalizeStory(raw) {

  if (!raw) {
    return null;
  }

  return {

    story_id:
      raw.story_id ||
      raw.id ||
      "",

    slug:
      raw.slug ||
      "",

    title:
      raw.title ||
      "Untitled Story",

    subtitle:
      raw.subtitle ||
      "",

    description:
      raw.description ||
      "",

    category_id:
      raw.category_id ||
      "",

    category:
      raw.category ||
      "",

    genre_id:
      raw.genre_id ||
      "",

    genre:
      raw.genre ||
      "",

    age_min:
      Number(raw.age_min || 0),

    age_max:
      Number(raw.age_max || 0),

    reading_level:
      raw.reading_level ||
      "General",

    reading_time:
      Number(raw.reading_time || 0),

    language:
      raw.language ||
      STORYNEST_CONFIG.DEFAULT_LANGUAGE,

    author_name:
      raw.author_name ||
      "StoryNest Originals",

    series_id:
      raw.series_id ||
      "",

    episode_number:
      Number(raw.episode_number || 0),

    featured:
      Boolean(
        raw.featured === true ||
        String(raw.featured).toLowerCase() === "true"
      ),

    audio_available:
      Boolean(
        raw.audio_available === true ||
        String(raw.audio_available).toLowerCase() === "true"
      ),

    published_at:
      raw.published_at ||
      "",

    content:
      raw.content ||
      null,

    characters:
      Array.isArray(raw.characters)
        ? raw.characters
        : [],

    audio:
      Array.isArray(raw.audio)
        ? raw.audio
        : [],

    media:
      Array.isArray(raw.media)
        ? raw.media
        : [],

    reflection:
      raw.reflection ||
      raw.question ||
      "",

    activity:
      raw.activity ||
      "",

    themes:
      raw.themes ||
      ""

  };

}


/* ============================================================
   LOAD STORIES
============================================================ */

async function loadStories() {

  if (state.isLoading) {
    return;
  }

  state.isLoading = true;

  setStatus(
    true,
    "Updating StoryNest..."
  );

  try {

    const response =
      await apiRequest(
        "stories",
        {
          page: 1,
          pageSize:
            STORYNEST_CONFIG.PAGE_SIZE
        }
      );

    const rows =
      Array.isArray(response.data)
        ? response.data
        : [];

    state.stories =
      rows
        .map(normalizeStory)
        .filter(Boolean);

    state.featured =
      state.stories.find(
        story => story.featured
      ) ||
      state.stories[0] ||
      null;

    state.filteredStories =
      [...state.stories];

    renderHome();

    renderLibrary();

    setStatus(
      true,
      `StoryNest online · ${state.stories.length} stories`
    );

  } catch (error) {

    console.error(error);

    setStatus(
      false,
      "Unable to reach StoryNest"
    );

    renderError(
      "latestContainer",
      "Stories could not be loaded."
    );

    renderError(
      "storyLibrary",
      "The StoryNest library is temporarily unavailable."
    );

  } finally {

    state.isLoading = false;

    hideLoading();

  }

}


/* ============================================================
   LOAD STORY DETAIL
============================================================ */

async function loadStory(identifier) {

  if (!identifier) {
    return;
  }

  showLoading();

  try {

    let response;

    /*
      Try slug first.
    */

    response =
      await apiRequest(
        "story",
        {
          slug: identifier
        }
      );

    let payload =
      response.story ||
      response.data ||
      response;

    /*
      Some backend versions return:
      {
        story: {
          story: {...},
          content: ...
        }
      }
    */

    if (
      payload &&
      payload.story &&
      typeof payload.story === "object"
    ) {

      payload = payload;

    }

    let metadata =
      payload?.story ||
      payload;

    const story =
      normalizeStory(metadata);

    if (!story) {
      throw new Error(
        "Story not found."
      );
    }

    story.content =
      payload?.content ||
      story.content;

    story.characters =
      Array.isArray(payload?.characters)
        ? payload.characters
        : story.characters;

    story.audio =
      Array.isArray(payload?.audio)
        ? payload.audio
        : story.audio;

    story.media =
      Array.isArray(payload?.media)
        ? payload.media
        : story.media;

    state.currentStory = story;

    renderReader(story);

    showView("reader");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  } catch (error) {

    console.error(error);

    toast(
      "Unable to open this story."
    );

  } finally {

    hideLoading();

  }

}


/* ============================================================
   HOME
============================================================ */

function renderHome() {

  renderFeatured();

  renderLatest();

}


/* ============================================================
   FEATURED
============================================================ */

function renderFeatured() {

  const container =
    $("#featuredContainer");

  if (!container) {
    return;
  }

  if (!state.featured) {

    container.innerHTML =
      emptyState(
        "No featured story yet."
      );

    return;

  }

  const story =
    state.featured;

  container.innerHTML = `

    <article class="featured-card">

      <p class="eyebrow">
        FEATURED STORY
      </p>

      <h3>
        ${escapeHTML(story.title)}
      </h3>

      <p>
        ${escapeHTML(story.description)}
      </p>

      <div>

        ${storyMeta(story)}

        <button
          class="story-card-action"
          data-story="${escapeHTML(story.slug || story.story_id)}"
        >
          Begin reading →
        </button>

      </div>

    </article>

  `;

  bindStoryButtons();

}


/* ============================================================
   LATEST
============================================================ */

function renderLatest() {

  const container =
    $("#latestContainer");

  if (!container) {
    return;
  }

  const latest =
    [...state.stories]
      .sort(
        (a, b) =>
          new Date(b.published_at || 0) -
          new Date(a.published_at || 0)
      )
      .slice(0, 6);

  if (!latest.length) {

    container.innerHTML =
      emptyState(
        "New stories are coming soon."
      );

    return;

  }

  container.innerHTML =
    latest
      .map(
        (story, index) =>
          storyCard(
            story,
            index + 1
          )
      )
      .join("");

  bindStoryButtons();

}


/* ============================================================
   STORY CARD
============================================================ */

function storyCard(
  story,
  index
) {

  const identifier =
    story.slug ||
    story.story_id;

  return `

    <article class="story-card">

      <span class="card-number">
        ${String(index).padStart(2, "0")}
      </span>

      <h3>
        ${escapeHTML(story.title)}
      </h3>

      <p>
        ${escapeHTML(
          story.description
        )}
      </p>

      <div class="story-card-meta">

        ${story.age_min || story.age_max
          ? `<span class="story-tag">
              Ages ${escapeHTML(
                story.age_min
              )}–${escapeHTML(
                story.age_max
              )}
            </span>`
          : ""
        }

        <span class="story-tag">
          ${escapeHTML(
            story.reading_level
          )}
        </span>

        ${
          story.reading_time
            ? `<span class="story-tag">
                ${story.reading_time} min
              </span>`
            : ""
        }

      </div>

      <button
        class="story-card-action"
        data-story="${escapeHTML(identifier)}"
      >
        Read story →
      </button>

    </article>

  `;

}


/* ============================================================
   STORY META
============================================================ */

function storyMeta(story) {

  return `

    <div class="story-card-meta">

      ${
        story.age_min || story.age_max
          ? `<span class="story-tag">
              Ages ${escapeHTML(story.age_min)}
              –
              ${escapeHTML(story.age_max)}
            </span>`
          : ""
      }

      <span class="story-tag">
        ${escapeHTML(story.reading_level)}
      </span>

      ${
        story.reading_time
          ? `<span class="story-tag">
              ${story.reading_time} min
            </span>`
          : ""
      }

    </div>

  `;

}


/* ============================================================
   LIBRARY
============================================================ */

function renderLibrary() {

  const container =
    $("#storyLibrary");

  if (!container) {
    return;
  }

  const stories =
    applyFilters(
      state.stories
    );

  state.filteredStories =
    stories;

  const visible =
    stories.slice(
      0,
      state.currentPage *
        STORYNEST_CONFIG.PAGE_SIZE
    );

  if (!visible.length) {

    container.innerHTML =
      emptyState(
        "No stories match your search."
      );

    updateResultCount(0);

    return;

  }

  container.innerHTML =
    visible
      .map(
        (story, index) =>
          storyCard(
            story,
            index + 1
          )
      )
      .join("");

  updateResultCount(
    stories.length
  );

  updateLoadMore(
    visible.length,
    stories.length
  );

  bindStoryButtons();

}


/* ============================================================
   FILTERS
============================================================ */

function applyFilters(
  stories
) {

  return stories.filter(
    story => {

      const query =
        state.searchQuery
          .trim()
          .toLowerCase();

      const searchable = [
        story.title,
        story.subtitle,
        story.description,
        story.genre,
        story.category,
        story.author_name
      ]
        .join(" ")
        .toLowerCase();

      if (
        query &&
        !searchable.includes(query)
      ) {

        return false;

      }

      if (
        state.ageFilter &&
        !ageMatches(
          story,
          state.ageFilter
        )
      ) {

        return false;

      }

      if (
        state.readingFilter &&
        story.reading_level !==
          state.readingFilter
      ) {

        return false;

      }

      if (
        state.categoryFilter
      ) {

        const category =
          (
            story.category ||
            story.genre ||
            ""
          ).toLowerCase();

        if (
          !category.includes(
            state.categoryFilter.toLowerCase()
          )
        ) {

          return false;

        }

      }

      return true;

    }
  );

}


/* ============================================================
   AGE MATCH
============================================================ */

function ageMatches(
  story,
  range
) {

  const [min, max] =
    range
      .split("-")
      .map(Number);

  const storyMin =
    Number(story.age_min || 0);

  const storyMax =
    Number(story.age_max || 99);

  return (
    storyMin <= max &&
    storyMax >= min
  );

}


/* ============================================================
   RESULT COUNT
============================================================ */

function updateResultCount(
  count
) {

  const element =
    $("#resultCount");

  if (!element) {
    return;
  }

  element.textContent =
    `${count} ${
      count === 1
        ? "story"
        : "stories"
    }`;

}


/* ============================================================
   LOAD MORE
============================================================ */

function updateLoadMore(
  visible,
  total
) {

  const container =
    $("#loadMoreContainer");

  const button =
    $("#loadMoreButton");

  if (!container || !button) {
    return;
  }

  const hasMore =
    visible < total;

  container.style.display =
    hasMore
      ? "flex"
      : "none";

}


/* ============================================================
   READER
============================================================ */

function renderReader(
  story
) {

  $("#readerKicker").textContent =
    story.genre
      ? story.genre.toUpperCase()
      : "STORYNEST ORIGINAL";

  $("#readerTitle").textContent =
    story.title;

  $("#readerSubtitle").textContent =
    story.subtitle ||
    story.description ||
    "";

  $("#readerAge").textContent =
    story.age_min || story.age_max
      ? `Ages ${story.age_min}–${story.age_max}`
      : "All ages";

  $("#readerTime").textContent =
    story.reading_time
      ? `${story.reading_time} min`
      : "Open reading";

  $("#readerLevel").textContent =
    story.reading_level;

  renderStoryContent(
    story.content
  );

  renderCharacters(
    story.characters
  );

  renderReflection(
    story
  );

  renderActivity(
    story
  );

  renderRelated(
    story
  );

  setupReaderProgress();

  setupAudio(
    story
  );

}


/* ============================================================
   CONTENT
============================================================ */

function renderStoryContent(
  content
) {

  const container =
    $("#readerContent");

  if (!container) {
    return;
  }

  if (!content) {

    container.innerHTML = `

      <p>
        This story is being prepared for publication.
      </p>

    `;

    return;

  }

  /*
    Content may arrive as:
      string
      array
      object
  */

  let paragraphs = [];

  if (
    typeof content === "string"
  ) {

    paragraphs =
      content
        .split(/\n{2,}|\r\n\r\n/)
        .map(
          value => value.trim()
        )
        .filter(Boolean);

  } else if (
    Array.isArray(content)
  ) {

    paragraphs =
      content
        .map(
          item =>
            typeof item === "string"
              ? item
              : item.text ||
                item.content ||
                ""
        )
        .filter(Boolean);

  } else if (
    typeof content === "object"
  ) {

    paragraphs =
      Object.values(content)
        .filter(
          value =>
            typeof value === "string"
        );

  }

  if (!paragraphs.length) {

    container.innerHTML =
      "<p>The story content is being prepared.</p>";

    return;

  }

  /*
    IMPORTANT:
    We intentionally use textContent here
    rather than injecting CMS HTML.
    This prevents unsafe HTML execution.
  */

  container.innerHTML = "";

  paragraphs.forEach(
    paragraph => {

      const p =
        document.createElement("p");

      p.textContent =
        paragraph;

      container.appendChild(p);

    }
  );

}


/* ============================================================
   CHARACTERS
============================================================ */

function renderCharacters(
  characters
) {

  const section =
    $("#charactersSection");

  const container =
    $("#charactersContainer");

  if (
    !Array.isArray(characters) ||
    !characters.length
  ) {

    section.style.display =
      "none";

    return;

  }

  section.style.display =
    "block";

  container.innerHTML =
    characters
      .map(
        character => {

          const name =
            character.name ||
            character.character ||
            "Character";

          const role =
            character.role ||
            character.description ||
            "";

          return `

            <div class="character-card">

              <strong>
                ${escapeHTML(name)}
              </strong>

              <small>
                ${escapeHTML(role)}
              </small>

            </div>

          `;

        }
      )
      .join("");

}


/* ============================================================
   REFLECTION
============================================================ */

function renderReflection(
  story
) {

  const section =
    $("#reflectionSection");

  const container =
    $("#reflectionContent");

  const value =
    story.reflection;

  if (!value) {

    section.style.display =
      "none";

    return;

  }

  section.style.display =
    "block";

  container.textContent =
    value;

}


/* ============================================================
   ACTIVITY
============================================================ */

function renderActivity(
  story
) {

  const section =
    $("#activitySection");

  const container =
    $("#activityContent");

  const value =
    story.activity;

  if (!value) {

    section.style.display =
      "none";

    return;

  }

  section.style.display =
    "block";

  container.textContent =
    value;

}


/* ============================================================
   RELATED
============================================================ */

function renderRelated(
  current
) {

  const container =
    $("#relatedStories");

  if (!container) {
    return;
  }

  const related =
    state.stories
      .filter(
        story =>
          story.story_id !==
          current.story_id
      )
      .filter(
        story => {

          const sameGenre =
            current.genre &&
            story.genre &&
            story.genre ===
              current.genre;

          const sameCategory =
            current.category &&
            story.category &&
            story.category ===
              current.category;

          return (
            sameGenre ||
            sameCategory
          );

        }
      )
      .slice(0, 3);

  if (!related.length) {

    container.innerHTML =
      emptyState(
        "More stories are coming soon."
      );

    return;

  }

  container.innerHTML =
    related
      .map(
        (story, index) =>
          storyCard(
            story,
            index + 1
          )
      )
      .join("");

  bindStoryButtons();

}


/* ============================================================
   READER PROGRESS
============================================================ */

function setupReaderProgress() {

  const bar =
    $("#readerProgressBar");

  const reader =
    $(".reader");

  if (!bar || !reader) {
    return;
  }

  const update =
    () => {

      const rect =
        reader.getBoundingClientRect();

      const total =
        reader.offsetHeight;

      const viewport =
        window.innerHeight;

      const passed =
        Math.max(
          0,
          -rect.top
        );

      const available =
        Math.max(
          1,
          total - viewport
        );

      const percent =
        Math.min(
          100,
          (passed / available) * 100
        );

      bar.style.width =
        `${percent}%`;

    };

  window.removeEventListener(
    "scroll",
    update
  );

  window.addEventListener(
    "scroll",
    update,
    { passive: true }
  );

}


/* ============================================================
   AUDIO
============================================================ */

function setupAudio(
  story
) {

  const player =
    $("#audioPlayer");

  const audio =
    $("#audioElement");

  if (
    !player ||
    !audio
  ) {
    return;
  }

  const source =
    getAudioSource(story);

  if (!source) {

    player.classList.remove(
      "visible"
    );

    return;

  }

  state.audio.enabled =
    true;

  state.audio.currentUrl =
    source;

  state.audio.currentTitle =
    story.title;

  audio.src =
    source;

  $("#audioTitle").textContent =
    story.title;

  $("#audioStatus").textContent =
    "Narration available";

  player.classList.add(
    "visible"
  );

}


/* ============================================================
   AUDIO SOURCE
============================================================ */

function getAudioSource(
  story
) {

  if (
    Array.isArray(story.audio) &&
    story.audio.length
  ) {

    const first =
      story.audio[0];

    if (
      typeof first === "string"
    ) {

      return first;

    }

    return (
      first.url ||
      first.audio_url ||
      first.src ||
      ""
    );

  }

  return "";

}


/* ============================================================
   AUDIO EVENTS
============================================================ */

function setupAudioEvents() {

  const audio =
    $("#audioElement");

  const play =
    $("#audioPlay");

  const progress =
    $("#audioProgress");

  const speed =
    $("#audioSpeed");

  const close =
    $("#audioClose");

  if (!audio) {
    return;
  }

  play.addEventListener(
    "click",
    async () => {

      if (
        audio.paused
      ) {

        try {

          await audio.play();

        } catch (error) {

          toast(
            "Audio playback could not start."
          );

        }

      } else {

        audio.pause();

      }

    }
  );


  audio.addEventListener(
    "play",
    () => {

      play.textContent =
        "Ⅱ";

      $("#audioStatus").textContent =
        "Playing";

    }
  );


  audio.addEventListener(
    "pause",
    () => {

      play.textContent =
        "▶";

      $("#audioStatus").textContent =
        "Paused";

    }
  );


  audio.addEventListener(
    "timeupdate",
    () => {

      if (
        !audio.duration
      ) {
        return;
      }

      progress.style.width =
        `${
          (
            audio.currentTime /
            audio.duration
          ) * 100
        }%`;

    }
  );


  speed.addEventListener(
    "change",
    () => {

      audio.playbackRate =
        Number(
          speed.value
        );

      localStorage.setItem(
        "storynest_audio_speed",
        speed.value
      );

    }
  );


  close.addEventListener(
    "click",
    () => {

      audio.pause();

      audio.removeAttribute(
        "src"
      );

      audio.load();

      $("#audioPlayer")
        .classList
        .remove("visible");

    }
  );

}


/* ============================================================
   STORY BUTTONS
============================================================ */

function bindStoryButtons() {

  $$("[data-story]").forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const identifier =
            button.dataset.story;

          loadStory(
            identifier
          );

        }
      );

    }
  );

}


/* ============================================================
   VIEW MANAGEMENT
============================================================ */

function showView(
  view
) {

  state.currentView =
    view;

  $$(".view").forEach(
    element => {

      element.classList.remove(
        "active-view"
      );

    }
  );

  const target =
    $(`#${view}View`);

  if (target) {

    target.classList.add(
      "active-view"
    );

  }

  $$(".nav-link").forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.view ===
          view
      );

    }
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* ============================================================
   ERROR / EMPTY
============================================================ */

function emptyState(
  message
) {

  return `

    <div class="empty-state">
      ${escapeHTML(message)}
    </div>

  `;

}


function renderError(
  elementId,
  message
) {

  const element =
    document.getElementById(
      elementId
    );

  if (!element) {
    return;
  }

  element.innerHTML = `

    <div class="error-state">

      <strong>
        Something went quiet.
      </strong>

      <p>
        ${escapeHTML(message)}
      </p>

      <button
        class="secondary-button"
        onclick="loadStories()"
      >
        Try again
      </button>

    </div>

  `;

}


/* ============================================================
   LOADING
============================================================ */

function showLoading() {

  $("#loadingScreen")
    ?.classList
    .remove("hidden");

}


function hideLoading() {

  $("#loadingScreen")
    ?.classList
    .add("hidden");

}


/* ============================================================
   THEME
============================================================ */

function setupTheme() {

  const saved =
    localStorage.getItem(
      "storynest_theme"
    );

  if (
    saved === "dark"
  ) {

    document.documentElement
      .classList
      .add("dark");

    $("#themeIcon").textContent =
      "☼";

  }

  $("#themeButton")
    .addEventListener(
      "click",
      () => {

        const dark =
          document.documentElement
            .classList
            .toggle("dark");

        localStorage.setItem(
          "storynest_theme",
          dark
            ? "dark"
            : "light"
        );

        $("#themeIcon").textContent =
          dark
            ? "☼"
            : "◐";

      }
    );

}


/* ============================================================
   SEARCH
============================================================ */

function setupSearch() {

  const search =
    $("#storySearch");

  search.addEventListener(
    "input",
    event => {

      state.searchQuery =
        event.target.value;

      state.currentPage =
        1;

      renderLibrary();

    }
  );


  $("#clearSearch")
    .addEventListener(
      "click",
      () => {

        search.value = "";

        state.searchQuery =
          "";

        state.currentPage =
          1;

        renderLibrary();

        search.focus();

      }
    );


  $("#globalSearch")
    .addEventListener(
      "input",
      event => {

        renderGlobalSearch(
          event.target.value
        );

      }
    );

}


/* ============================================================
   GLOBAL SEARCH
============================================================ */

function renderGlobalSearch(
  query
) {

  const container =
    $("#globalSearchResults");

  const normalized =
    query
      .trim()
      .toLowerCase();

  if (!normalized) {

    container.innerHTML = "";

    return;

  }

  const results =
    state.stories
      .filter(
        story =>
          [
            story.title,
            story.subtitle,
            story.description,
            story.genre,
            story.category
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
      )
      .slice(0, 8);

  if (!results.length) {

    container.innerHTML =
      emptyState(
        "No stories found."
      );

    return;

  }

  container.innerHTML =
    results
      .map(
        story => `

          <div class="global-result">

            <button
              data-story="${escapeHTML(
                story.slug ||
                story.story_id
              )}"
            >

              <strong>
                ${escapeHTML(
                  story.title
                )}
              </strong>

              <p>
                ${escapeHTML(
                  story.description
                )}
              </p>

            </button>

          </div>

        `
      )
      .join("");

  bindStoryButtons();

}


/* ============================================================
   SEARCH OVERLAY
============================================================ */

function setupSearchOverlay() {

  const overlay =
    $("#searchOverlay");

  $("#searchButton")
    .addEventListener(
      "click",
      () => {

        overlay.classList.add(
          "open"
        );

        overlay.setAttribute(
          "aria-hidden",
          "false"
        );

        setTimeout(
          () =>
            $("#globalSearch")
              .focus(),
          50
        );

      }
    );


  $("#searchClose")
    .addEventListener(
      "click",
      closeSearch
    );


  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target === overlay
      ) {

        closeSearch();

      }

    }
  );


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape"
      ) {

        closeSearch();

      }

    }
  );

}


function closeSearch() {

  const overlay =
    $("#searchOverlay");

  overlay.classList.remove(
    "open"
  );

  overlay.setAttribute(
    "aria-hidden",
    "true"
  );

}


/* ============================================================
   FILTER EVENTS
============================================================ */

function setupFilters() {

  $("#ageFilter")
    .addEventListener(
      "change",
      event => {

        state.ageFilter =
          event.target.value;

        state.currentPage =
          1;

        renderLibrary();

      }
    );


  $("#readingFilter")
    .addEventListener(
      "change",
      event => {

        state.readingFilter =
          event.target.value;

        state.currentPage =
          1;

        renderLibrary();

      }
    );


  $("#resetFilters")
    .addEventListener(
      "click",
      () => {

        state.searchQuery =
          "";

        state.ageFilter =
          "";

        state.readingFilter =
          "";

        state.categoryFilter =
          "";

        $("#storySearch").value =
          "";

        $("#ageFilter").value =
          "";

        $("#readingFilter").value =
          "";

        renderLibrary();

      }
    );


  $("#loadMoreButton")
    .addEventListener(
      "click",
      () => {

        state.currentPage++;

        renderLibrary();

      }
    );

}


/* ============================================================
   AGE BUTTONS
============================================================ */

function setupAgeButtons() {

  $$("[data-age]").forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          state.ageFilter =
            button.dataset.age;

          $("#ageFilter").value =
            state.ageFilter;

          showView(
            "stories"
          );

          renderLibrary();

        }
      );

    }
  );

}


/* ============================================================
   CATEGORY BUTTONS
============================================================ */

function setupCategoryButtons() {

  $$(".category-grid button")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.categoryFilter =
              button.dataset.category;

            state.currentPage =
              1;

            showView(
              "stories"
            );

            renderLibrary();

          }
        );

      }
    );

}


/* ============================================================
   NAVIGATION
============================================================ */

function setupNavigation() {

  $$("[data-view]").forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          showView(
            button.dataset.view
          );

        }
      );

    }
  );


  $("#brandHome")
    .addEventListener(
      "click",
      event => {

        event.preventDefault();

        showView(
          "home"
        );

      }
    );


  $("#exploreStoriesButton")
    .addEventListener(
      "click",
      () => {

        showView(
          "stories"
        );

      }
    );


  $("#readerBack")
    .addEventListener(
      "click",
      () => {

        showView(
          "stories"
        );

      }
    );


  $("#randomStoryButton")
    .addEventListener(
      "click",
      () => {

        if (!state.stories.length) {
          return;
        }

        const index =
          Math.floor(
            Math.random() *
            state.stories.length
          );

        const story =
          state.stories[index];

        loadStory(
          story.slug ||
          story.story_id
        );

      }
    );

}


/* ============================================================
   MOBILE MENU
============================================================ */

function setupMobileMenu() {

  $("#mobileMenuButton")
    .addEventListener(
      "click",
      () => {

        $("#mobileNav")
          .classList
          .toggle("open");

      }
    );

}


/* ============================================================
   REFRESH
============================================================ */

function setupRefresh() {

  $("#refreshButton")
    .addEventListener(
      "click",
      async () => {

        await loadStories();

        toast(
          "StoryNest refreshed."
        );

      }
    );

}


/* ============================================================
   AUTOMATIC REFRESH
============================================================ */

function setupAutoRefresh() {

  const interval =
    STORYNEST_CONFIG
      .AUTO_REFRESH_MINUTES *
    60 *
    1000;

  setInterval(
    () => {

      loadStories();

    },
    interval
  );

}


/* ============================================================
   AUDIO PREFERENCE
============================================================ */

function loadAudioPreference() {

  const saved =
    localStorage.getItem(
      "storynest_audio_speed"
    );

  if (saved) {

    $("#audioSpeed").value =
      saved;

  }

}


/* ============================================================
   INITIALIZATION
============================================================ */

async function init() {

  setupTheme();

  setupNavigation();

  setupMobileMenu();

  setupSearch();

  setupSearchOverlay();

  setupFilters();

  setupAgeButtons();

  setupCategoryButtons();

  setupRefresh();

  setupAudioEvents();

  loadAudioPreference();

  setupAutoRefresh();

  await loadStories();

}


/* ============================================================
   START
============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  init
);
