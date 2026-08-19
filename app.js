/* ============================================================
   STORYNEST
   app.js

   Frontend API integration for:
   Google Apps Script + Google Sheets backend

   Existing API:
   https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec
============================================================ */


/* ============================================================
   CONFIGURATION
============================================================ */

const API_BASE =
  "https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec";


const CONFIG = {

  pageSize: 20,

  requestTimeout: 15000,

  refreshInterval: 5 * 60 * 1000,

  storagePrefix: "storynest_"

};


/* ============================================================
   STATE
============================================================ */

const state = {

  currentPage:
    "discover",

  currentStory:
    null,

  stories:
    [],

  allStories:
    [],

  featuredStories:
    [],

  latestStories:
    [],

  genres:
    new Set(),

  search:
    "",

  age:
    "",

  genre:
    "",

  page:
    1,

  hasMore:
    false,

  loading:
    false,

  audio:
    {
      story: null,
      sources: [],
      currentIndex: 0
    }

};


/* ============================================================
   DOM
============================================================ */

const $ = selector =>
  document.querySelector(selector);

const $$ = selector =>
  Array.from(document.querySelectorAll(selector));


const elements = {

  statusDot:
    $("#statusDot"),

  statusText:
    $("#statusText"),

  statusRefresh:
    $("#statusRefresh"),

  storyLibrary:
    $("#storyLibrary"),

  libraryCount:
    $("#libraryCount"),

  loadMoreButton:
    $("#loadMoreButton"),

  featuredStories:
    $("#featuredStories"),

  latestStories:
    $("#latestStories"),

  continueSection:
    $("#continueSection"),

  continueCard:
    $("#continueCard"),

  storyDetail:
    $("#storyDetail"),

  storyAudio:
    $("#storyAudio"),

  audioPlayer:
    $("#audioPlayer"),

  audioTitle:
    $("#audioTitle"),

  audioPlay:
    $("#audioPlay"),

  audioBack:
    $("#audioBack"),

  audioForward:
    $("#audioForward"),

  audioProgress:
    $("#audioProgress"),

  audioCurrentTime:
    $("#audioCurrentTime"),

  audioDuration:
    $("#audioDuration"),

  audioSpeed:
    $("#audioSpeed"),

  audioClose:
    $("#audioClose"),

  readingPanel:
    $("#readingPanel"),

  searchOverlay:
    $("#searchOverlay"),

  globalSearch:
    $("#globalSearch"),

  globalSearchResults:
    $("#globalSearchResults"),

  toast:
    $("#toast")

};


/* ============================================================
   INITIALIZATION
============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  init
);


async function init() {

  loadPreferences();

  setupNavigation();

  setupSearch();

  setupFilters();

  setupAudio();

  setupReadingControls();

  setupMenu();

  setupThemeButton();

  setupGlobalActions();

  setupKeyboardControls();

  renderContinueReading();

  await loadHomeData();

  startAutomaticRefresh();

}


/* ============================================================
   API
============================================================ */

async function apiRequest(
  action,
  params = {}
) {

  const url =
    new URL(API_BASE);

  url.searchParams.set(
    "action",
    action
  );

  Object.entries(params).forEach(
    ([key, value]) => {

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

    }
  );


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      CONFIG.requestTimeout
    );


  try {

    const response =
      await fetch(
        url.toString(),
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    if (
      data &&
      data.success === false
    ) {

      throw new Error(
        data.message ||
        data.error ||
        "StoryNest API error"
      );

    }


    return data;

  } catch (error) {

    if (
      error.name ===
      "AbortError"
    ) {

      throw new Error(
        "StoryNest request timed out."
      );

    }

    throw error;

  } finally {

    clearTimeout(timeout);

  }

}


/* ============================================================
   HOME DATA
============================================================ */

async function loadHomeData() {

  setStatus(
    "loading",
    "Connecting to StoryNest..."
  );


  try {

    const response =
      await apiRequest(
        "stories",
        {
          page: 1,
          pageSize: 50
        }
      );


    const stories =
      normalizeStories(
        response?.data
      );


    state.allStories =
      stories;

    state.stories =
      stories;


    collectGenres(
      stories
    );


    state.featuredStories =
      stories.filter(
        story =>
          story.featured
      );


    state.latestStories =
      [...stories]
        .sort(
          (a, b) =>
            dateValue(b.published_at) -
            dateValue(a.published_at)
        )
        .slice(0, 6);


    renderFeatured();

    renderLatest();

    populateGenreFilter();

    renderLibrary();

    setStatus(
      "online",
      `${stories.length} ${
        stories.length === 1
          ? "story"
          : "stories"
      } available`
    );


    return stories;

  } catch (error) {

    console.error(
      "StoryNest load error:",
      error
    );


    setStatus(
      "error",
      "Unable to connect to StoryNest"
    );


    renderError(
      elements.featuredStories,
      error
    );

    renderError(
      elements.latestStories,
      error
    );

    renderError(
      elements.storyLibrary,
      error
    );

  }

}


/* ============================================================
   NORMALIZATION
============================================================ */

function normalizeStories(
  input
) {

  if (!Array.isArray(input)) {
    return [];
  }


  return input.map(
    normalizeStory
  );

}


function normalizeStory(
  raw = {}
) {

  return {

    story_id:
      raw.story_id ||
      raw.id ||
      "",

    slug:
      raw.slug ||
      slugify(
        raw.title ||
        ""
      ),

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
      raw.category ||
      "",

    genre_id:
      raw.genre_id ||
      raw.genre ||
      "",

    genre:
      raw.genre ||
      raw.genre_name ||
      raw.genre_id ||
      "",

    category:
      raw.category ||
      raw.category_name ||
      raw.category_id ||
      "",

    age_min:
      toNumber(
        raw.age_min,
        0
      ),

    age_max:
      toNumber(
        raw.age_max,
        0
      ),

    reading_level:
      raw.reading_level ||
      "",

    reading_time:
      toNumber(
        raw.reading_time,
        0
      ),

    language:
      raw.language ||
      "English",

    author_name:
      raw.author_name ||
      "StoryNest Originals",

    series_id:
      raw.series_id ||
      "",

    episode_number:
      toNumber(
        raw.episode_number,
        0
      ),

    featured:
      toBoolean(
        raw.featured
      ),

    audio_available:
      toBoolean(
        raw.audio_available
      ),

    published_at:
      raw.published_at ||
      "",

    content:
      raw.content ||
      null,

    characters:
      raw.characters ||
      [],

    audio:
      raw.audio ||
      [],

    media:
      raw.media ||
      []

  };

}


/* ============================================================
   STORY DETAIL
============================================================ */

