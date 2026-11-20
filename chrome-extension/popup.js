const API_URL = "http://127.0.0.1:3000/api/classify";

const classifyButton = document.getElementById("classify");
const copyButton = document.getElementById("copy");
const statusElement = document.getElementById("status");
const errorElement = document.getElementById("error");
const jsonElement = document.getElementById("json");

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
  classifyButton.disabled = loading;
  classifyButton.textContent = loading ? "Classifying…" : "Classify page";
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
      !/^(description|og:|twitter:|product:|price|author$|article:|keywords$)/i.test(
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
    document.querySelector("main, article, [role='main']") || document.body;
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

async function classifyCurrentPage() {
  clearError();
  jsonElement.hidden = true;
  jsonElement.textContent = "";
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
        "This page cannot be classified. Open a normal website and try again.",
      );
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPage,
    });

    if (!result) {
      throw new Error("Could not read the page content.");
    }

    setStatus("Classifying with the local OpenCode instance… Keep this popup open.");

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

    if (!data?.entity) {
      throw new Error("API response did not contain an entity.");
    }

    lastResult = data;
    jsonElement.textContent = JSON.stringify(data, null, 2);
    jsonElement.hidden = false;
    copyButton.disabled = false;

    setStatus(
      `Classified as ${data.entity.category} / ${data.entity.subcategory}.`,
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

classifyButton.addEventListener("click", classifyCurrentPage);
copyButton.addEventListener("click", copyResult);
