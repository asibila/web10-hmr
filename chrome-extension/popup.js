// Matches PORT in apps/api/.env. The extension cannot read env vars, so this is
// the one place the port is duplicated. The manifest grants all loopback ports,
// so only this line needs to change if the port moves.
const API_BASE = "http://127.0.0.1:3000";
const API_URL = `${API_BASE}/api/jobs`;

const saveButton = document.getElementById("save");
const openButton = document.getElementById("open");
const copyButton = document.getElementById("copy");
const statusElement = document.getElementById("status");
const errorElement = document.getElementById("error");
const resultElement = document.getElementById("result");
const titleElement = document.getElementById("job-title");
const companyElement = document.getElementById("job-company");
const salaryElement = document.getElementById("job-salary");
const badgesElement = document.getElementById("job-badges");
const jsonElement = document.getElementById("json");

const WORK_MODE_LABELS = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unspecified",
};

const EMPLOYMENT_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  freelance: "Freelance",
  other: "Other",
};

const SENIORITY_LABELS = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
  director: "Director",
  executive: "Executive",
  unknown: "Unspecified",
};

const PERIOD_SUFFIX = {
  year: "yr",
  month: "mo",
  week: "wk",
  day: "day",
  hour: "hr",
  unknown: "",
};

let lastResult = null;

function setStatus(message) {
  statusElement.textContent = message;
}

function showError(error) {
  errorElement.textContent =
    error instanceof Error ? error.message : String(error);
  errorElement.hidden = false;
}

function clearError() {
  errorElement.textContent = "";
  errorElement.hidden = true;
}

function setLoading(loading) {
  saveButton.disabled = loading;
  saveButton.textContent = loading ? "Saving…" : "Save job";
}

function money(value, currency) {
  if (currency) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      // Fall through to a plain number for an unrecognised currency code.
    }
  }

  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function formatSalary(job) {
  const min = job.salary_min;
  const max = job.salary_max;
  const currency = job.salary_currency;
  const suffix = PERIOD_SUFFIX[job.salary_period] || "";

  if (min == null && max == null) {
    return "Salary not listed";
  }

  let range;

  if (min != null && max != null && min !== max) {
    range = `${money(min, currency)} – ${money(max, currency)}`;
  } else if (min != null) {
    range = `${money(min, currency)}${max != null ? " +" : ""}`;
  } else {
    range = `Up to ${money(max, currency)}`;
  }

  return suffix ? `${range} / ${suffix}` : range;
}

function addBadge(text, modifier) {
  const badge = document.createElement("span");
  badge.className = `badge${modifier ? ` badge--${modifier}` : ""}`;
  badge.textContent = text;
  badgesElement.appendChild(badge);
}

function renderResult(data) {
  const job = data.job;

  titleElement.textContent = job.title;
  companyElement.textContent =
    [job.company, job.location].filter(Boolean).join(" · ") ||
    job.source ||
    "Location not listed";
  salaryElement.textContent = formatSalary(job);

  badgesElement.textContent = "";
  addBadge(WORK_MODE_LABELS[job.work_mode] || "Unspecified", job.work_mode);
  addBadge(EMPLOYMENT_LABELS[job.employment_type] || "Other");
  addBadge(SENIORITY_LABELS[job.seniority] || "Unspecified");

  if (data.duplicate) {
    addBadge("Refreshed existing posting", "note");
  }

  jsonElement.textContent = JSON.stringify(data, null, 2);
  resultElement.hidden = false;
  openButton.hidden = false;
  copyButton.disabled = false;
}

function readPage() {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

  const jsonLd = [];
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );

  for (const script of scripts) {
    const raw = (script.textContent || "").trim().slice(0, 50000);
    if (!raw) {
      continue;
    }

    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      jsonLd.push({ _raw: raw.slice(0, 50000) });
    }

    if (jsonLd.length >= 20) {
      break;
    }
  }

  const metadata = {};
  const metaElements = document.querySelectorAll("meta[content]");

  for (const element of metaElements) {
    const key =
      element.getAttribute("property") ||
      element.getAttribute("name") ||
      element.getAttribute("itemprop");

    if (
      !key ||
      !/^(description|og:|twitter:|product:|price|author$|article:|keywords$|jobposting:)/i.test(
        key,
      )
    ) {
      continue;
    }

    metadata[key] = clean(element.getAttribute("content")).slice(0, 2000);
  }

  metadata.lang = document.documentElement.lang || null;
  metadata.canonical =
    document.querySelector('link[rel="canonical"]')?.href || null;
  metadata.contentType = document.contentType || null;

  const main =
    document.querySelector(
      "main, article, [role='main'], [class*='job-description'], [class*='job-details']",
    ) || document.body;
  const pageText = clean((main?.innerText || "").slice(0, 60000));
  const title = clean(document.title).slice(0, 2000);
  const content = pageText || title || "No visible text on this page.";

  return {
    url: location.href,
    title,
    content,
    jsonLd,
    metadata,
    capturedAt: new Date().toISOString(),
  };
}

async function saveCurrentPage() {
  clearError();
  resultElement.hidden = true;
  openButton.hidden = true;
  copyButton.disabled = true;
  lastResult = null;

  setLoading(true);
  setStatus("Reading the current page…");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    if (!/^https?:/i.test(tab.url || "")) {
      throw new Error(
        "This page cannot be saved. Open a normal website and try again.",
      );
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPage,
    });

    if (!result) {
      throw new Error("Could not read the page content.");
    }

    setStatus("Extracting the job with the local model… Keep this popup open.");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    });

    const responseText = await response.text();
    let data;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error(
        `API returned ${response.status} with a non-JSON body: ${responseText.slice(0, 500)}`,
      );
    }

    if (!response.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join("; ")
        : data?.message || `API returned ${response.status}.`;
      throw new Error(message);
    }

    if (!data?.job) {
      throw new Error("API response did not contain a job.");
    }

    lastResult = data;
    renderResult(data);

    setStatus(
      data.duplicate
        ? "That posting was already in your index, so it was refreshed."
        : "Saved to your job index.",
    );
  } catch (error) {
    setStatus("");
    showError(error);
  } finally {
    setLoading(false);
  }
}

async function copyResult() {
  if (!lastResult) {
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
    setStatus("Copied JSON to the clipboard.");
  } catch (error) {
    showError(error);
  }
}

function openIndex() {
  const job = lastResult?.job;

  // Saved jobs get their stable asset link; otherwise open the index.
  chrome.tabs.create({
    url: job?.id
      ? `${API_BASE}/asset/${encodeURIComponent(job.id)}`
      : `${API_BASE}/`,
  });
}

saveButton.addEventListener("click", saveCurrentPage);
copyButton.addEventListener("click", copyResult);
openButton.addEventListener("click", openIndex);