async function openStory(
  identifier
) {

  showPage(
    "story"
  );


  elements.storyDetail.innerHTML =
    loadingStoryMarkup();


  try {

    const response =
      await apiRequest(
        "story",
        {
          slug:
            identifier
        }
      );


    const payload =
      response?.story ||
      response?.data ||
      response;


    const storyBase =
      normalizeStory(
        payload?.story ||
        payload
      );


    const story = {

      ...storyBase,

      content:
        payload?.content ??
        storyBase.content,

      characters:
        normalizeCharacters(
          payload?.characters
        ),

      audio:
        normalizeAudio(
          payload?.audio
        ),

      media:
        payload?.media ||
        []

    };


    state.currentStory =
      story;


    saveLastStory(
      story
    );


    renderStory(
      story
    );


    setupStoryAudio(
      story
    );


    updateReadingProgress(
      story
    );


    window.scrollTo(
      {
        top: 0,
        behavior: "smooth"
      }
    );

  } catch (error) {

    console.error(
      "Story detail error:",
      error
    );


    elements.storyDetail.innerHTML =
      errorStoryMarkup(
        error
      );

  }

}


/* ============================================================
   STORY CONTENT NORMALIZATION
============================================================ */

function normalizeContent(
  content
) {

  if (!content) {
    return "";
  }


  if (
    typeof content ===
    "string"
  ) {

    return safeTextToParagraphs(
      content
    );

  }


  if (
    Array.isArray(content)
  ) {

    return content
      .map(
        item => {

          if (
            typeof item ===
            "string"
          ) {
            return item;
          }

          return (
            item.text ||
            item.content ||
            item.paragraph ||
            ""
          );

        }
      )
      .filter(Boolean)
      .map(
        text =>
          `<p>${escapeHTML(
            text
          )}</p>`
      )
      .join("");

  }


  if (
    typeof content ===
    "object"
  ) {

    if (
      Array.isArray(
        content.paragraphs
      )
    ) {

      return normalizeContent(
        content.paragraphs
      );

    }


    if (
      Array.isArray(
        content.sections
      )
    ) {

      return content.sections
        .map(
          section => {

            const heading =
              section.heading
                ? `<h3>${escapeHTML(
                    section.heading
                  )}</h3>`
                : "";

            const body =
              normalizeContent(
                section.text ||
                section.content ||
                section.paragraphs
              );

            return heading + body;

          }
        )
        .join("");

    }


    const text =
      content.text ||
      content.body ||
      content.story ||
      content.content ||
      "";


    if (text) {

      return safeTextToParagraphs(
        text
      );

    }

  }


  return "";

}


function safeTextToParagraphs(
  text
) {

  return String(text)
    .split(
      /\n\s*\n|\r\n\s*\r\n/
    )
    .map(
      paragraph =>
        paragraph.trim()
    )
    .filter(Boolean)
    .map(
      paragraph =>
        `<p>${escapeHTML(
          paragraph
        )}</p>`
    )
    .join("");

}


/* ============================================================
   STORY RENDER
============================================================ */

function renderStory(
  story
) {

  const contentHTML =
    normalizeContent(
      story.content
    );


  const hasContent =
    contentHTML.trim().length > 0;


  const characters =
    renderCharacters(
      story.characters
    );


  const reflection =
    extractReflection(
      story
    );


  const audioAvailable =
    story.audio_available ||
    story.audio.length > 0;


  elements.storyDetail.innerHTML = `

    <article>

      <header class="story-header">

        <span class="original-label">
          StoryNest Original
        </span>

        <h1>
          ${escapeHTML(
            story.title
          )}
        </h1>

        ${
          story.subtitle
            ? `
              <p class="story-subtitle">
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
              <p class="story-description">
                ${escapeHTML(
                  story.description
                )}
              </p>
            `
            : ""
        }

        <div class="story-metadata">

          <span>
            ${formatGenre(
              story.genre
            )}
          </span>

          <span>·</span>

          <span>
            Ages ${formatAgeRange(
              story.age_min,
              story.age_max
            )}
          </span>

          ${
            story.reading_time
              ? `
                <span>·</span>
                <span>
                  ${story.reading_time} min read
                </span>
              `
              : ""
          }

          ${
            story.language
              ? `
                <span>·</span>
                <span>
                  ${escapeHTML(
                    story.language
                  )}
                </span>
              `
              : ""
          }

        </div>


        <div class="story-actions">

          <button
            type="button"
            class="story-read-button"
            data-story-action="read"
          >
            Read Story
          </button>

          ${
            audioAvailable
              ? `
                <button
                  type="button"
                  data-story-action="listen"
                >
                  ♪ Listen
                </button>

                <button
                  type="button"
                  data-story-action="readlisten"
                >
                  Read + Listen
                </button>
              `
              : ""
          }

          <button
            type="button"
            data-story-action="bookmark"
          >
            ${isBookmarked(
              story.story_id
            )
              ? "★ Saved"
              : "☆ Save"}
          </button>

          <button
            type="button"
            data-story-action="settings"
          >
            Aa
          </button>

        </div>

      </header>


      <div class="reading-toolbar">

        <div class="reading-toolbar-inner">

          <button
            type="button"
            data-story-action="settings"
          >
            Aa Reading settings
          </button>

          ${
            audioAvailable
              ? `
                <button
                  type="button"
                  data-story-action="listen"
                >
                  ♪ Listen
                </button>
              `
              : ""
          }

          <button
            type="button"
            data-story-action="bookmark"
          >
            ${isBookmarked(
              story.story_id
            )
              ? "★ Saved"
              : "☆ Save"}
          </button>

        </div>

      </div>


      <div
        class="story-reading-area"
        id="storyReadingArea"
      >

        ${
          hasContent
            ? addParagraphClasses(
                contentHTML
              )
            : `
              <div class="empty-card">
                <strong>
                  This story is being prepared.
                </strong>
                <p>
                  The story content has not been published yet.
                </p>
              </div>
            `
        }

      </div>


      <section class="story-after">

        <div class="story-after-grid">

          ${
            characters
              ? `
                <div class="info-panel">
                  <h3>Meet the characters</h3>
                  ${characters}
                </div>
              `
              : ""
          }


          <div class="info-panel">

            <h3>Think about it</h3>

            <p>
              ${escapeHTML(
                reflection.question ||
                "What did this story make you think about?"
              )}
            </p>

          </div>


          <div class="info-panel">

            <h3>Try this</h3>

            <p>
              ${escapeHTML(
                reflection.activity ||
                "Create something inspired by the story."
              )}
            </p>

          </div>


          ${
            story.description
              ? `
                <div class="info-panel">

                  <h3>What this story explores</h3>

                  <p>
                    ${escapeHTML(
                      story.description
                    )}
                  </p>

                </div>
              `
              : ""
          }

        </div>


        <div class="keep-reading">

          <span class="eyebrow">
            Keep reading
          </span>

          <h2>
            Another story is waiting.
          </h2>

          <p>
            Continue exploring original stories
            created by StoryNest.
          </p>

          <button
            type="button"
            class="primary-button"
            data-nav="stories"
          >
            Browse stories →
          </button>

        </div>

      </section>

    </article>
  `;


  bindStoryActions();


  observeReadingProgress();

}


