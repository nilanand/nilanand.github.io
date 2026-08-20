const GITHUB_USERNAME = "nilanand";
const TOPIC = "featured";
const MAX_PROJECTS = 24;

const CACHE_KEY = "featured_projects_cache_v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const projectsGrid = document.getElementById("projects-grid");
const projectsLoading = document.getElementById("projects-loading");
const projectsError = document.getElementById("projects-error");

if (projectsGrid && projectsLoading && projectsError) {
  loadProjects();
}

async function loadProjects() {
  projectsLoading.hidden = false;
  projectsError.hidden = true;

  const freshCache = readCache(false);
  if (freshCache) {
    renderProjects(freshCache);
    projectsLoading.hidden = true;
    return;
  }

  try {
    const repos = await fetchAllRepos();
    const featured = toFeaturedProjects(repos);
    saveCache(featured);
    renderProjects(featured);
  } catch (error) {
    const staleCache = readCache(true);
    if (staleCache) {
      renderProjects(staleCache);
    }
    projectsError.hidden = false;
    console.error("Failed to load featured repositories:", error);
  } finally {
    projectsLoading.hidden = true;
  }
}

async function fetchAllRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const url =
      `https://api.github.com/users/${GITHUB_USERNAME}/repos` +
      `?per_page=100&sort=updated&direction=desc&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });

    if (!response.ok) {
      let apiMessage = "";
      try {
        const errorPayload = await response.json();
        if (errorPayload && errorPayload.message) {
          apiMessage = ` - ${errorPayload.message}`;
        }
      } catch {
        // Ignore JSON parsing issues for error payloads.
      }

      throw new Error(`GitHub API error ${response.status}${apiMessage}`);
    }

    const pageRepos = await response.json();
    if (!Array.isArray(pageRepos)) {
      throw new Error("Unexpected GitHub API response shape.");
    }

    repos.push(...pageRepos);

    if (pageRepos.length < 100) {
      break;
    }

    page += 1;
  }

  return repos;
}

function toFeaturedProjects(repos) {
  return repos
    .filter(
      (repo) => Array.isArray(repo.topics) && repo.topics.includes(TOPIC)
    )
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, MAX_PROJECTS)
    .map((repo) => ({
      name: repo.name,
      html_url: repo.html_url,
      language: repo.language || "—",
      description: repo.description || "No description provided.",
      updated_at: repo.updated_at
    }));
}

function renderProjects(projects) {
  projectsGrid.innerHTML = "";

  if (!projects.length) {
    const empty = document.createElement("p");
    empty.className = "projects-loading";
    empty.textContent = "No featured projects yet.";
    projectsGrid.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const card = document.createElement("a");
    card.className = "project-card";
    card.href = project.html_url;
    card.target = "_blank";
    card.rel = "noreferrer";
    card.setAttribute("aria-label", `Open GitHub repository: ${project.name}`);

    const title = document.createElement("h3");
    title.className = "project-title";
    title.textContent = project.name;

    const meta = document.createElement("p");
    meta.className = "project-meta";
    meta.textContent =
      `${project.language} | Updated ${formatDate(project.updated_at)}`;

    const desc = document.createElement("p");
    desc.className = "project-desc";
    desc.textContent = project.description;

    card.append(title, meta, desc);
    projectsGrid.appendChild(card);
  }
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function readCache(allowStale) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects) || !parsed.savedAt) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (!allowStale && age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.projects;
  } catch {
    return null;
  }
}

function saveCache(projects) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        projects,
        savedAt: Date.now()
      })
    );
  } catch {
    // Ignore storage errors; live rendering still works.
  }
}
