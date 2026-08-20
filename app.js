/* ============================================================
   STORYNEST
   app.js
   Version: 2.0.0

   GitHub Pages frontend
   Google Apps Script + Google Sheets backend

   IMPORTANT:
   This version maps the current StoryNest CONTENT sheet
   directly:

   story
   lesson
   reflection
   discussion
   activity
   characters
   audio_available
   audio_url
   cover_image
============================================================ */


/* ============================================================
   1. CONFIGURATION
============================================================ */

const API_BASE =
  "https://script.google.com/macros/s/AKfycbz4IKVE7jINJwwlT_9V4fZph9jbzlFiUbEOMBFIzics5nlVtDaf9l2kridmaodDkGj9/exec"


const CONFIG = {

  pageSize: 20,

  requestTimeout: 15000,

  refreshInterval:
    5 * 60 * 1000,

  storagePrefix:
    "storynest_"

};


/* ============================================================
   2. APPLICATION STATE
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

  categories:
    new Set(),

  search:
    "",

  age:
    "",

  genre:
    "",

  page:
    1,

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
   3. DOM HELPERS
============================================================ */

const $ =
  selector =>
    document.querySelector(selector);


const $$ =
  selector =>
    Array.from(
      document.querySelectorAll(selector)
    );


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
    $("#toast"),

  backToStories:
    $("#backToStories")

};


/* ============================================================
   4. INITIALIZATION
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
   5. API
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

  Object.entries(
    params
  ).forEach(
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

    clearTimeout(
      timeout
    );

  }

}


/* ============================================================
   6. HOME DATA
============================================================ */

async function loadHomeData() {

  setStatus(
    "loading",
    "Connecting to StoryNest..."
  );


  state.loading =
    true;


  try {

    const response =
      await apiRequest(
        "stories",
        {
          page: 1,
          pageSize: 100
        }
      );


    const stories =
      normalizeStories(
        response?.data ||
        []
      );


    state.allStories =
      stories;


    state.stories =
      stories;


    collectTaxonomy(
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
        .slice(
          0,
          6
        );


    renderFeatured();

    renderLatest();

    populateGenreFilter();

    renderLibrary();

    renderContinueReading();


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


    return [];


  } finally {

    state.loading =
      false;

  }

}


/* ============================================================
   7. NORMALIZATION
============================================================ */

function normalizeStories(
  input
) {

  if (
    !Array.isArray(
      input
    )
  ) {

    return [];

  }


  return input.map(
    normalizeStory
  );

}


/*
 * This is the critical correction.
 *
 * The backend CONTENT sheet has:
 *
 * story
 * lesson
 * reflection
 * discussion
 * activity
 *
 * They are now preserved directly.
 */
function normalizeStory(
  raw = {}
) {

  const contentObject =
    raw.content &&
    typeof raw.content ===
      "object"
      ? raw.content
      : null;


  const storyText =
    firstValue(
      raw.story,
      raw.story_text,
      contentObject?.story_text,
      contentObject?.story,
      contentObject?.text,
      contentObject?.body,
      ""
    );


  const lesson =
    firstValue(
      raw.lesson,
      contentObject?.lesson,
      ""
    );


  const reflection =
    firstValue(
      raw.reflection,
      contentObject?.reflection,
      ""
    );


  const discussion =
    firstValue(
      raw.discussion,
      contentObject?.discussion,
      ""
    );


  const activity =
    firstValue(
      raw.activity,
      raw.try_this,
      contentObject?.activity,
      contentObject?.try_this,
      ""
    );


  const characters =
    normalizeCharacters(
      raw.characters ||
      contentObject?.characters ||
      []
    );


  const audioSources =
    normalizeAudio(
      raw.audio ||
      raw.audio_url ||
      contentObject?.audio ||
      contentObject?.audio_url ||
      []
    );


  const coverImage =
    firstValue(
      raw.cover_image,
      raw.media?.cover_image,
      contentObject?.cover_image,
      ""
    );


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

    category:
      raw.category ||
      raw.category_name ||
      raw.category_id ||
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

    status:
      raw.status ||
      "PUBLISHED",

    audio_available:
      toBoolean(
        raw.audio_available
      ) ||
      audioSources.length > 0,

    audio_url:
      raw.audio_url ||
      "",

    audio:
      audioSources,

    cover_image:
      coverImage,

    tags:
      normalizeTags(
        raw.tags
      ),

    rights_type:
      raw.rights_type ||
      "",

    rights_status:
      raw.rights_status ||
      "",

    published_at:
      raw.published_at ||
      "",

    created_at:
      raw.created_at ||
      "",

    updated_at:
      raw.updated_at ||
      "",

    /*
     * ORIGINAL CONTENT FIELDS
     */
    story:
      storyText,

    lesson:
      lesson,

    reflection:
      reflection,

    discussion:
      discussion,

    activity:
      activity,

    characters:
      characters,

    /*
     * Compatibility object.
     *
     * This means old UI code expecting
     * story.content.story_text will
     * also continue to work.
     */
    content: {

      introduction:
        raw.description ||
        "",

      story_text:
        storyText,

      lesson:
        lesson,

      reflection:
        reflection,

      discussion:
        discussion,

      creative_activity:
        activity

    }

  };

}