/* ============================================================
   STORY ACTIONS
============================================================ */

function bindStoryActions() {

  $$(
    "[data-story-action]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const action =
            button.dataset.storyAction;


          switch(action) {

            case "read":

              scrollToStory();
              break;


            case "listen":

              startStoryAudio();
              break;


            case "readlisten":

              scrollToStory();

              setTimeout(
                () =>
                  startStoryAudio(),
                250
              );

              break;


            case "bookmark":

              toggleBookmark(
                state.currentStory
              );

              refreshStoryActionButtons();

              break;


            case "settings":

              openReadingPanel();
              break;

          }

        }
      );

    }
  );

}


function scrollToStory() {

  const area =
    $("#storyReadingArea");

  if (!area) return;


  area.scrollIntoView(
    {
      behavior: "smooth",
      block: "start"
    }
  );

}


/* ============================================================
   CHARACTER NORMALIZATION
============================================================ */

function normalizeCharacters(
  characters
) {

  if (
    typeof characters ===
    "string"
  ) {

    try {

      characters =
        JSON.parse(
          characters
        );

    } catch {

      return [];

    }

  }


  if (
    !Array.isArray(
      characters
    )
  ) {

    return [];

  }


  return characters
    .map(
      character => {

        if (
          typeof character ===
          "string"
        ) {

          return {
            name:
              character,
            role:
              ""
          };

        }


        return {

          name:
            character.name ||
            character.character ||
            "",

          role:
            character.role ||
            character.description ||
            ""

        };

      }
    )
    .filter(
      character =>
        character.name
    );

}


function renderCharacters(
  characters
) {

  if (
    !characters ||
    !characters.length
  ) {

    return "";

  }


  return `

    <div class="character-list">

      ${characters
        .map(
          character => `

            <div class="character">

              <strong>
                ${escapeHTML(
                  character.name
                )}
              </strong>

              ${
                character.role
                  ? `
                    <span>
                      ${escapeHTML(
                        character.role
                      )}
                    </span>
                  `
                  : ""
              }

            </div>

          `
        )
        .join("")}

    </div>

  `;

}


/* ============================================================
   REFLECTION
============================================================ */

function extractReflection(
  story
) {

  const content =
    story.content;


  const question =
    story.question ||
    story.think_about ||
    story.reflection_question ||
    "";


  const activity =
    story.activity ||
    story.try_this ||
    story.reflection_activity ||
    "";


  if (
    question ||
    activity
  ) {

    return {
      question,
      activity
    };

  }


  if (
    typeof content ===
    "object" &&
    content
  ) {

    return {

      question:
        content.question ||
        content.think_about ||
        "",

      activity:
        content.activity ||
        content.try_this ||
        ""

    };

  }


  return {
    question: "",
    activity: ""
  };

}


/* ============================================================
   AUDIO
============================================================ */

function normalizeAudio(
  audio
) {

  if (!audio) {
    return [];
  }


  if (
    typeof audio ===
    "string"
  ) {

    try {

      audio =
        JSON.parse(
          audio
        );

    } catch {

      return audio
        ? [{
            url: audio,
            title:
              "Story narration"
          }]
        : [];

    }

  }


  if (
    !Array.isArray(
      audio
    )
  ) {

    if (
      audio.url ||
      audio.audio_url ||
      audio.src
    ) {

      return [
        audio
      ];

    }

    return [];

  }


  return audio
    .map(
      item => {

        if (
          typeof item ===
          "string"
        ) {

          return {
            url:
              item,
            title:
              "Story narration"
          };

        }


        return {

          url:
            item.url ||
            item.audio_url ||
            item.src ||
            item.file_url ||
            "",

          title:
            item.title ||
            item.name ||
            "Story narration",

          paragraph:
            item.paragraph ||
            item.paragraph_index ||
            null,

          duration:
            item.duration ||
            null

        };

      }
    )
    .filter(
      item =>
        item.url
    );

}


function setupStoryAudio(
  story
) {

  stopAudio();


  state.audio.story =
    story;

  state.audio.sources =
    normalizeAudio(
      story.audio
    );

  state.audio.currentIndex =
    0;


  if (
    state.audio.sources.length
  ) {

    const source =
      state.audio.sources[0];


    elements.storyAudio.src =
      source.url;


    elements.audioTitle.textContent =
      story.title;


    showAudioPlayer();

  } else {

    hideAudioPlayer();

  }

}


function startStoryAudio() {

  const sources =
    state.audio.sources;


  if (
    !sources.length
  ) {

    showToast(
      "Audio narration is not available for this story yet."
    );

    return;

  }


  showAudioPlayer();


  if (
    !elements.storyAudio.src
  ) {

    loadCurrentAudioSource();

  }


  elements.storyAudio
    .play()
    .then(
      () => {

        updateAudioButton();

      }
    )
    .catch(
      error => {

        console.error(
          "Audio playback error:",
          error
        );

        showToast(
          "The narration could not be started."
        );

      }
    );

}


function loadCurrentAudioSource() {

  const source =
    state.audio.sources[
      state.audio.currentIndex
    ];


  if (!source) {
    return;
  }


  elements.storyAudio.src =
    source.url;

  elements.storyAudio.load();

  elements.audioTitle.textContent =
    source.title ||
    state.audio.story?.title ||
    "Story narration";

}


function playNextAudio() {

  const next =
    state.audio.currentIndex + 1;


  if (
    next >=
    state.audio.sources.length
  ) {

    elements.storyAudio.pause();

    elements.audioPlay.textContent =
      "▶";

    return;

  }


  state.audio.currentIndex =
    next;


  loadCurrentAudioSource();


  elements.storyAudio
    .play()
    .catch(
      () => {}
    );

}


function playPreviousAudio() {

  const previous =
    state.audio.currentIndex - 1;


  if (
    previous < 0
  ) {

    elements.storyAudio.currentTime =
      0;

    return;

  }


  state.audio.currentIndex =
    previous;


  loadCurrentAudioSource();


  elements.storyAudio
    .play()
    .catch(
      () => {}
    );

}


