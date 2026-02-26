(() => {
  "use strict";

  const STORAGE_KEY = "xander.community.v2";
  const SESSION_KEY = "xander.community.session.v2";
  const COLOR_MODE_KEY = "xander.community.color_mode.v1";
  const ANY_PROJECT = "__any_project__";

  const DEFAULT_SUPABASE_TABLES = {
    users: "community_users",
    posts: "community_posts",
    comments: "community_comments"
  };

  const PROJECTS = [
    "General",
    "All Projects",
    "MedFile",
    "CSV Link",
    "Creator Tools",
    "PairDrawing",
    "Sharp",
    "Untold Capers",
    "Scribbles",
    "Itch.io",
    "Curved Text",
    "Text Modifier",
    "Photo Memory",
    "Brick Fever",
    "Grav-it",
    "Twisted Bounce",
    "Gum Drop",
    "Square Jump",
    "Perfectly Tuned",
    "Dunked",
    "PixGuess",
    "Antwerp Axe Throwing",
    "Lycan Werewolf Game"
  ];

  const state = {
    store: null,
    currentUser: null,
    authView: "login",
    sectionPanel: "panel-help",
    typeFilter: "all",
    projectFilter: ANY_PROJECT,
    searchText: "",
    appContext: "General",
    viewMode: "list",
    activeThreadRootId: null,
    activeThreadPostId: null
  };

  const backend = {
    mode: "local",
    supabase: null,
    tables: { ...DEFAULT_SUPABASE_TABLES },
    notice: ""
  };

  const nodes = {
    colorToggleBtn: document.getElementById("colorToggleBtn"),
    yearNow: document.getElementById("yearNow"),
    appContextName: document.getElementById("appContextName"),
    appLinkExample: document.getElementById("appLinkExample"),
    statusMessage: document.getElementById("statusMessage"),
    sectionTabs: document.getElementById("sectionTabs"),
    sectionPanels: Array.from(document.querySelectorAll(".section-panel")),
    authGuest: document.getElementById("authGuest"),
    authLogged: document.getElementById("authLogged"),
    showLoginBtn: document.getElementById("showLoginBtn"),
    showRegisterBtn: document.getElementById("showRegisterBtn"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    logoutButton: document.getElementById("logoutButton"),
    sessionState: document.getElementById("sessionState"),
    postForm: document.getElementById("postForm"),
    postComposerFieldset: document.getElementById("postComposerFieldset"),
    composerBox: document.getElementById("composerBox"),
    composerTitle: document.getElementById("composerTitle"),
    composerGate: document.getElementById("composerGate"),
    postType: document.getElementById("postType"),
    postProject: document.getElementById("postProject"),
    postTitle: document.getElementById("postTitle"),
    postBody: document.getElementById("postBody"),
    postParentId: document.getElementById("postParentId"),
    typeTabs: document.getElementById("typeTabs"),
    projectFilter: document.getElementById("projectFilter"),
    searchInput: document.getElementById("searchInput"),
    clearFilters: document.getElementById("clearFilters"),
    resultCount: document.getElementById("resultCount"),
    postList: document.getElementById("postList"),
    threadListView: document.getElementById("threadListView"),
    threadDetailView: document.getElementById("threadDetailView"),
    backToListButton: document.getElementById("backToListButton"),
    threadPath: document.getElementById("threadPath"),
    threadPostTabs: document.getElementById("threadPostTabs"),
    threadPostDetail: document.getElementById("threadPostDetail")
  };

  function setStatus(message, type = "info") {
    const valid = ["info", "success", "warn", "error"].includes(type) ? type : "info";
    nodes.statusMessage.textContent = message;
    nodes.statusMessage.className = `status show ${valid}`;
  }

  function clearStatus() {
    nodes.statusMessage.textContent = "";
    nodes.statusMessage.className = "status";
  }

  function parseUrlApp() {
    const raw = (new URLSearchParams(window.location.search).get("app") || "").trim();
    return raw || "General";
  }

  function loadColorModePreference() {
    try {
      return localStorage.getItem(COLOR_MODE_KEY) === "brown";
    } catch (error) {
      return false;
    }
  }

  function saveColorModePreference(enabled) {
    try {
      localStorage.setItem(COLOR_MODE_KEY, enabled ? "brown" : "mono");
    } catch (error) {
      // Ignore write failures (private mode, blocked storage, etc).
    }
  }

  function syncColorToggleUi() {
    if (!nodes.colorToggleBtn) {
      return;
    }
    const enabled = document.body.classList.contains("color-mode");
    nodes.colorToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    nodes.colorToggleBtn.title = enabled ? "Switch to black and white" : "Switch to brown mode";
  }

  function applyColorMode(enabled) {
    document.body.classList.toggle("color-mode", Boolean(enabled));
    syncColorToggleUi();
  }

  function dateTimeLabel(raw) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? String(raw || "Unknown time") : parsed.toLocaleString();
  }

  function normalizeUsername(input) {
    return String(input || "").trim();
  }

  async function hashPassword(username, password) {
    const seed = `${String(username || "").toLowerCase()}::${String(password || "")}`;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      const bytes = new TextEncoder().encode(seed);
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(seed)));
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function readSupabaseConfig() {
    const raw = window.SUPPORT_SUPABASE && typeof window.SUPPORT_SUPABASE === "object" ? window.SUPPORT_SUPABASE : {};
    const url = String(raw.url || window.SUPABASE_URL || "").trim();
    const anonKey = String(raw.anonKey || window.SUPABASE_ANON_KEY || "").trim();
    const tableRaw = raw.tables && typeof raw.tables === "object" ? raw.tables : {};
    return {
      url,
      anonKey,
      tables: {
        users: String(tableRaw.users || DEFAULT_SUPABASE_TABLES.users).trim() || DEFAULT_SUPABASE_TABLES.users,
        posts: String(tableRaw.posts || DEFAULT_SUPABASE_TABLES.posts).trim() || DEFAULT_SUPABASE_TABLES.posts,
        comments: String(tableRaw.comments || DEFAULT_SUPABASE_TABLES.comments).trim() || DEFAULT_SUPABASE_TABLES.comments
      }
    };
  }

  function errorMessage(error, fallback) {
    const message = error && typeof error.message === "string" ? error.message.trim() : "";
    return message || fallback;
  }

  async function initBackend() {
    const config = readSupabaseConfig();
    backend.tables = config.tables;

    if (!config.url || !config.anonKey) {
      backend.mode = "local";
      return;
    }

    if (!(window.supabase && typeof window.supabase.createClient === "function")) {
      backend.mode = "local";
      backend.notice = "Supabase keys are set, but the Supabase SDK did not load. Using local storage.";
      return;
    }

    backend.supabase = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    backend.mode = "supabase";
  }

  function buildSeedStore() {
    return {
      users: [],
      posts: [
        {
          id: makeId("post"),
          type: "support",
          parentPostId: null,
          project: "General",
          title: "General Support Thread",
          body: "Use this for broad support questions that are not tied to a single app.",
          author: "Support Team",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
          pinned: true,
          comments: []
        },
        {
          id: makeId("post"),
          type: "support",
          parentPostId: null,
          project: "All Projects",
          title: "All Projects Support Thread",
          body: "Use this for cross-project issues and ecosystem-wide reports.",
          author: "Support Team",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
          pinned: true,
          comments: []
        }
      ]
    };
  }

  function ensureStoreShape(rawStore, options = {}) {
    const addSeedPosts = options.addSeedPosts !== false;
    const store = rawStore && typeof rawStore === "object" ? rawStore : {};

    if (!Array.isArray(store.users)) {
      store.users = [];
    }
    if (!Array.isArray(store.posts)) {
      store.posts = [];
    }

    store.posts.forEach((post) => {
      if (!Array.isArray(post.comments)) {
        post.comments = [];
      }
      if (typeof post.parentPostId !== "string" || !post.parentPostId.trim()) {
        post.parentPostId = null;
      } else {
        post.parentPostId = post.parentPostId.trim();
      }
      if (typeof post.pinned !== "boolean") {
        post.pinned = Boolean(post.pinned);
      }
      if (!post.createdAt) {
        post.createdAt = new Date().toISOString();
      }

      post.comments = post.comments.map((comment) => ({
        id: String(comment.id || makeId("comment")),
        author: String(comment.author || "Unknown"),
        body: String(comment.body || ""),
        createdAt: comment.createdAt || new Date().toISOString(),
        parentCommentId: typeof comment.parentCommentId === "string" && comment.parentCommentId.trim()
          ? comment.parentCommentId.trim()
          : null
      }));
    });

    if (addSeedPosts) {
      const needsGeneral = !store.posts.some((post) => post.pinned && post.project === "General");
      const needsAll = !store.posts.some((post) => post.pinned && post.project === "All Projects");
      if (needsGeneral || needsAll) {
        const seed = buildSeedStore().posts;
        seed.forEach((entry) => {
          const exists = store.posts.some((post) => post.pinned && post.project === entry.project);
          if (!exists) {
            store.posts.push(entry);
          }
        });
      }
    }

    return store;
  }

  function loadLocalStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = buildSeedStore();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }

      const shaped = ensureStoreShape(JSON.parse(raw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shaped));
      return shaped;
    } catch {
      const fallback = buildSeedStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  function saveLocalStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  }

  async function ensureSeedPostsInSupabase(posts) {
    if (!(backend.mode === "supabase" && backend.supabase)) {
      return posts;
    }

    const seedPosts = buildSeedStore().posts;
    const missing = seedPosts.filter((seed) => !posts.some((post) => post.pinned && post.project === seed.project));
    if (missing.length === 0) {
      return posts;
    }

    const payload = missing.map((post) => ({
      id: post.id,
      type: post.type,
      parent_post_id: post.parentPostId,
      project: post.project,
      title: post.title,
      body: post.body,
      author: post.author,
      created_at: post.createdAt,
      pinned: post.pinned
    }));

    const { error } = await backend.supabase.from(backend.tables.posts).insert(payload);
    if (error) {
      throw new Error(`Could not create pinned support threads in Supabase. ${errorMessage(error, "Unknown error.")}`);
    }

    return posts.concat(missing);
  }

  async function loadSupabaseStore() {
    const postsResult = await backend.supabase
      .from(backend.tables.posts)
      .select("id, type, parent_post_id, project, title, body, author, created_at, pinned");

    if (postsResult.error) {
      throw new Error(`Supabase read failed for table \"${backend.tables.posts}\". ${errorMessage(postsResult.error, "Unknown error.")}`);
    }

    const commentsResult = await backend.supabase
      .from(backend.tables.comments)
      .select("id, post_id, author, body, created_at, parent_comment_id")
      .order("created_at", { ascending: true });

    if (commentsResult.error) {
      throw new Error(`Supabase read failed for table \"${backend.tables.comments}\". ${errorMessage(commentsResult.error, "Unknown error.")}`);
    }

    const posts = (postsResult.data || []).map((row) => ({
      id: String(row.id || makeId("post")),
      type: row.type === "blog" ? "blog" : "support",
      parentPostId: row.parent_post_id ? String(row.parent_post_id) : null,
      project: String(row.project || "General"),
      title: String(row.title || ""),
      body: String(row.body || ""),
      author: String(row.author || "Unknown"),
      createdAt: row.created_at || new Date().toISOString(),
      pinned: Boolean(row.pinned),
      comments: []
    }));

    const postMap = new Map(posts.map((post) => [post.id, post]));
    (commentsResult.data || []).forEach((row) => {
      const post = postMap.get(String(row.post_id || ""));
      if (!post) {
        return;
      }
      post.comments.push({
        id: String(row.id || makeId("comment")),
        author: String(row.author || "Unknown"),
        body: String(row.body || ""),
        createdAt: row.created_at || new Date().toISOString(),
        parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null
      });
    });

    const shaped = ensureStoreShape({ users: [], posts }, { addSeedPosts: false });
    shaped.posts = await ensureSeedPostsInSupabase(shaped.posts);
    return ensureStoreShape(shaped, { addSeedPosts: false });
  }

  async function loadStore() {
    if (backend.mode === "supabase" && backend.supabase) {
      try {
        return await loadSupabaseStore();
      } catch (error) {
        console.error(error);
        backend.mode = "local";
        backend.notice = `${errorMessage(error, "Supabase is unavailable.")} Using local storage on this device.`;
      }
    }
    return loadLocalStore();
  }

  function saveStore() {
    if (backend.mode === "supabase") {
      return;
    }
    saveLocalStore();
  }

  function loadSessionUser() {
    return localStorage.getItem(SESSION_KEY);
  }

  function saveSessionUser(username) {
    localStorage.setItem(SESSION_KEY, username);
  }

  function clearSessionUser() {
    localStorage.removeItem(SESSION_KEY);
  }

  function addProjectIfMissing(projectName) {
    if (projectName && !PROJECTS.includes(projectName)) {
      PROJECTS.push(projectName);
    }
  }

  function fillProjectSelects() {
    const uniqueProjects = Array.from(new Set(PROJECTS)).sort((a, b) => a.localeCompare(b));

    nodes.postProject.innerHTML = "";
    uniqueProjects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project;
      option.textContent = project;
      nodes.postProject.appendChild(option);
    });

    nodes.projectFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = ANY_PROJECT;
    allOption.textContent = "All Projects (any)";
    nodes.projectFilter.appendChild(allOption);

    uniqueProjects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project;
      option.textContent = project;
      nodes.projectFilter.appendChild(option);
    });
  }

  function setSectionPanel(panelId) {
    state.sectionPanel = panelId;

    const buttons = nodes.sectionTabs ? nodes.sectionTabs.querySelectorAll("[data-panel]") : [];
    buttons.forEach((button) => {
      const isActive = button.dataset.panel === panelId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    nodes.sectionPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
  }

  function setAuthView(view) {
    state.authView = view === "register" ? "register" : "login";
    const onLogin = state.authView === "login";

    nodes.loginForm.classList.toggle("hidden", !onLogin);
    nodes.registerForm.classList.toggle("hidden", onLogin);
    nodes.showLoginBtn.classList.toggle("active", onLogin);
    nodes.showRegisterBtn.classList.toggle("active", !onLogin);
    nodes.showLoginBtn.setAttribute("aria-selected", String(onLogin));
    nodes.showRegisterBtn.setAttribute("aria-selected", String(!onLogin));
  }

  function setComposerEnabled(enabled) {
    nodes.postComposerFieldset.disabled = !enabled;
    nodes.composerBox.classList.toggle("locked", !enabled);
  }

  function getPostById(postId) {
    return state.store.posts.find((post) => post.id === postId) || null;
  }

  function getThreadRootPost(post) {
    if (!post) {
      return null;
    }

    let current = post;
    const visited = new Set();
    while (current.parentPostId) {
      if (visited.has(current.id)) {
        break;
      }
      visited.add(current.id);
      const parent = getPostById(current.parentPostId);
      if (!parent) {
        break;
      }
      current = parent;
    }

    return current;
  }

  function getCurrentThreadRoot() {
    return state.activeThreadRootId ? getPostById(state.activeThreadRootId) : null;
  }

  function syncComposerUi() {
    const root = getCurrentThreadRoot();
    const inThread = state.viewMode === "thread" && Boolean(root);
    const isSupportThread = inThread && root.type === "support";

    if (nodes.composerTitle) {
      nodes.composerTitle.textContent = isSupportThread ? "Create Subthread" : "Create Post";
    }

    if (nodes.postParentId) {
      nodes.postParentId.value = isSupportThread ? root.id : "";
    }

    if (isSupportThread) {
      nodes.postType.value = "support";
      nodes.postType.disabled = true;
      nodes.postProject.value = root.project;
      nodes.postProject.disabled = true;
    } else {
      nodes.postType.disabled = false;
      nodes.postProject.disabled = false;
    }

    if (!state.currentUser) {
      nodes.composerGate.textContent = isSupportThread
        ? "Locked: log in to create a subthread under this thread."
        : "Locked: log in to enable this form.";
      return;
    }

    nodes.composerGate.textContent = isSupportThread
      ? `Posting here creates a subthread under "${root.title}".`
      : "Composer unlocked. You can publish posts.";
  }

  function syncAuthUi() {
    const loggedIn = Boolean(state.currentUser);
    nodes.authGuest.classList.toggle("hidden", loggedIn);
    nodes.authLogged.classList.toggle("hidden", !loggedIn);

    if (loggedIn) {
      nodes.sessionState.textContent = `Logged in as ${state.currentUser}.`;
      setComposerEnabled(true);
    } else {
      setComposerEnabled(false);
      setAuthView("login");
    }

    syncComposerUi();
  }

  function postMatchesSearch(post, queryText = state.searchText) {
    const query = String(queryText || "").trim().toLowerCase();
    if (!query) {
      return true;
    }
    const haystack = `${post.title} ${post.body} ${post.project} ${post.author}`.toLowerCase();
    return haystack.includes(query);
  }

  function matchesFilters(post) {
    if (post.parentPostId) {
      return false;
    }

    if (state.typeFilter !== "all" && post.type !== state.typeFilter) {
      return false;
    }
    if (state.projectFilter !== ANY_PROJECT && post.project !== state.projectFilter) {
      return false;
    }

    return postMatchesSearch(post, state.searchText);
  }

  function sortedFilteredPosts() {
    return state.store.posts
      .filter(matchesFilters)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  function getThreadPosts(rootId) {
    const root = getPostById(rootId);
    if (!root) {
      return [];
    }

    const children = state.store.posts
      .filter((post) => post.id !== root.id)
      .filter((post) => {
        const postRoot = getThreadRootPost(post);
        return Boolean(postRoot && postRoot.id === root.id);
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return [root, ...children];
  }

  function openThread(rootId, focusPostId = rootId) {
    const root = getPostById(rootId);
    if (!root) {
      setStatus("Thread not found.", "error");
      return;
    }

    const threadPosts = getThreadPosts(root.id);
    const hasFocus = threadPosts.some((post) => post.id === focusPostId);
    state.viewMode = "thread";
    state.activeThreadRootId = root.id;
    state.activeThreadPostId = hasFocus ? focusPostId : root.id;
    syncComposerUi();
    resetPostForm();
    renderPosts();
  }

  function closeThreadView() {
    state.viewMode = "list";
    state.activeThreadRootId = null;
    state.activeThreadPostId = null;
    syncComposerUi();
    resetPostForm();
    renderPosts();
  }

  function createBadge(text, extraClass = "") {
    const badge = document.createElement("span");
    badge.className = `badge ${extraClass}`.trim();
    badge.textContent = text;
    return badge;
  }

  function threadSubthreadCount(rootId) {
    return state.store.posts.filter((post) => {
      if (!post.parentPostId) {
        return false;
      }
      const root = getThreadRootPost(post);
      return Boolean(root && root.id === rootId && post.id !== rootId);
    }).length;
  }

  function buildPreviewText(body, queryText, maxLength = 320) {
    const source = String(body || "");
    const query = String(queryText || "").trim().toLowerCase();
    if (!query || source.length <= maxLength) {
      return source.length > maxLength ? `${source.slice(0, maxLength)}...` : source;
    }

    const index = source.toLowerCase().indexOf(query);
    if (index < 0) {
      return source.length > maxLength ? `${source.slice(0, maxLength)}...` : source;
    }

    const halfWindow = Math.floor(maxLength / 2);
    let start = Math.max(0, index - halfWindow);
    let end = Math.min(source.length, start + maxLength);
    if (end - start < maxLength) {
      start = Math.max(0, end - maxLength);
    }

    let preview = source.slice(start, end);
    if (start > 0) {
      preview = `...${preview}`;
    }
    if (end < source.length) {
      preview = `${preview}...`;
    }
    return preview;
  }

  function appendHighlightedText(node, text, queryText) {
    const source = String(text || "");
    const query = String(queryText || "").trim();
    node.textContent = "";

    if (!query) {
      node.textContent = source;
      return;
    }

    const sourceLower = source.toLowerCase();
    const queryLower = query.toLowerCase();
    let cursor = 0;

    while (cursor < source.length) {
      const matchAt = sourceLower.indexOf(queryLower, cursor);
      if (matchAt < 0) {
        node.appendChild(document.createTextNode(source.slice(cursor)));
        break;
      }

      if (matchAt > cursor) {
        node.appendChild(document.createTextNode(source.slice(cursor, matchAt)));
      }

      const mark = document.createElement("mark");
      mark.className = "search-mark";
      mark.textContent = source.slice(matchAt, matchAt + query.length);
      node.appendChild(mark);

      cursor = matchAt + query.length;
    }
  }

  function createListPostElement(post) {
    const card = document.createElement("article");
    card.className = `post-card${post.pinned ? " pinned" : ""}`;
    if (state.searchText && postMatchesSearch(post, state.searchText)) {
      card.classList.add("search-hit");
    }

    const titleRow = document.createElement("div");
    titleRow.className = "post-title-row";

    const title = document.createElement("h4");
    title.className = "post-title";
    appendHighlightedText(title, post.title, state.searchText);

    const badges = document.createElement("div");
    badges.className = "badges";
    badges.appendChild(createBadge(post.type === "blog" ? "Blog" : "Support", `type-${post.type}`));
    badges.appendChild(createBadge(post.project));
    if (post.pinned) {
      badges.appendChild(createBadge("Pinned", "pinned"));
    }

    titleRow.appendChild(title);
    titleRow.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "meta";
    const subthreadText = post.type === "support"
      ? ` | ${threadSubthreadCount(post.id)} subthread(s)`
      : "";
    meta.textContent = `By ${post.author} | ${dateTimeLabel(post.createdAt)} | ${post.comments.length} comment(s)${subthreadText}`;

    const body = document.createElement("div");
    body.className = "post-body";
    appendHighlightedText(body, buildPreviewText(post.body, state.searchText, 320), state.searchText);

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn alt small";
    openButton.dataset.action = "open-thread";
    openButton.dataset.postId = post.id;
    openButton.textContent = post.type === "support" ? "Open Thread" : "Open Post";
    actions.appendChild(openButton);

    card.appendChild(titleRow);
    card.appendChild(meta);
    card.appendChild(body);
    card.appendChild(actions);

    return card;
  }

  function createCommentForm(postId, parentCommentId = null) {
    const form = document.createElement("form");
    form.className = parentCommentId ? "reply-form comment-form" : "comment-form";
    form.dataset.postId = postId;
    if (parentCommentId) {
      form.dataset.parentCommentId = parentCommentId;
    }

    const label = document.createElement("label");
    label.textContent = parentCommentId ? "Reply" : "Add comment";

    const textarea = document.createElement("textarea");
    textarea.name = "body";
    textarea.minLength = 2;
    textarea.maxLength = 2000;
    textarea.required = true;

    const button = document.createElement("button");
    button.className = "btn small";
    button.type = "submit";
    button.textContent = parentCommentId ? "Reply" : "Post Comment";

    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(button);
    return form;
  }

  function createCommentTreeItem(postId, comment, repliesByParent, depth = 0) {
    const item = document.createElement("div");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.textContent = `${comment.author} | ${dateTimeLabel(comment.createdAt)}`;

    const body = document.createElement("div");
    body.className = "comment-body";
    body.textContent = comment.body;

    item.appendChild(meta);
    item.appendChild(body);

    if (state.currentUser && depth < 3) {
      item.appendChild(createCommentForm(postId, comment.id));
    }

    const replies = repliesByParent.get(comment.id) || [];
    if (replies.length > 0) {
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "comment-replies";
      replies.forEach((reply) => {
        repliesWrap.appendChild(createCommentTreeItem(postId, reply, repliesByParent, depth + 1));
      });
      item.appendChild(repliesWrap);
    }

    return item;
  }

  function createThreadPostDetail(post, root) {
    const wrap = document.createElement("article");
    wrap.className = `post-card${post.pinned ? " pinned" : ""}`;
    if (state.searchText && postMatchesSearch(post, state.searchText)) {
      wrap.classList.add("search-hit");
    }

    const titleRow = document.createElement("div");
    titleRow.className = "post-title-row";

    const title = document.createElement("h4");
    title.className = "post-title";
    appendHighlightedText(title, post.title, state.searchText);

    const badges = document.createElement("div");
    badges.className = "badges";
    badges.appendChild(createBadge(post.type === "blog" ? "Blog" : "Support", `type-${post.type}`));
    badges.appendChild(createBadge(post.project));
    if (post.parentPostId) {
      badges.appendChild(createBadge("Subthread"));
    }
    if (post.pinned) {
      badges.appendChild(createBadge("Pinned", "pinned"));
    }

    titleRow.appendChild(title);
    titleRow.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `By ${post.author} | ${dateTimeLabel(post.createdAt)} | ${post.comments.length} comment(s)`;

    const body = document.createElement("div");
    body.className = "post-body";
    appendHighlightedText(body, post.body, state.searchText);

    wrap.appendChild(titleRow);
    wrap.appendChild(meta);
    wrap.appendChild(body);

    if (post.id !== root.id) {
      const hint = document.createElement("p");
      hint.className = "small-note";
      hint.textContent = `Subthread under: ${root.title}`;
      wrap.appendChild(hint);
    }

    const commentList = document.createElement("div");
    commentList.className = "comment-list";
    const comments = Array.isArray(post.comments)
      ? [...post.comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      : [];

    const repliesByParent = new Map();
    comments.forEach((comment) => {
      const key = comment.parentCommentId || "__root__";
      if (!repliesByParent.has(key)) {
        repliesByParent.set(key, []);
      }
      repliesByParent.get(key).push(comment);
    });

    const topLevel = repliesByParent.get("__root__") || [];
    if (topLevel.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No comments yet.";
      commentList.appendChild(empty);
    } else {
      topLevel.forEach((comment) => {
        commentList.appendChild(createCommentTreeItem(post.id, comment, repliesByParent));
      });
    }

    wrap.appendChild(commentList);

    if (state.currentUser) {
      wrap.appendChild(createCommentForm(post.id));
    } else {
      const hint = document.createElement("p");
      hint.className = "small-note";
      hint.textContent = "Log in to comment or reply.";
      wrap.appendChild(hint);
    }

    return wrap;
  }

  function renderListView() {
    const posts = sortedFilteredPosts();
    nodes.threadListView.classList.remove("hidden");
    nodes.threadDetailView.classList.add("hidden");
    nodes.postList.innerHTML = "";

    if (posts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No posts match your filters.";
      nodes.postList.appendChild(empty);
    } else {
      posts.forEach((post) => nodes.postList.appendChild(createListPostElement(post)));
    }

    nodes.resultCount.textContent = `${posts.length} thread(s) visible.`;
  }

  function renderThreadView() {
    const root = getCurrentThreadRoot();
    if (!root) {
      closeThreadView();
      return;
    }

    const threadPosts = getThreadPosts(root.id);
    const hasSelectedPost = threadPosts.some((post) => post.id === state.activeThreadPostId);
    if (!hasSelectedPost) {
      state.activeThreadPostId = root.id;
    }

    const activePost = getPostById(state.activeThreadPostId) || root;

    nodes.threadListView.classList.add("hidden");
    nodes.threadDetailView.classList.remove("hidden");
    nodes.threadPath.textContent = `Thread: ${root.title} (${threadPosts.length - 1} subthread(s))`;

    nodes.threadPostTabs.innerHTML = "";
    const hasSubthreads = threadPosts.length > 1;
    nodes.threadPostTabs.classList.toggle("hidden", !hasSubthreads);

    if (hasSubthreads) {
      threadPosts.forEach((post) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `thread-tab-button${post.id === activePost.id ? " active" : ""}`;
        button.classList.add(post.id === root.id ? "is-root" : "is-subthread");
        if (state.searchText && postMatchesSearch(post, state.searchText)) {
          button.classList.add("search-hit");
        }
        button.dataset.action = "select-thread-post";
        button.dataset.postId = post.id;
        const prefix = post.id === root.id ? "OP" : "Reply";
        button.textContent = `${prefix}: ${post.title}`;
        nodes.threadPostTabs.appendChild(button);
      });
    }

    nodes.threadPostDetail.innerHTML = "";
    nodes.threadPostDetail.appendChild(createThreadPostDetail(activePost, root));
    nodes.resultCount.textContent = `${threadPosts.length} post(s) in this thread.`;
  }

  function renderPosts() {
    if (state.viewMode === "thread") {
      renderThreadView();
      return;
    }
    renderListView();
  }

  function syncTypeTabsUi() {
    const chips = nodes.typeTabs.querySelectorAll("[data-type]");
    chips.forEach((chip) => {
      const isActive = chip.dataset.type === state.typeFilter;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-selected", String(isActive));
    });
  }

  function syncFiltersFromState() {
    nodes.projectFilter.value = state.projectFilter;
    if (nodes.projectFilter.value !== state.projectFilter) {
      nodes.projectFilter.value = ANY_PROJECT;
      state.projectFilter = ANY_PROJECT;
    }
  }

  function resetPostForm() {
    nodes.postType.value = "support";
    nodes.postTitle.value = "";
    nodes.postBody.value = "";
    const root = getCurrentThreadRoot();
    if (state.viewMode === "thread" && root && root.type === "support") {
      nodes.postProject.value = root.project;
      nodes.postParentId.value = root.id;
      return;
    }

    nodes.postParentId.value = "";
    if (state.appContext) {
      nodes.postProject.value = state.appContext;
    }
  }

  function syncContextUi() {
    nodes.appContextName.textContent = state.appContext;

    const origin = window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "https://xanderdevelops.github.io";
    const path = window.location.pathname.endsWith("support.html")
      ? window.location.pathname
      : "/support.html";

    nodes.appLinkExample.textContent = `${origin}${path}?app=${encodeURIComponent(state.appContext)}`;
  }

  async function registerUser(username, password) {
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      throw new Error("Username must be 3-24 chars using letters, numbers, or underscore.");
    }

    if (password.length < 8 || password.length > 72) {
      throw new Error("Password must be 8-72 characters.");
    }

    if (backend.mode === "supabase" && backend.supabase) {
      const { data: existingRows, error: lookupError } = await backend.supabase
        .from(backend.tables.users)
        .select("username")
        .ilike("username", username)
        .limit(1);

      if (lookupError) {
        throw new Error(`Could not check username availability. ${errorMessage(lookupError, "Verify Supabase table setup.")}`);
      }

      if ((existingRows || []).length > 0) {
        throw new Error("Username already exists.");
      }

      const passwordHash = await hashPassword(username, password);
      const { error: insertError } = await backend.supabase.from(backend.tables.users).insert({
        username,
        password_hash: passwordHash,
        created_at: new Date().toISOString()
      });

      if (insertError) {
        const insertMessage = errorMessage(insertError, "Could not create account.");
        if (/duplicate|unique/i.test(insertMessage)) {
          throw new Error("Username already exists.");
        }
        throw new Error(`Could not create account. ${insertMessage}`);
      }

      state.currentUser = username;
      saveSessionUser(username);
      return;
    }

    const exists = state.store.users.some((user) => user.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      throw new Error("Username already exists.");
    }

    state.store.users.push({
      username,
      passwordHash: await hashPassword(username, password),
      createdAt: new Date().toISOString()
    });

    saveStore();
    state.currentUser = username;
    saveSessionUser(username);
  }

  async function loginUser(username, password) {
    if (backend.mode === "supabase" && backend.supabase) {
      const { data, error } = await backend.supabase
        .from(backend.tables.users)
        .select("username, password_hash")
        .ilike("username", username)
        .limit(1);

      if (error) {
        throw new Error(`Could not log in. ${errorMessage(error, "Verify Supabase table setup.")}`);
      }

      const user = data && data[0];
      if (!user) {
        throw new Error("Invalid username or password.");
      }

      const passwordHash = await hashPassword(user.username, password);
      if (user.password_hash !== passwordHash) {
        throw new Error("Invalid username or password.");
      }

      state.currentUser = user.username;
      saveSessionUser(user.username);
      return;
    }

    const user = state.store.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      throw new Error("Invalid username or password.");
    }

    const passwordHash = await hashPassword(user.username, password);
    if (user.passwordHash !== passwordHash) {
      throw new Error("Invalid username or password.");
    }

    state.currentUser = user.username;
    saveSessionUser(user.username);
  }

  async function submitPost(payload) {
    const parentPostId = typeof payload.parentPostId === "string" && payload.parentPostId.trim()
      ? payload.parentPostId.trim()
      : null;

    if (parentPostId && !getPostById(parentPostId)) {
      throw new Error("Parent thread not found.");
    }

    const post = {
      id: makeId("post"),
      type: payload.type,
      parentPostId,
      project: payload.project,
      title: payload.title,
      body: payload.body,
      author: state.currentUser,
      createdAt: new Date().toISOString(),
      pinned: false,
      comments: []
    };

    if (backend.mode === "supabase" && backend.supabase) {
      const { error } = await backend.supabase.from(backend.tables.posts).insert({
        id: post.id,
        type: post.type,
        parent_post_id: post.parentPostId,
        project: post.project,
        title: post.title,
        body: post.body,
        author: post.author,
        created_at: post.createdAt,
        pinned: post.pinned
      });

      if (error) {
        throw new Error(`Could not publish post. ${errorMessage(error, "Please try again.")}`);
      }
    }

    addProjectIfMissing(post.project);
    state.store.posts.push(post);
    saveStore();
    return post;
  }

  async function submitComment(postId, body, parentCommentId = null) {
    const post = state.store.posts.find((item) => item.id === postId);
    if (!post) {
      throw new Error("Post not found.");
    }

    const safeParentCommentId = typeof parentCommentId === "string" && parentCommentId.trim()
      ? parentCommentId.trim()
      : null;

    if (safeParentCommentId) {
      const parentComment = post.comments.find((comment) => comment.id === safeParentCommentId);
      if (!parentComment) {
        throw new Error("Reply target was not found.");
      }
    }

    const comment = {
      id: makeId("comment"),
      author: state.currentUser,
      body,
      createdAt: new Date().toISOString(),
      parentCommentId: safeParentCommentId
    };

    if (backend.mode === "supabase" && backend.supabase) {
      const { error } = await backend.supabase.from(backend.tables.comments).insert({
        id: comment.id,
        post_id: postId,
        author: comment.author,
        body: comment.body,
        created_at: comment.createdAt,
        parent_comment_id: comment.parentCommentId
      });

      if (error) {
        throw new Error(`Could not post comment. ${errorMessage(error, "Please try again.")}`);
      }
    }

    post.comments.push(comment);
    saveStore();
  }

  function bindEvents() {
    if (nodes.colorToggleBtn) {
      nodes.colorToggleBtn.addEventListener("click", () => {
        const next = !document.body.classList.contains("color-mode");
        applyColorMode(next);
        saveColorModePreference(next);
      });
    }

    nodes.sectionTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const panelId = String(target.dataset.panel || "");
      if (!panelId || !nodes.sectionPanels.some((panel) => panel.id === panelId)) {
        return;
      }

      setSectionPanel(panelId);
    });

    nodes.showLoginBtn.addEventListener("click", () => setAuthView("login"));
    nodes.showRegisterBtn.addEventListener("click", () => setAuthView("register"));

    nodes.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus();

      const formData = new FormData(nodes.loginForm);
      const username = normalizeUsername(formData.get("username"));
      const password = String(formData.get("password") || "");

      if (!username || !password) {
        setStatus("Username and password are required.", "warn");
        return;
      }

      try {
        await loginUser(username, password);
        nodes.loginForm.reset();
        syncAuthUi();
        renderPosts();
        setStatus("Logged in.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    nodes.registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus();

      const formData = new FormData(nodes.registerForm);
      const username = normalizeUsername(formData.get("username"));
      const password = String(formData.get("password") || "");

      try {
        await registerUser(username, password);
        nodes.registerForm.reset();
        syncAuthUi();
        renderPosts();
        setStatus("Account created and logged in.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    nodes.logoutButton.addEventListener("click", () => {
      clearStatus();
      state.currentUser = null;
      clearSessionUser();
      syncAuthUi();
      renderPosts();
      setStatus("Logged out.", "success");
    });

    nodes.postForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus();

      if (!state.currentUser) {
        setStatus("Log in first to create a post.", "warn");
        return;
      }

      const type = String(nodes.postType.value || "support");
      const project = String(nodes.postProject.value || "General").trim();
      const title = String(nodes.postTitle.value || "").trim();
      const body = String(nodes.postBody.value || "").trim();
      const parentPostId = String(nodes.postParentId ? nodes.postParentId.value : "").trim() || null;
      const parentThread = parentPostId ? getPostById(parentPostId) : null;

      if (!(type === "support" || type === "blog")) {
        setStatus("Invalid post type.", "error");
        return;
      }

      if (!project) {
        setStatus("Please choose a project.", "warn");
        return;
      }

      if (title.length < 5 || title.length > 140) {
        setStatus("Title must be 5-140 characters.", "warn");
        return;
      }

      if (body.length < 10 || body.length > 5000) {
        setStatus("Message must be 10-5000 characters.", "warn");
        return;
      }

      if (parentPostId && !parentThread) {
        setStatus("Thread target no longer exists. Reload and try again.", "error");
        return;
      }

      const finalType = parentPostId ? "support" : type;
      const finalProject = parentThread ? parentThread.project : project;

      try {
        const createdPost = await submitPost({
          type: finalType,
          project: finalProject,
          title,
          body,
          parentPostId
        });
        fillProjectSelects();
        syncFiltersFromState();
        if (parentPostId) {
          const root = getThreadRootPost(createdPost);
          openThread(root ? root.id : parentPostId, createdPost.id);
        } else {
          state.viewMode = "list";
          renderPosts();
        }
        resetPostForm();
        syncComposerUi();
        setStatus(finalType === "blog" ? "Blog post published." : (parentPostId ? "Subthread published." : "Support thread published."), "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    nodes.typeTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const type = String(target.dataset.type || "");
      if (!["all", "support", "blog"].includes(type)) {
        return;
      }

      state.typeFilter = type;
      if (state.viewMode === "thread") {
        state.viewMode = "list";
        state.activeThreadRootId = null;
        state.activeThreadPostId = null;
      }
      syncTypeTabsUi();
      syncComposerUi();
      resetPostForm();
      renderPosts();
    });

    nodes.projectFilter.addEventListener("change", () => {
      state.projectFilter = nodes.projectFilter.value || ANY_PROJECT;
      if (state.viewMode === "thread") {
        state.viewMode = "list";
        state.activeThreadRootId = null;
        state.activeThreadPostId = null;
        syncComposerUi();
        resetPostForm();
      }
      renderPosts();
    });

    nodes.searchInput.addEventListener("input", () => {
      state.searchText = nodes.searchInput.value.trim();
      if (state.viewMode === "thread") {
        state.viewMode = "list";
        state.activeThreadRootId = null;
        state.activeThreadPostId = null;
        syncComposerUi();
        resetPostForm();
      }
      renderPosts();
    });

    nodes.clearFilters.addEventListener("click", () => {
      clearStatus();
      state.typeFilter = "all";
      state.projectFilter = state.appContext || ANY_PROJECT;
      nodes.searchInput.value = "";
      state.searchText = "";
      state.viewMode = "list";
      state.activeThreadRootId = null;
      state.activeThreadPostId = null;
      syncTypeTabsUi();
      syncFiltersFromState();
      syncComposerUi();
      resetPostForm();
      renderPosts();
    });

    nodes.postList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const openButton = target.closest("[data-action='open-thread']");
      if (!(openButton instanceof HTMLButtonElement)) {
        return;
      }

      const postId = String(openButton.dataset.postId || "");
      const post = getPostById(postId);
      if (!post) {
        setStatus("Post not found.", "error");
        return;
      }

      const root = getThreadRootPost(post);
      if (!root) {
        setStatus("Thread not found.", "error");
        return;
      }

      openThread(root.id, post.id);
    });

    nodes.backToListButton.addEventListener("click", () => {
      clearStatus();
      closeThreadView();
    });

    nodes.threadPostTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const selectButton = target.closest("[data-action='select-thread-post']");
      if (!(selectButton instanceof HTMLButtonElement)) {
        return;
      }

      const postId = String(selectButton.dataset.postId || "");
      const post = getPostById(postId);
      if (!post) {
        setStatus("Subthread not found.", "error");
        return;
      }

      const root = getThreadRootPost(post);
      if (!root || root.id !== state.activeThreadRootId) {
        setStatus("Subthread is outside the current thread.", "warn");
        return;
      }

      state.activeThreadPostId = post.id;
      syncComposerUi();
      renderPosts();
    });

    nodes.threadPostDetail.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.classList.contains("comment-form")) {
        return;
      }

      event.preventDefault();
      clearStatus();

      if (!state.currentUser) {
        setStatus("Log in first to comment.", "warn");
        return;
      }

      const postId = String(form.dataset.postId || "");
      const parentCommentId = String(form.dataset.parentCommentId || "").trim() || null;
      const textarea = form.querySelector("textarea[name='body']");
      const body = textarea ? textarea.value.trim() : "";

      if (body.length < 2 || body.length > 2000) {
        setStatus("Comment must be 2-2000 characters.", "warn");
        return;
      }

      try {
        await submitComment(postId, body, parentCommentId);
        renderPosts();
        setStatus(parentCommentId ? "Reply posted." : "Comment posted.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }

  async function init() {
    applyColorMode(loadColorModePreference());
    await initBackend();
    state.store = await loadStore();
    state.currentUser = loadSessionUser();
    state.appContext = parseUrlApp();

    if ((new URLSearchParams(window.location.search).get("app") || "").trim()) {
      state.sectionPanel = "panel-posts";
    }

    addProjectIfMissing(state.appContext);
    state.store.posts.forEach((post) => addProjectIfMissing(post.project));

    fillProjectSelects();
    nodes.postProject.value = state.appContext;

    if (nodes.postProject.value !== state.appContext) {
      nodes.postProject.value = "General";
      state.appContext = "General";
    }

    state.projectFilter = state.appContext;
    syncFiltersFromState();
    syncTypeTabsUi();
    syncContextUi();
    setSectionPanel(state.sectionPanel);

    if (nodes.yearNow) {
      nodes.yearNow.textContent = String(new Date().getFullYear());
    }

    bindEvents();
    syncAuthUi();
    renderPosts();
    clearStatus();

    if (backend.notice) {
      setStatus(backend.notice, "warn");
    }
  }

  init().catch((error) => {
    console.error(error);
    setStatus("Failed to initialize the community board.", "error");
  });
})();