/* ============================================================
   8. STORY DETAIL
============================================================ */

async function openStory(
  identifier
) {

  if (!identifier) {
    return;
  }


  showPage(
    "story"
  );


  if (
    elements.storyDetail
  ) {

    elements.storyDetail.innerHTML =
      loadingStoryMarkup();

  }


  try {

    const response =
      await apiRequest(
        "story",
        {
          slug:
            identifier
        }
      );


    /*
     * Current backend response:
     *
     * {
     *   success: true,
     *   story: {
     *     story: {...},
     *     content: {...},
     *     characters: [...],
     *     audio: {...},
     *     media: {...}
     *   }
     * }
     */


    const payload =
      response?.story ||
      response?.data ||
      response;


    /*
     * Support both:
     *
     * payload.story
     *
     * and direct payload.
     */
    const rawStory =
      payload?.story ||
      payload;


    const storyBase =
      normalizeStory(
        rawStory
      );


    const story = {

      ...storyBase,

      /*
       * IMPORTANT:
       * Prefer direct CONTENT fields.
       */
      story:
        firstValue(
          rawStory?.story,
          rawStory?.story_text,
          payload?.content?.story_text,
          storyBase.story,
          ""
        ),

      lesson:
        firstValue(
          rawStory?.lesson,
          payload?.content?.lesson,
          storyBase.lesson,
          ""
        ),

      reflection:
        firstValue(
          rawStory?.reflection,
          payload?.content?.reflection,
          storyBase.reflection,
          ""
        ),

      discussion:
        firstValue(
          rawStory?.discussion,
          payload?.content?.discussion,
          storyBase.discussion,
          ""
        ),

      activity:
        firstValue(
          rawStory?.activity,
          payload?.content?.creative_activity,
          payload?.content?.activity,
          storyBase.activity,
          ""
        ),

      characters:
        normalizeCharacters(
          rawStory?.characters ||
          payload?.characters ||
          storyBase.characters
        ),

      audio:
        normalizeAudio(
          rawStory?.audio ||
          rawStory?.audio_url ||
          payload?.audio ||
          storyBase.audio
        ),

      cover_image:
        firstValue(
          rawStory?.cover_image,
          payload?.media?.cover_image,
          storyBase.cover_image,
          ""
        )

    };


    /*
     * Rebuild compatibility content.
     */
    story.content = {

      introduction:
        story.description,

      story_text:
        story.story,

      lesson:
        story.lesson,

      reflection:
        story.reflection,

      discussion:
        story.discussion,

      creative_activity:
        story.activity

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


    if (
      elements.storyDetail
    ) {

      elements.storyDetail.innerHTML =
        errorStoryMarkup(
          error
        );

    }

  }

}


/* ============================================================
   9. CONTENT NORMALIZATION
============================================================ */

function normalizeContent(
  content
) {

  if (
    content ===
    null ||
    content ===
    undefined
  ) {

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
    Array.isArray(
      content
    )
  ) {

    return content
      .map(
        item => {

          if (
            typeof item ===
            "string"
          ) {

            return `<p>${escapeHTML(
              item
            )}</p>`;

          }


          const text =
            item?.text ||
            item?.content ||
            item?.paragraph ||
            item?.body ||
            "";


          return text
            ? `<p>${escapeHTML(
                text
              )}</p>`
            : "";

        }
      )
      .filter(Boolean)
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
              section?.heading
                ? `<h3>${escapeHTML(
                    section.heading
                  )}</h3>`
                : "";


            const body =
              normalizeContent(
                section?.text ||
                section?.content ||
                section?.paragraphs
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
      content.story_text ||
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


/* ============================================================
   10. SAFE PARAGRAPHS
============================================================ */

function safeTextToParagraphs(
  text
) {

  return String(
    text || ""
  )
    .replace(
      /\r\n/g,
      "\n"
    )
    .split(
      /\n\s*\n/
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
   11. STORY RENDER
============================================================ */

function renderStory(
  story
) {

  if (
    !elements.storyDetail
  ) {
    return;
  }


  const contentHTML =
    normalizeContent(
      story.story ||
      story.content?.story_text
    );


  const hasContent =
    contentHTML.trim().length >
    0;


  const characters =
    renderCharacters(
      story.characters
    );


  const audioAvailable =
    Boolean(
      story.audio_available ||
      story.audio?.length
    );


  const lessonHTML =
    renderInfoSection(
      "The lesson",
      story.lesson
    );


  const reflectionHTML =
    renderInfoSection(
      "Think about it",
      story.reflection
    );


  const discussionHTML =
    renderInfoSection(
      "Discuss",
      story.discussion
    );


  const activityHTML =
    renderInfoSection(
      "Try this",
      story.activity
    );


  const coverHTML =
    story.cover_image
      ? `
        <div class="story-cover-wrap">
          <img
            class="story-cover"
            src="${escapeAttribute(
              story.cover_image
            )}"
            alt="${escapeAttribute(
              story.title
            )} cover"
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.closest('.story-cover-wrap')?.remove()"
          >
        </div>
      `
      : "";


  elements.storyDetail.innerHTML = `

    <article>

      <header class="story-header">

        ${coverHTML}

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

          ${
            story.category
              ? `
                <span>
                  ${escapeHTML(
                    story.category
                  )}
                </span>

                <span>·</span>
              `
              : ""
          }

          ${
            story.genre
              ? `
                <span>
                  ${formatGenre(
                    story.genre
                  )}
                </span>

                <span>·</span>
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


        ${
          story.author_name
            ? `
              <p class="story-author">
                By
                <strong>
                  ${escapeHTML(
                    story.author_name
                  )}
                </strong>
              </p>
            `
            : ""
        }


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
            ${
              isBookmarked(
                story.story_id
              )
                ? "★ Saved"
                : "☆ Save"
            }
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
            ${
              isBookmarked(
                story.story_id
              )
                ? "★ Saved"
                : "☆ Save"
            }
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

                  <h3>
                    Meet the characters
                  </h3>

                  ${characters}

                </div>
              `
              : ""
          }


          ${lessonHTML}

          ${reflectionHTML}

          ${discussionHTML}

          ${activityHTML}


          ${
            story.description
              ? `
                <div class="info-panel">

                  <h3>
                    What this story explores
                  </h3>

                  <p>
                    ${escapeHTML(
                      story.description
                    )}
                  </p>

                </div>
              `
              : ""
          }


          ${
            story.rights_type ||
            story.rights_status
              ? `
                <div class="info-panel story-rights">

                  <h3>
                    StoryNest Original
                  </h3>

                  <p>
                    This story is presented as
                    original StoryNest content.
                  </p>

                  ${
                    story.rights_status
                      ? `
                        <small>
                          Rights status:
                          ${escapeHTML(
                            story.rights_status
                          )}
                        </small>
                      `
                      : ""
                  }

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
   12. INFORMATION SECTIONS
============================================================ */

function renderInfoSection(
  title,
  value
) {

  if (
    value ===
    null ||
    value ===
    undefined ||
    String(value).trim() === ""
  ) {

    return "";

  }


  return `

    <div class="info-panel">

      <h3>
        ${escapeHTML(
          title
        )}
      </h3>

      <div class="info-panel-content">
        ${normalizeContent(
          value
        )}
      </div>

    </div>

  `;

}


/* ============================================================
   13. STORY ACTIONS
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


          switch (
            action
          ) {

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


  if (!area) {
    return;
  }


  area.scrollIntoView(
    {
      behavior:
        "smooth",
      block:
        "start"
    }
  );

}


/* ============================================================
   14. CHARACTERS
============================================================ */

function normalizeCharacters(
  characters
) {

  if (
    !characters
  ) {

    return [];

  }


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

      return characters
        .split(",")
        .map(
          name => ({
            name:
              name.trim(),
            role:
              ""
          })
        )
        .filter(
          item =>
            item.name
        );

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
            character?.name ||
            character?.character ||
            "",

          role:
            character?.role ||
            character?.description ||
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
   15. AUDIO NORMALIZATION
============================================================ */

function normalizeAudio(
  audio
) {

  if (
    !audio
  ) {

    return [];

  }


  if (
    typeof audio ===
    "string"
  ) {

    const value =
      audio.trim();


    if (!value) {
      return [];
    }


    try {

      const parsed =
        JSON.parse(
          value
        );

      return normalizeAudio(
        parsed
      );

    } catch {

      return [

        {

          url:
            value,

          title:
            "Story narration"

        }

      ];

    }

  }


  /*
   * Backend may return:
   *
   * audio: {
   *   available: true,
   *   url: "..."
   * }
   */
  if (
    !Array.isArray(
      audio
    ) &&
    typeof audio ===
    "object"
  ) {

    if (
      audio.available === false &&
      !audio.url &&
      !audio.audio_url &&
      !audio.src
    ) {

      return [];

    }


    if (
      audio.url ||
      audio.audio_url ||
      audio.src
    ) {

      return [

        {

          url:
            audio.url ||
            audio.audio_url ||
            audio.src,

          title:
            audio.title ||
            audio.name ||
            "Story narration",

          paragraph:
            audio.paragraph ||
            null,

          duration:
            audio.duration ||
            null

        }

      ];

    }


    return [];

  }


  if (
    !Array.isArray(
      audio
    )
  ) {

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
            item?.url ||
            item?.audio_url ||
            item?.src ||
            item?.file_url ||
            "",

          title:
            item?.title ||
            item?.name ||
            "Story narration",

          paragraph:
            item?.paragraph ||
            item?.paragraph_index ||
            null,

          duration:
            item?.duration ||
            null

        };

      }
    )
    .filter(
      item =>
        item.url
    );

}


/* ============================================================
   16. AUDIO PLAYER
============================================================ */

function setupStoryAudio(
  story
) {

  stopAudio();


  state.audio.story =
    story;


  /*
   * First use explicit audio object.
   */
  let sources =
    normalizeAudio(
      story.audio
    );


  /*
   * If there is no audio object,
   * use CONTENT.audio_url.
   */
  if (
    !sources.length &&
    story.audio_url
  ) {

    sources =
      normalizeAudio(
        story.audio_url
      );

  }


  state.audio.sources =
    sources;


  state.audio.currentIndex =
    0;


  if (
    sources.length
  ) {

    loadCurrentAudioSource();

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


  if (
    !source
  ) {

    return;

  }


  elements.storyAudio.src =
    source.url;


  elements.storyAudio.load();


  elements.audioTitle.textContent =
    source.title ||
    state.audio.story?.title ||
    "Story narration";


  elements.storyAudio.playbackRate =
    getSavedAudioSpeed();

}


function playNextAudio() {

  const next =
    state.audio.currentIndex +
    1;


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
    state.audio.currentIndex -
    1;


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

  if (
    !elements.storyAudio
  ) {

    return;

  }


  elements.audioPlay
    ?.addEventListener(
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
    ?.addEventListener(
      "click",
      playNextAudio
    );


  elements.audioBack
    ?.addEventListener(
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


  elements.storyAudio
    .addEventListener(
      "error",
      () => {

        showToast(
          "The narration could not be loaded."
        );

      }
    );


  elements.audioProgress
    ?.addEventListener(
      "input",
      () => {

        if (
          Number.isFinite(
            elements.storyAudio.duration
          ) &&
          elements.storyAudio.duration >
          0
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
    ?.addEventListener(
      "change",
      () => {

        const speed =
          Number(
            elements.audioSpeed.value
          );


        if (
          Number.isFinite(
            speed
          )
        ) {

          elements.storyAudio.playbackRate =
            speed;


          localStorage.setItem(
            CONFIG.storagePrefix +
              "audio_speed",
            String(speed)
          );

        }

      }
    );


  elements.audioClose
    ?.addEventListener(
      "click",
      () => {

        elements.storyAudio.pause();

        hideAudioPlayer();

      }
    );


  const savedSpeed =
    getSavedAudioSpeed();


  if (
    elements.audioSpeed
  ) {

    elements.audioSpeed.value =
      String(
        savedSpeed
      );

  }


}


function getSavedAudioSpeed() {

  const value =
    Number(
      localStorage.getItem(
        CONFIG.storagePrefix +
          "audio_speed"
      )
    );


  return Number.isFinite(
    value
  )
    ? value
    : 1;

}


function updateAudioButton() {

  if (
    !elements.audioPlay ||
    !elements.storyAudio
  ) {

    return;

  }


  elements.audioPlay.textContent =
    elements.storyAudio.paused
      ? "▶"
      : "❚❚";

}


function updateAudioProgress() {

  if (
    !elements.storyAudio
  ) {

    return;

  }


  const duration =
    elements.storyAudio.duration;


  const current =
    elements.storyAudio.currentTime;


  if (
    elements.audioCurrentTime
  ) {

    elements.audioCurrentTime.textContent =
      formatTime(
        current
      );

  }


  if (
    elements.audioProgress
  ) {

    elements.audioProgress.value =
      duration
        ? (
            current /
            duration
          ) *
          100
        : 0;

  }

}


function updateAudioDuration() {

  const duration =
    elements.storyAudio?.duration;


  if (
    elements.audioDuration
  ) {

    elements.audioDuration.textContent =
      formatTime(
        duration
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


  if (
    elements.audioProgress
  ) {

    elements.audioProgress.value =
      0;

  }


  if (
    elements.audioCurrentTime
  ) {

    elements.audioCurrentTime.textContent =
      "0:00";

  }


  if (
    elements.audioDuration
  ) {

    elements.audioDuration.textContent =
      "0:00";

  }

}


function showAudioPlayer() {

  if (
    !elements.audioPlayer
  ) {

    return;

  }


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

  if (
    !elements.audioPlayer
  ) {

    return;

  }


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
   17. NAVIGATION
============================================================ */

function setupNavigation() {

  $$(
    "[data-nav]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          showPage(
            button.dataset.nav
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
   18. SEARCH
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

        if (clear) {

          clear.hidden =
            !state.search;

        }

        state.page =
          1;

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

      state.page =
        1;

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


  if (
    !query
  ) {

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

              story.category,

              story.genre,

              story.tags,

              story.author_name,

              story.story,

              story.lesson,

              story.reflection,

              story.discussion,

              story.activity

            ]
              .join(" ")
              .toLowerCase();


          return text.includes(
            query
          );

        }
      )
      .slice(
        0,
        8
      );


  if (
    !matches.length
  ) {

    elements.globalSearchResults.innerHTML = `

      <div class="empty-card">

        No stories found for
        <strong>
          ${escapeHTML(
            query
          )}
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
                  story.category ||
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
    ?.classList.add(
      "visible"
    );


  elements.searchOverlay
    ?.setAttribute(
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
    ?.classList.remove(
      "visible"
    );


  elements.searchOverlay
    ?.setAttribute(
      "aria-hidden",
      "true"
    );

}


/* ============================================================
   19. FILTERS
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

        state.page =
          1;


        const search =
          $("#storySearch");

        const age =
          $("#ageFilter");

        const genre =
          $("#genreFilter");

        const clear =
          $("#clearSearch");


        if (search) {
          search.value =
            "";
        }


        if (age) {
          age.value =
            "";
        }


        if (genre) {
          genre.value =
            "";
        }


        if (clear) {
          clear.hidden =
            true;
        }


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


          const filter =
            $("#ageFilter");


          if (filter) {

            filter.value =
              state.age;

          }


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


          const filter =
            $("#genreFilter");


          if (filter) {

            filter.value =
              findGenreValue(
                state.genre
              );

          }


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


  if (
    !select
  ) {

    return;

  }


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
    `
      <option value="">
        All genres
      </option>
    `;


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
          String(
            value
          ).toLowerCase()
      );


  return match ||
    value;

}


/* ============================================================
   20. LIBRARY
============================================================ */

function renderLibrary() {

  if (
    !elements.storyLibrary
  ) {

    return;

  }


  let stories =
    [...state.allStories];


  if (
    state.search
  ) {

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

              story.category,

              story.genre,

              story.tags,

              story.author_name,

              story.story,

              story.lesson,

              story.reflection

            ]
              .join(" ")
              .toLowerCase();


          return text.includes(
            query
          );

        }
      );

  }


  if (
    state.age
  ) {

    stories =
      stories.filter(
        story =>
          ageMatches(
            story,
            state.age
          )
      );

  }


  if (
    state.genre
  ) {

    stories =
      stories.filter(
        story =>
          String(
            story.genre
          )
            .toLowerCase() ===
          String(
            state.genre
          )
            .toLowerCase()
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


  if (
    elements.libraryCount
  ) {

    elements.libraryCount.textContent =
      `${stories.length} ${
        stories.length === 1
          ? "story"
          : "stories"
      } found`;

  }


  if (
    !visible.length
  ) {

    elements.storyLibrary.innerHTML = `

      <div class="empty-card">

        No stories match your search.

        <br><br>

        Try another title,
        genre or age group.

      </div>

    `;


    elements.loadMoreButton
      ?.classList.add(
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
    ?.classList.toggle(
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


  if (
    !stories.length
  ) {

    elements.featuredStories.innerHTML =
      emptyMarkup(
        "No featured stories yet."
      );

    return;

  }


  elements.featuredStories.innerHTML =
    stories
      .slice(
        0,
        3
      )
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


/* ============================================================
   21. STORY CARDS
============================================================ */

function storyCardMarkup(
  story
) {

  const audio =
    story.audio_available
      ? "♪ Audio"
      : "";


  const cover =
    story.cover_image
      ? `
        <div class="story-card-image">
          <img
            src="${escapeAttribute(
              story.cover_image
            )}"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.closest('.story-card-image')?.remove()"
          >
        </div>
      `
      : "";


  return `

    <article
      class="story-card"
      data-story-slug="${escapeAttribute(
        story.slug
      )}"
    >

      ${cover}

      <div class="story-card-body">

        <span class="eyebrow">

          ${escapeHTML(
            story.genre ||
            story.category ||
            "StoryNest Original"
          )}

        </span>


        <h3>
          ${escapeHTML(
            story.title
          )}
        </h3>


        ${
          story.subtitle
            ? `
              <p>
                ${escapeHTML(
                  story.subtitle
                )}
              </p>
            `
            : `
              <p>
                ${escapeHTML(
                  truncate(
                    story.description,
                    140
                  )
                )}
              </p>
            `
        }


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
            story.category ||
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
  container = document
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

            /*
             * The whole card is clickable.
             */
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
   22. CONTINUE READING
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


function renderContinueReading() {

  if (
    !elements.continueSection ||
    !elements.continueCard
  ) {

    return;

  }


  const saved =
    getLastStory();


  if (
    !saved
  ) {

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
   23. READING PROGRESS
============================================================ */

function observeReadingProgress() {

  const area =
    $("#storyReadingArea");


  if (
    !area
  ) {

    return;

  }


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
              total -
                viewport,
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

  if (
    !id
  ) {

    return;

  }


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

  if (
    !id
  ) {

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
   24. BOOKMARKS
============================================================ */

function toggleBookmark(
  story
) {

  if (
    !story?.story_id
  ) {

    return;

  }


  const key =
    CONFIG.storagePrefix +
    "bookmarks";


  let bookmarks;


  try {

    bookmarks =
      JSON.parse(
        localStorage.getItem(
          key
        ) ||
        "[]"
      );

  } catch {

    bookmarks =
      [];

  }


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

  if (
    !id
  ) {

    return false;

  }


  try {

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

  } catch {

    return false;

  }

}


function refreshStoryActionButtons() {

  const story =
    state.currentStory;


  if (
    !story
  ) {

    return;

  }


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
   25. READING SETTINGS
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
    ?.classList.add(
      "visible"
    );


  elements.readingPanel
    ?.setAttribute(
      "aria-hidden",
      "false"
    );

}


function closeReadingPanel() {

  elements.readingPanel
    ?.classList.remove(
      "visible"
    );


  elements.readingPanel
    ?.setAttribute(
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
   26. PREFERENCES
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
   27. THEME BUTTON
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


  const target =
    $("#themeIcon");


  if (
    target
  ) {

    target.textContent =
      icon;

  }

}


/* ============================================================
   28. MOBILE MENU
============================================================ */

function setupMenu() {

  $("#menuButton")
    ?.addEventListener(
      "click",
      () => {

        const nav =
          $("#mobileNav");


        if (
          !nav
        ) {

          return;

        }


        const visible =
          nav.classList.toggle(
            "visible"
          );


        $("#menuButton")
          ?.setAttribute(
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
   29. GLOBAL ACTIONS
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


  if (
    random
  ) {

    openStory(
      random.slug
    );

  }

}


/* ============================================================
   30. AUTOMATIC REFRESH
============================================================ */

function startAutomaticRefresh() {

  setInterval(
    async () => {

      /*
       * Don't refresh the library over
       * an active story reader.
       */
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
              pageSize: 100
            }
          );


        const stories =
          normalizeStories(
            response?.data ||
            []
          );


        state.allStories =
          stories;


        state.stories =
          stories;


        collectTaxonomy(
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
            .slice(
              0,
              6
            );


        renderFeatured();

        renderLatest();

        populateGenreFilter();

        renderLibrary();


        setStatus(
          "online",
          "StoryNest updated"
        );


      } catch (error) {

        console.warn(
          "StoryNest automatic refresh failed:",
          error
        );

        /*
         * Keep the existing content.
         */

      }

    },
    CONFIG.refreshInterval
  );

}


/* ============================================================
   31. TAXONOMY
============================================================ */

function collectTaxonomy(
  stories
) {

  state.genres =
    new Set();


  state.categories =
    new Set();


  stories.forEach(
    story => {

      if (
        story.genre
      ) {

        state.genres.add(
          String(
            story.genre
          ).trim()
        );

      }


      if (
        story.category
      ) {

        state.categories.add(
          String(
            story.category
          ).trim()
        );

      }

    }
  );

}


/* ============================================================
   32. AGE FILTER
============================================================ */

function ageMatches(
  story,
  requested
) {

  const value =
    String(
      requested ||
      ""
    ).trim();


  if (
    !value
  ) {

    return true;

  }


  const match =
    value.match(
      /^(\d+)(?:-(\d+)|\+)?$/
    );


  if (
    !match
  ) {

    return true;

  }


  const targetMin =
    Number(
      match[1]
    );


  const targetMax =
    match[2]
      ? Number(
          match[2]
        )
      : Infinity;


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


/* ============================================================
   33. STATUS
============================================================ */

function setStatus(
  type,
  message
) {

  if (
    !elements.statusDot ||
    !elements.statusText
  ) {

    return;

  }


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
   34. KEYBOARD
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
   35. ERROR / LOADING
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


function renderError(
  container,
  error
) {

  if (
    !container
  ) {

    return;

  }


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
   36. SAFE HELPERS
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
      /['"]/g,
      ""
    )
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

  if (
    !genre
  ) {

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
    "…"
  );

}


function normalizeTags(
  value
) {

  if (
    Array.isArray(
      value
    )
  ) {

    return value.join(
      ", "
    );

  }


  return String(
    value ||
    ""
  ).trim();

}


function firstValue(
  ...values
) {

  for (
    const value of values
  ) {

    if (
      value !==
        undefined &&
      value !==
        null &&
      String(
        value
      ).trim() !== ""
    ) {

      return value;

    }

  }


  return "";

}


function localeCompareSafe(
  a,
  b
) {

  return String(
    a
  ).localeCompare(
    String(
      b
    )
  );

}


function addParagraphClasses(
  html
) {

  let index =
    0;


  return html.replace(
    /<p(\s[^>]*)?>/gi,
    () => {

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

  if (
    !elements.toast
  ) {

    return;

  }


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
   37. DEBUG / PUBLIC API
============================================================ */

window.StoryNest = {

  state,

  apiRequest,

  openStory,

  showPage,

  loadHomeData,

  surpriseMe,

  normalizeStory

};