function setupAudio() {

  elements.audioPlay
    .addEventListener(
      "click",
      () => {

        if (
          !elements.storyAudio.src
        ) {

          startStoryAudio();

          return;

        }


        if (
          elements.storyAudio.paused
        ) {

          elements.storyAudio
            .play()
            .catch(
              () => {}
            );

        } else {

          elements.storyAudio.pause();

        }

      }
    );


  elements.audioForward
    .addEventListener(
      "click",
      playNextAudio
    );


  elements.audioBack
    .addEventListener(
      "click",
      playPreviousAudio
    );


  elements.storyAudio
    .addEventListener(
      "play",
      updateAudioButton
    );


  elements.storyAudio
    .addEventListener(
      "pause",
      updateAudioButton
    );


  elements.storyAudio
    .addEventListener(
      "timeupdate",
      updateAudioProgress
    );


  elements.storyAudio
    .addEventListener(
      "loadedmetadata",
      updateAudioDuration
    );


  elements.storyAudio
    .addEventListener(
      "ended",
      playNextAudio
    );


  elements.audioProgress
    .addEventListener(
      "input",
      () => {

        if (
          elements.storyAudio.duration
        ) {

          elements.storyAudio.currentTime =
            (
              Number(
                elements.audioProgress.value
              ) /
              100
            ) *
            elements.storyAudio.duration;

        }

      }
    );


  elements.audioSpeed
    .addEventListener(
      "change",
      () => {

        const speed =
          Number(
            elements.audioSpeed.value
          );


        elements.storyAudio.playbackRate =
          speed;


        localStorage.setItem(
          CONFIG.storagePrefix +
          "audio_speed",
          String(speed)
        );

      }
    );


  elements.audioClose
    .addEventListener(
      "click",
      () => {

        elements.storyAudio.pause();

        hideAudioPlayer();

      }
    );


  const savedSpeed =
    localStorage.getItem(
      CONFIG.storagePrefix +
      "audio_speed"
    );


  if (savedSpeed) {

    elements.audioSpeed.value =
      savedSpeed;

    elements.storyAudio.playbackRate =
      Number(
        savedSpeed
      );

  }

}


function updateAudioButton() {

  elements.audioPlay.textContent =
    elements.storyAudio.paused
      ? "▶"
      : "Ⅱ";

}


function updateAudioProgress() {

  const audio =
    elements.storyAudio;


  if (
    !audio.duration
  ) {

    return;

  }


  elements.audioProgress.value =
    (
      audio.currentTime /
      audio.duration
    ) *
    100;


  elements.audioCurrentTime.textContent =
    formatTime(
      audio.currentTime
    );


  highlightAudioParagraph();

}


function updateAudioDuration() {

  elements.audioDuration.textContent =
    formatTime(
      elements.storyAudio.duration
    );

}


function highlightAudioParagraph() {

  const source =
    state.audio.sources[
      state.audio.currentIndex
    ];


  if (
    !source ||
    source.paragraph === null ||
    source.paragraph === undefined
  ) {

    return;

  }


  const paragraphs =
    $$("#storyReadingArea .story-paragraph");


  paragraphs.forEach(
    paragraph =>
      paragraph.classList.remove(
        "audio-active"
      )
  );


  const index =
    Number(
      source.paragraph
    );


  if (
    paragraphs[index]
  ) {

    paragraphs[index]
      .classList.add(
        "audio-active"
      );

    paragraphs[index]
      .scrollIntoView(
        {
          behavior: "smooth",
          block: "center"
        }
      );

  }

}


function stopAudio() {

  if (
    !elements.storyAudio
  ) {

    return;

  }


  elements.storyAudio.pause();

  elements.storyAudio.removeAttribute(
    "src"
  );

  elements.storyAudio.load();

}


function showAudioPlayer() {

  elements.audioPlayer
    .classList.add(
      "visible"
    );

  elements.audioPlayer
    .setAttribute(
      "aria-hidden",
      "false"
    );

}


function hideAudioPlayer() {

  elements.audioPlayer
    .classList.remove(
      "visible"
    );

  elements.audioPlayer
    .setAttribute(
      "aria-hidden",
      "true"
    );

}


/* ============================================================
   NAVIGATION
============================================================ */

function setupNavigation() {

  $$(
    "[data-nav]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.nav;

          showPage(
            page
          );

          closeMobileMenu();

        }
      );

    }
  );


  document
    .querySelector(
      "[data-action='home']"
    )
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "discover"
        )
    );


  elements.statusRefresh
    ?.addEventListener(
      "click",
      loadHomeData
    );


  elements.backToStories =
    $("#backToStories");


  elements.backToStories
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "stories"
        )
    );

}


function showPage(
  page
) {

  state.currentPage =
    page;


  $$(".page-section")
    .forEach(
      section =>
        section.classList.remove(
          "active"
        )
    );


  const pageElement =
    $(
      page === "discover"
        ? "#discoverPage"
        : page === "stories"
        ? "#storiesPage"
        : page === "explore"
        ? "#explorePage"
        : "#storyPage"
    );


  pageElement
    ?.classList.add(
      "active"
    );


  $$(".nav-link")
    .forEach(
      link =>
        link.classList.toggle(
          "active",
          link.dataset.nav ===
            page
        )
    );


  window.scrollTo(
    {
      top: 0,
      behavior: "smooth"
    }
  );


  if (
    page === "stories"
  ) {

    renderLibrary();

  }


  if (
    page === "discover"
  ) {

    renderContinueReading();

  }

}


/* ============================================================
   SEARCH
============================================================ */

function setupSearch() {

  const input =
    $("#storySearch");

  const clear =
    $("#clearSearch");


  input?.addEventListener(
    "input",
    debounce(
      () => {

        state.search =
          input.value.trim();

        clear.hidden =
          !state.search;

        renderLibrary();

      },
      250
    )
  );


  clear?.addEventListener(
    "click",
    () => {

      input.value =
        "";

      state.search =
        "";

      clear.hidden =
        true;

      renderLibrary();

    }
  );


  elements.globalSearch
    ?.addEventListener(
      "input",
      debounce(
        performGlobalSearch,
        250
      )
    );


  $("#headerSearchButton")
    ?.addEventListener(
      "click",
      openSearchOverlay
    );


  $("#closeSearch")
    ?.addEventListener(
      "click",
      closeSearchOverlay
    );

}


function performGlobalSearch() {

  const query =
    elements.globalSearch
      ?.value
      ?.trim()
      ?.toLowerCase();


  if (!query) {

    elements.globalSearchResults.innerHTML =
      "";

    return;

  }


  const matches =
    state.allStories
      .filter(
        story => {

          const text =
            [
              story.title,
              story.subtitle,
              story.description,
              story.genre,
              story.category
            ]
              .join(" ")
              .toLowerCase();

          return text.includes(
            query
          );

        }
      )
      .slice(0, 8);


  if (!matches.length) {

    elements.globalSearchResults.innerHTML = `
      <div class="empty-card">
        No stories found for
        <strong>
          ${escapeHTML(query)}
        </strong>.
      </div>
    `;

    return;

  }


  elements.globalSearchResults.innerHTML =
    matches
      .map(
        story => `

          <div
            class="search-result"
            data-search-slug="${escapeAttribute(
              story.slug
            )}"
          >

            <strong>
              ${escapeHTML(
                story.title
              )}
            </strong>

            <div class="story-meta">

              <span>
                ${escapeHTML(
                  story.genre ||
                  "Story"
                )}
              </span>

              <span>
                Ages ${formatAgeRange(
                  story.age_min,
                  story.age_max
                )}
              </span>

            </div>

          </div>

        `
      )
      .join("");


  $$(
    "[data-search-slug]"
  ).forEach(
    result => {

      result.addEventListener(
        "click",
        () => {

          closeSearchOverlay();

          openStory(
            result.dataset.searchSlug
          );

        }
      );

    }
  );

}


function openSearchOverlay() {

  elements.searchOverlay
    .classList.add(
      "visible"
    );

  elements.searchOverlay
    .setAttribute(
      "aria-hidden",
      "false"
    );


  setTimeout(
    () =>
      elements.globalSearch
        ?.focus(),
    100
  );

}


function closeSearchOverlay() {

  elements.searchOverlay
    .classList.remove(
      "visible"
    );

  elements.searchOverlay
    .setAttribute(
      "aria-hidden",
      "true"
    );

}


/* ============================================================
   FILTERS
============================================================ */

function setupFilters() {

  $("#ageFilter")
    ?.addEventListener(
      "change",
      event => {

        state.age =
          event.target.value;

        state.page =
          1;

        renderLibrary();

      }
    );


  $("#genreFilter")
    ?.addEventListener(
      "change",
      event => {

        state.genre =
          event.target.value;

        state.page =
          1;

        renderLibrary();

      }
    );


  $("#resetFilters")
    ?.addEventListener(
      "click",
      () => {

        state.search =
          "";

        state.age =
          "";

        state.genre =
          "";


        $("#storySearch").value =
          "";

        $("#ageFilter").value =
          "";

        $("#genreFilter").value =
          "";


        $("#clearSearch").hidden =
          true;


        renderLibrary();

      }
    );


  $$(
    "[data-age]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          state.age =
            button.dataset.age;

          $("#ageFilter").value =
            state.age;

          showPage(
            "stories"
          );

          renderLibrary();

        }
      );

    }
  );


  $$(
    "[data-genre]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          state.genre =
            button.dataset.genre;

          $("#genreFilter").value =
            findGenreValue(
              state.genre
            );

          showPage(
            "stories"
          );

          renderLibrary();

        }
      );

    }
  );


  elements.loadMoreButton
    ?.addEventListener(
      "click",
      () => {

        state.page++;

        renderLibrary();

      }
    );

}


function populateGenreFilter() {

  const select =
    $("#genreFilter");


  if (!select) return;


  const current =
    state.genre;


  const genres =
    Array.from(
      state.genres
    )
      .filter(Boolean)
      .sort(
        localeCompareSafe
      );


  select.innerHTML =
    `<option value="">
      All genres
    </option>`;


  genres.forEach(
    genre => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        genre;

      option.textContent =
        genre;

      select.appendChild(
        option
      );

    }
  );


  select.value =
    current;

}


function findGenreValue(
  value
) {

  const match =
    Array.from(
      state.genres
    )
      .find(
        genre =>
          genre.toLowerCase() ===
          value.toLowerCase()
      );


  return match ||
    value;

}


/* ============================================================
   LIBRARY RENDERING
============================================================ */

function renderLibrary() {

  let stories =
    [...state.allStories];


  if (state.search) {

    const query =
      state.search.toLowerCase();


    stories =
      stories.filter(
        story => {

          const text =
            [
              story.title,
              story.subtitle,
              story.description,
              story.genre,
              story.category,
              story.author_name
            ]
              .join(" ")
              .toLowerCase();

          return text.includes(
            query
          );

        }
      );

  }


  if (state.age) {

    stories =
      stories.filter(
        story =>
          ageMatches(
            story,
            state.age
          )
      );

  }


  if (state.genre) {

    stories =
      stories.filter(
        story =>
          String(
            story.genre
          ).toLowerCase() ===
          state.genre.toLowerCase()
      );

  }


  state.stories =
    stories;


  const visible =
    stories.slice(
      0,
      state.page *
        CONFIG.pageSize
    );


  elements.libraryCount.textContent =
    `${stories.length} ${
      stories.length === 1
        ? "story"
        : "stories"
    } found`;


  if (!visible.length) {

    elements.storyLibrary.innerHTML = `
      <div class="empty-card">
        No stories match your search.
        <br><br>
        Try another title, genre or age group.
      </div>
    `;

    elements.loadMoreButton
      .classList.add(
        "hidden"
      );

    return;

  }


  elements.storyLibrary.innerHTML =
    visible
      .map(
        story =>
          storyCardMarkup(
            story
          )
      )
      .join("");


  bindStoryCards();


  const hasMore =
    visible.length <
    stories.length;


  elements.loadMoreButton
    .classList.toggle(
      "hidden",
      !hasMore
    );

}


function renderFeatured() {

  const stories =
    state.featuredStories.length
      ? state.featuredStories
      : state.allStories.slice(
          0,
          3
        );


  if (!stories.length) {

    elements.featuredStories.innerHTML =
      emptyMarkup(
        "No featured stories yet."
      );

    return;

  }


  elements.featuredStories.innerHTML =
    stories
      .slice(0, 3)
      .map(
        story =>
          storyCardMarkup(
            story
          )
      )
      .join("");


  bindStoryCards(
    elements.featuredStories
  );

}


function renderLatest() {

  if (
    !state.latestStories.length
  ) {

    elements.latestStories.innerHTML =
      emptyMarkup(
        "No stories available yet."
      );

    return;

  }


  elements.latestStories.innerHTML =
    state.latestStories
      .map(
        story =>
          compactStoryMarkup(
            story
          )
      )
      .join("");


  bindStoryCards(
    elements.latestStories
  );

}


function storyCardMarkup(
  story
) {

  const audio =
    story.audio_available
      ? "♪ Audio"
      : "";


  return `

    <article
      class="story-card"
      data-story-slug="${escapeAttribute(
        story.slug
      )}"
    >

      <div class="story-card-visual">

        <span class="story-number">
          ${escapeHTML(
            getStoryNumber(
              story
            )
          )}
        </span>

      </div>


      <div class="story-card-body">

        <h3>
          ${escapeHTML(
            story.title
          )}
        </h3>

        ${
          story.description
            ? `
              <p>
                ${escapeHTML(
                  truncate(
                    story.description,
                    120
                  )
                )}
              </p>
            `
            : ""
        }


        <div class="story-meta">

          ${
            story.genre
              ? `
                <span>
                  ${escapeHTML(
                    story.genre
                  )}
                </span>
              `
              : ""
          }

          <span>
            Ages ${formatAgeRange(
              story.age_min,
              story.age_max
            )}
          </span>

          ${
            story.reading_time
              ? `
                <span>
                  ${story.reading_time} min
                </span>
              `
              : ""
          }

          ${
            audio
              ? `
                <span>
                  ${audio}
                </span>
              `
              : ""
          }

        </div>

      </div>

      <button
        class="story-card-button"
        type="button"
        aria-label="Read ${escapeAttribute(
          story.title
        )}"
      ></button>

    </article>

  `;

}


function compactStoryMarkup(
  story
) {

  return `

    <article
      class="story-card"
      data-story-slug="${escapeAttribute(
        story.slug
      )}"
    >

      <div class="story-card-body">

        <span class="eyebrow">
          ${escapeHTML(
            story.genre ||
            "StoryNest Original"
          )}
        </span>

        <h3>
          ${escapeHTML(
            story.title
          )}
        </h3>

        <p>
          ${escapeHTML(
            truncate(
              story.description,
              150
            )
          )}
        </p>

        <div class="story-meta">

          <span>
            Ages ${formatAgeRange(
              story.age_min,
              story.age_max
            )}
          </span>

          ${
            story.reading_time
              ? `
                <span>
                  ${story.reading_time} min read
                </span>
              `
              : ""
          }

        </div>

      </div>

      <button
        class="story-card-button"
        type="button"
        aria-label="Read ${escapeAttribute(
          story.title
        )}"
      ></button>

    </article>

  `;

}


function bindStoryCards(
  container =
    document
) {

  container
    .querySelectorAll(
      "[data-story-slug]"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          event => {

            if (
              event.target.closest(
                "button"
              )
            ) {

              openStory(
                card.dataset.storySlug
              );

              return;

            }


            openStory(
              card.dataset.storySlug
            );

          }
        );

      }
    );

}


/* ============================================================
   CONTINUE READING
============================================================ */

function saveLastStory(
  story
) {

  localStorage.setItem(
    CONFIG.storagePrefix +
      "last_story",
    JSON.stringify(
      {
        story_id:
          story.story_id,

        slug:
          story.slug,

        title:
          story.title,

        subtitle:
          story.subtitle
      }
    )
  );

}


function renderContinueReading() {

  const saved =
    getLastStory();


  if (!saved) {

    elements.continueSection
      .classList.add(
        "hidden"
      );

    return;

  }


  const progress =
    getStoryProgress(
      saved.story_id
    );


  elements.continueSection
    .classList.remove(
      "hidden"
    );


  elements.continueCard.innerHTML = `

    <div class="continue-card">

      <div>

        <span class="eyebrow">
          Continue reading
        </span>

        <h3>
          ${escapeHTML(
            saved.title
          )}
        </h3>

        ${
          saved.subtitle
            ? `
              <p>
                ${escapeHTML(
                  saved.subtitle
                )}
              </p>
            `
            : ""
        }

        <div class="progress-bar">

          <div
            class="progress-fill"
            style="width:${progress}%"
          ></div>

        </div>

        <p style="margin-top:8px">
          ${progress}% complete
        </p>

      </div>


      <button
        type="button"
        class="primary-button"
        id="continueReadingButton"
      >
        Continue →
      </button>

    </div>

  `;


  $("#continueReadingButton")
    ?.addEventListener(
      "click",
      () =>
        openStory(
          saved.slug
        )
    );

}


/* ============================================================
   READING PROGRESS
============================================================ */

function observeReadingProgress() {

  const area =
    $("#storyReadingArea");


  if (!area) return;


  window.removeEventListener(
    "scroll",
    window.storyNestProgressHandler
  );


  window.storyNestProgressHandler =
    debounce(
      () => {

        if (
          !state.currentStory
        ) {

          return;

        }


        const rect =
          area.getBoundingClientRect();


        const total =
          area.scrollHeight;


        const viewport =
          window.innerHeight;


        const current =
          Math.max(
            0,
            Math.min(
              total - viewport,
              -rect.top
            )
          );


        const progress =
          total <= viewport
            ? 100
            : Math.round(
                (
                  current /
                  (
                    total -
                    viewport
                  )
                ) *
                100
              );


        saveStoryProgress(
          state.currentStory.story_id,
          progress
        );

      },
      200
    );


  window.addEventListener(
    "scroll",
    window.storyNestProgressHandler,
    {
      passive: true
    }
  );

}


function updateReadingProgress(
  story
) {

  const progress =
    getStoryProgress(
      story.story_id
    );


  if (
    progress >= 95
  ) {

    saveStoryProgress(
      story.story_id,
      100
    );

  }

}


function saveStoryProgress(
  id,
  progress
) {

  if (!id) return;


  localStorage.setItem(
    CONFIG.storagePrefix +
      "progress_" +
      id,
    String(
      Math.max(
        0,
        Math.min(
          100,
          progress
        )
      )
    )
  );

}


function getStoryProgress(
  id
) {

  if (!id) {
    return 0;
  }


  return Number(
    localStorage.getItem(
      CONFIG.storagePrefix +
        "progress_" +
        id
    )
  ) || 0;

}


/* ============================================================
   BOOKMARKS
============================================================ */

function toggleBookmark(
  story
) {

  if (!story?.story_id) {
    return;
  }


  const key =
    CONFIG.storagePrefix +
    "bookmarks";


  const bookmarks =
    JSON.parse(
      localStorage.getItem(
        key
      ) ||
      "[]"
    );


  const index =
    bookmarks.indexOf(
      story.story_id
    );


  if (
    index >= 0
  ) {

    bookmarks.splice(
      index,
      1
    );

    showToast(
      "Removed from saved stories."
    );

  } else {

    bookmarks.push(
      story.story_id
    );

    showToast(
      "Story saved."
    );

  }


  localStorage.setItem(
    key,
    JSON.stringify(
      bookmarks
    )
  );

}


function isBookmarked(
  id
) {

  if (!id) return false;


  const bookmarks =
    JSON.parse(
      localStorage.getItem(
        CONFIG.storagePrefix +
          "bookmarks"
      ) ||
      "[]"
    );


  return bookmarks.includes(
    id
  );

}


function refreshStoryActionButtons() {

  const story =
    state.currentStory;


  if (!story) return;


  $$(
    "[data-story-action='bookmark']"
  ).forEach(
    button => {

      button.textContent =
        isBookmarked(
          story.story_id
        )
          ? "★ Saved"
          : "☆ Save";

    }
  );

}


/* ============================================================
   READING SETTINGS
============================================================ */

function setupReadingControls() {

  $("#closeReadingPanel")
    ?.addEventListener(
      "click",
      closeReadingPanel
    );


  $$(
    "[data-font-size]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          setReadingClass(
            "font",
            button.dataset.fontSize
          );

        }
      );

    }
  );


  $$(
    "[data-reading-width]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          setReadingClass(
            "width",
            button.dataset.readingWidth
          );

        }
      );

    }
  );


  $$(
    "[data-reading-theme]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          setReadingTheme(
            button.dataset.readingTheme
          );

        }
      );

    }
  );

}


function openReadingPanel() {

  elements.readingPanel
    .classList.add(
      "visible"
    );

  elements.readingPanel
    .setAttribute(
      "aria-hidden",
      "false"
    );

}


function closeReadingPanel() {

  elements.readingPanel
    .classList.remove(
      "visible"
    );

  elements.readingPanel
    .setAttribute(
      "aria-hidden",
      "true"
    );

}


function setReadingClass(
  type,
  value
) {

  if (
    type ===
    "font"
  ) {

    document.body.classList.remove(
      "reading-small",
      "reading-medium",
      "reading-large"
    );


    document.body.classList.add(
      `reading-${value}`
    );


    localStorage.setItem(
      CONFIG.storagePrefix +
        "font_size",
      value
    );

  }


  if (
    type ===
    "width"
  ) {

    document.body.classList.remove(
      "reading-narrow",
      "reading-comfortable",
      "reading-wide"
    );


    document.body.classList.add(
      `reading-${value}`
    );


    localStorage.setItem(
      CONFIG.storagePrefix +
        "reading_width",
      value
    );

  }

}


function setReadingTheme(
  theme
) {

  document.body.classList.remove(
    "reading-warm",
    "reading-dark"
  );


  if (
    theme ===
    "warm"
  ) {

    document.body.classList.add(
      "reading-warm"
    );

  }


  if (
    theme ===
    "dark"
  ) {

    document.body.classList.add(
      "reading-dark"
    );

  }


  localStorage.setItem(
    CONFIG.storagePrefix +
      "reading_theme",
    theme
  );


  updateThemeIcon();

}


/* ============================================================
   PREFERENCES
============================================================ */

function loadPreferences() {

  const fontSize =
    localStorage.getItem(
      CONFIG.storagePrefix +
        "font_size"
    ) ||
    "medium";


  const width =
    localStorage.getItem(
      CONFIG.storagePrefix +
        "reading_width"
    ) ||
    "comfortable";


  const theme =
    localStorage.getItem(
      CONFIG.storagePrefix +
        "reading_theme"
    ) ||
    "light";


  setReadingClass(
    "font",
    fontSize
  );

  setReadingClass(
    "width",
    width
  );

  setReadingTheme(
    theme
  );

}


/* ============================================================
   THEME BUTTON
============================================================ */

function setupThemeButton() {

  $("#themeButton")
    ?.addEventListener(
      "click",
      () => {

        const current =
          localStorage.getItem(
            CONFIG.storagePrefix +
              "reading_theme"
          ) ||
          "light";


        const next =
          current === "light"
            ? "warm"
            : current === "warm"
            ? "dark"
            : "light";


        setReadingTheme(
          next
        );

      }
    );


  updateThemeIcon();

}


function updateThemeIcon() {

  const theme =
    localStorage.getItem(
      CONFIG.storagePrefix +
        "reading_theme"
    ) ||
    "light";


  const icon =
    theme === "dark"
      ? "●"
      : theme === "warm"
      ? "◒"
      : "◐";


  $("#themeIcon").textContent =
    icon;

}


/* ============================================================
   MENU
============================================================ */

function setupMenu() {

  $("#menuButton")
    ?.addEventListener(
      "click",
      () => {

        const nav =
          $("#mobileNav");

        const visible =
          nav.classList.toggle(
            "visible"
          );


        $("#menuButton")
          .setAttribute(
            "aria-expanded",
            String(
              visible
            )
          );

      }
    );

}


function closeMobileMenu() {

  $("#mobileNav")
    ?.classList.remove(
      "visible"
    );

  $("#menuButton")
    ?.setAttribute(
      "aria-expanded",
      "false"
    );

}


/* ============================================================
   GLOBAL ACTIONS
============================================================ */

function setupGlobalActions() {

  $("#surpriseButton")
    ?.addEventListener(
      "click",
      surpriseMe
    );

}


function surpriseMe() {

  if (
    !state.allStories.length
  ) {

    showToast(
      "Stories are still loading."
    );

    return;

  }


  const candidates =
    state.allStories.filter(
      story =>
        story.story_id
    );


  const random =
    candidates[
      Math.floor(
        Math.random() *
        candidates.length
      )
    ];


  if (random) {

    openStory(
      random.slug
    );

  }

}


/* ============================================================
   AUTOMATIC REFRESH
============================================================ */

function startAutomaticRefresh() {

  setInterval(
    async () => {

      if (
        state.currentPage ===
        "story"
      ) {

        return;

      }


      try {

        const response =
          await apiRequest(
            "stories",
            {
              page: 1,
              pageSize: 50
            }
          );


        const stories =
          normalizeStories(
            response?.data
          );


        state.allStories =
          stories;


        state.stories =
          stories;


        collectGenres(
          stories
        );


        state.featuredStories =
          stories.filter(
            story =>
              story.featured
          );


        state.latestStories =
          [...stories]
            .sort(
              (a, b) =>
                dateValue(
                  b.published_at
                ) -
                dateValue(
                  a.published_at
                )
            )
            .slice(0, 6);


        renderFeatured();

        renderLatest();

        populateGenreFilter();

        renderLibrary();


        setStatus(
          "online",
          "StoryNest updated"
        );

      } catch {

        // Keep existing content
        // if automatic refresh fails.

      }

    },
    CONFIG.refreshInterval
  );

}


/* ============================================================
   STATUS
============================================================ */

function setStatus(
  type,
  message
) {

  elements.statusDot
    .classList.remove(
      "online",
      "error"
    );


  if (
    type ===
    "online"
  ) {

    elements.statusDot
      .classList.add(
        "online"
      );

  }


  if (
    type ===
    "error"
  ) {

    elements.statusDot
      .classList.add(
        "error"
      );

  }


  elements.statusText.textContent =
    message;

}


/* ============================================================
   KEYBOARD
============================================================ */

function setupKeyboardControls() {

  document.addEventListener(
    "keydown",
    event => {

      const tag =
        document.activeElement
          ?.tagName;


      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      ) {

        return;

      }


      if (
        event.code ===
        "Space" &&
        state.audio.story
      ) {

        event.preventDefault();


        if (
          elements.storyAudio.paused
        ) {

          startStoryAudio();

        } else {

          elements.storyAudio.pause();

        }

      }


      if (
        event.key ===
        "Escape"
      ) {

        closeSearchOverlay();

        closeReadingPanel();

      }

    }
  );

}


/* ============================================================
   ERROR / LOADING
============================================================ */

function loadingStoryMarkup() {

  return `

    <div class="loading-card">
      Loading story...
    </div>

  `;

}


function errorStoryMarkup(
  error
) {

  return `

    <div class="error-card">

      <strong>
        We couldn't load this story.
      </strong>

      <p>
        ${
          escapeHTML(
            error?.message ||
            "Please try again."
          )
        }
      </p>

      <button
        type="button"
        class="secondary-button"
        onclick="location.reload()"
      >
        Retry
      </button>

    </div>

  `;

}


function renderError(
  container,
  error
) {

  if (!container) return;


  container.innerHTML = `

    <div class="error-card">

      <strong>
        StoryNest couldn't load the content.
      </strong>

      <p>
        ${escapeHTML(
          error?.message ||
          "Please try again."
        )}
      </p>

      <button
        type="button"
        class="secondary-button"
        onclick="location.reload()"
      >
        Retry
      </button>

    </div>

  `;

}


function emptyMarkup(
  message
) {

  return `

    <div class="empty-card">
      ${escapeHTML(
        message
      )}
    </div>

  `;

}


/* ============================================================
   HELPERS
============================================================ */

function escapeHTML(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function escapeAttribute(
  value
) {

  return escapeHTML(
    value
  );

}


function slugify(
  value
) {

  return String(
    value ||
    ""
  )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );

}


function toNumber(
  value,
  fallback = 0
) {

  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : fallback;

}


function toBoolean(
  value
) {

  if (
    typeof value ===
    "boolean"
  ) {

    return value;

  }


  return [
    "true",
    "1",
    "yes",
    "y"
  ].includes(
    String(
      value
    )
      .trim()
      .toLowerCase()
  );

}


function dateValue(
  value
) {

  const time =
    Date.parse(
      value ||
      ""
    );


  return Number.isNaN(
    time
  )
    ? 0
    : time;

}


function formatAgeRange(
  min,
  max
) {

  const minimum =
    toNumber(
      min,
      0
    );


  const maximum =
    toNumber(
      max,
      0
    );


  if (
    maximum === 0
  ) {

    return `${minimum}+`;

  }


  return `${minimum}–${maximum}`;

}


function formatGenre(
  genre
) {

  if (!genre) {
    return "Original story";
  }


  return escapeHTML(
    String(
      genre
    )
      .replace(
        /^GEN\d+$/i,
        "Story"
      )
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


  const total =
    Math.max(
      0,
      Math.floor(
        seconds
      )
    );


  const minutes =
    Math.floor(
      total / 60
    );


  const secs =
    total % 60;


  return `${minutes}:${String(
    secs
  ).padStart(
    2,
    "0"
  )}`;

}


function truncate(
  value,
  length
) {

  const text =
    String(
      value ||
      ""
    );


  if (
    text.length <=
    length
  ) {

    return text;

  }


  return (
    text.slice(
      0,
      length
    ).trim() +
    "..."
  );

}


function ageMatches(
  story,
  selectedAge
) {

  const match =
    String(
      selectedAge
    ).match(
      /(\d+)\s*-\s*(\d+)|(\d+)\+/
    );


  if (!match) {
    return true;
  }


  let targetMin;
  let targetMax;


  if (
    match[3]
  ) {

    targetMin =
      Number(
        match[3]
      );

    targetMax =
      Infinity;

  } else {

    targetMin =
      Number(
        match[1]
      );

    targetMax =
      Number(
        match[2]
      );

  }


  const storyMin =
    toNumber(
      story.age_min,
      0
    );


  const storyMax =
    toNumber(
      story.age_max,
      Infinity
    );


  return (
    storyMin <=
      targetMax &&
    storyMax >=
      targetMin
  );

}


function getStoryNumber(
  story
) {

  const id =
    String(
      story.story_id ||
      ""
    );


  const number =
    id.match(
      /(\d+)$/
    );


  if (number) {

    return number[1]
      .padStart(
        2,
        "0"
      );

  }


  return "01";

}


function collectGenres(
  stories
) {

  state.genres =
    new Set();


  stories.forEach(
    story => {

      if (
        story.genre
      ) {

        state.genres.add(
          String(
            story.genre
          )
            .trim()
        );

      }

    }
  );

}


function localeCompareSafe(
  a,
  b
) {

  return String(a)
    .localeCompare(
      String(b)
    );

}


function getLastStory() {

  try {

    return JSON.parse(
      localStorage.getItem(
        CONFIG.storagePrefix +
          "last_story"
      ) ||
      "null"
    );

  } catch {

    return null;

  }

}


function addParagraphClasses(
  html
) {

  let index =
    0;


  return html.replace(
    /<p(\s[^>]*)?>/gi,
    match => {

      const result =
        `<p class="story-paragraph" data-paragraph-index="${index}">`;

      index++;

      return result;

    }
  );

}


function debounce(
  fn,
  delay
) {

  let timer;


  return function(
    ...args
  ) {

    clearTimeout(
      timer
    );


    timer =
      setTimeout(
        () =>
          fn.apply(
            this,
            args
          ),
        delay
      );

  };

}


function showToast(
  message
) {

  elements.toast.textContent =
    message;


  elements.toast
    .classList.add(
      "visible"
    );


  clearTimeout(
    window.storyNestToastTimer
  );


  window.storyNestToastTimer =
    setTimeout(
      () =>
        elements.toast
          .classList.remove(
            "visible"
          ),
      2500
    );

}


/* ============================================================
   EXPORT FOR DEBUGGING
============================================================ */

window.StoryNest = {

  state,

  apiRequest,

  openStory,

  showPage,

  loadHomeData,

  surpriseMe

};
