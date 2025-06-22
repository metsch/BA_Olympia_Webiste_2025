const containerEl = document.querySelector("#container");
const bilderEl = document.querySelector("#bilder");
// Referenz auf Tag-Container und Anzeige-Element
const tagContainer = document.querySelector(".tagContainer");
const auswahlZahlEl = document.querySelector(".auswahlZahl");
const auswahlZahlTag = document.querySelector("#auswahlZahlTag");
//const listeOrtEl = document.querySelector(".listeTextOrt");
//const listeThemaEl = document.querySelector(".listeTextThema");
const buttonTagsNav = document.querySelector(".buttonTagsNav");
const navButtonLeiste = document.querySelector(".navButtonLeiste");
const startboxContent = document.querySelector(".startbox-content");
const wordmarkeEl = document.querySelector(".wordmarke");
const wordmarke = document.querySelector(".wordmarke");
//const listeAttributeStart = document.querySelector(".listeAttributeStart");
const impressumboxBackdrop = document.querySelector(".impressumbox-backdrop");
const datenbankInfo = document.querySelector(".datenbankbox-info");
const resetBtn = document.getElementById("resetButton");
const randomBtn = document.getElementById("zufaelligWaehlen");
const selectedTagsEl = document.querySelector(".selectedTags");
const scrollContainerEl = document.querySelector(".tagContainer");
const linie = document.querySelector(".linie");
let inDatenbankBox = false;
let fullData = []; // Alle Daten aus JSON
let filteredData = []; // Gefilterte Daten je nach Tags
let currentIndex = 0;
const BATCH_SIZE = 50;
let isLoading = false;
let startboxWheelHandler;
let archivOpen = false;
const beschreibungTagsLightbox = document.querySelector(
  "#beschreibungTagsLightbox"
);
let requireAllTags = false; // falls true: AND-Filter, sonst weiter OR-Filter

// aktueller Zoom-Faktor
let scale = 1;
// Zeit (ms) bis Auto-Scroll startet
const IDLE_DELAY = 1_500;
// Wie viele Pixel pro Tick gescrollt werden
const AUTO_SCROLL_STEP = 1;
// Wie oft pro Sekunde der Scroll-Tick läuft
const AUTO_SCROLL_INTERVAL_MS = 10;

let idleTimer;
let autoScrollInterval;

// Ausgewählte Tags
const selectedTags = new Set();

// throttle helper
function throttle(fn, wait) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

// idle timer reset
function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearInterval(autoScrollInterval);
  idleTimer = setTimeout(startAutoScroll, IDLE_DELAY);
}

function startAutoScroll() {
  autoScrollInterval = setInterval(() => {
    containerEl.scrollBy({ top: AUTO_SCROLL_STEP });
    handleScroll();
  }, AUTO_SCROLL_INTERVAL_MS);
}

function onUserActivity() {
  resetIdleTimer();
}

// Initial
fetchData();
resetIdleTimer();

window.addEventListener("wheel", onUserActivity, { passive: true });
containerEl.addEventListener("mousemove", onUserActivity, { passive: true });

async function fetchData() {
  try {
    const resp = await fetch("../data/null.json");
    const jsonData = await resp.json();
    fullData = shuffle(jsonData);
    // Tags rendern
    renderTags(fullData);
    applyFilter();
    renderDatabase();
    //renderStartLists(fullData);
    // Scroll + zoom listeners
    containerEl.addEventListener(
      "scroll",
      throttle(() => {
        handleScroll();
        parallaxScroll();
      }, 100)
    );
    containerEl.addEventListener("wheel", handleZoom, { passive: false });
  } catch (e) {
    console.warn(e);
  }
}

// Render- und Klick-Handler für Tags
// Globale Variable, um auch in der Lightbox auf die Häufigkeit zugreifen zu können
const tagFrequencies = {};

function renderTags(data) {
  tagContainer.innerHTML = "";
  // Leere die globale Frequenztabelle vorher
  Object.keys(tagFrequencies).forEach((key) => delete tagFrequencies[key]);

  data.forEach((item) => {
    [item.Ort, item.Thema].forEach((term) => {
      if (term) tagFrequencies[term] = (tagFrequencies[term] || 0) + 1;
    });
  });

  Object.entries(tagFrequencies)
    .sort(([, a], [, b]) => b - a)
    .forEach(([term]) => {
      const count = tagFrequencies[term];
      const tag = document.createElement("div");
      tag.classList.add("tag");
      tag.dataset.term = term;
      tag.dataset.count = count;

      const countSpan = document.createElement("span");
      countSpan.classList.add("tag-count");
      countSpan.textContent = count;

      tag.appendChild(countSpan);
      tag.append(` ${term}`);
      tag.addEventListener("click", onTagClick);
      tagContainer.appendChild(tag);
    });
}

function onTagClick(e) {
  const tag = e.currentTarget;
  const term = tag.dataset.term;

  if (selectedTags.has(term)) {
    selectedTags.delete(term);
    tag.classList.remove("selected");

    // 1. Animation starten
    tag.classList.add("tag-leave");

    // 2. Nach der Animation zurückverschieben
    setTimeout(() => {
      tag.classList.remove("tag-leave");
      scrollContainerEl.appendChild(tag);
    }, 300); // <- Dauer muss zur CSS-Transition passen
  } else {
    selectedTags.add(term);
    tag.classList.add("selected");
    selectedTagsEl.prepend(tag);
  }

  applyFilter();
}

function updateAuswahlSumme() {
  if (selectedTags.size === 0) {
    auswahlZahlEl.innerText = "504"; // Default-Zahl
  } else {
    auswahlZahlEl.innerText = filteredData.length;
  }
}

function applyFilter() {
  if (selectedTags.size === 0) {
    filteredData = fullData.slice();
  } else {
    filteredData = fullData.filter((item) => {
      return Array.from(selectedTags).some(
        (tag) => item.Ort === tag || item.Thema === tag
      );
    });
  }
  // Anzeige der Anzahl aktualisieren
  if (selectedTags.size === 0) {
    auswahlZahlEl.innerText = "504";
  } else {
    updateAuswahlSumme();
  }
  // Anzeige der Gesamtzahl der Treffer (nicht nur geladene Batches)
  containerEl.scrollTop = 0;
  bilderEl.innerHTML = "";
  currentIndex = 0;
  handleScroll();

  // Reset-Button Aktivierung/Deaktivierung basierend auf Tag-Auswahl

  if (selectedTags.size === 0) {
    resetBtn.classList.add("disabled");
  } else {
    resetBtn.classList.remove("disabled");
  }
}

function handleScroll() {
  // Endlos-Scroll: wenn Ende erreicht, zurück zum Anfang
  if (
    containerEl.scrollTop + containerEl.clientHeight >=
      containerEl.scrollHeight - 1000 &&
    !isLoading
  ) {
    isLoading = true;
    // Reset index, wenn alle Bilder durch
    if (currentIndex >= filteredData.length) {
      currentIndex = 0;
      // Optional: neu mischen für zufällige Reihenfolge
      filteredData = shuffle(filteredData);
    }
    loadMoreImages();
    isLoading = false;
  }
}

function parallaxScroll() {
  window.requestAnimationFrame(() => {
    document.querySelectorAll(".bildAll img").forEach((img) => {
      const speed = parseFloat(img.dataset.speed);
      const r = img.parentElement.getBoundingClientRect();
      img.style.transform = `translateY(${r.top * (1 - speed)}px)`;
    });
  });
}

function loadMoreImages() {
  for (let i = 0; i < BATCH_SIZE; i++) {
    if (currentIndex >= filteredData.length) break;
    const el = filteredData[currentIndex++];

    const wrapper = document.createElement("div");
    wrapper.classList.add("bildAll");
    wrapper.style.transform = `translateZ(${getRandomNumber(
      -20,
      -80
    )}px) scale(${getRandomNumber(1.05, 1.2)})`;
    wrapper.style.opacity = "0"; // ← vorerst unsichtbar

    let media;
    if (/\.(mp4|mov)$/i.test(el.Name)) {
      media = document.createElement("video");
      media.src = "img/" + el.Name;
      media.autoplay = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
      media.setAttribute("playsinline", "");
      media.preload = "metadata";

      // Ladeüberwachung für Video
      media.addEventListener("loadeddata", () => handleMediaLoaded(wrapper));
      media.addEventListener("error", () =>
        console.warn("Video konnte nicht geladen werden:", media.src)
      );
    } else {
      media = document.createElement("img");
      media.src = "img/" + el.Name;
      media.loading = "lazy";
      media.alt = el.Name.replace(/\.[^.]+$/, "");

      if (media.complete) {
        handleMediaLoaded(wrapper);
      } else {
        media.addEventListener("load", () => handleMediaLoaded(wrapper));
        media.addEventListener("error", () =>
          console.warn("Bild konnte nicht geladen werden:", media.src)
        );
      }
    }

    media.style.width = getRandomNumber(200, 600) + "px";
    media.dataset.speed = getRandomNumber(0.5, 1.5);
    media.classList.add("gallery-media");

    const cap = document.createElement("p");
    cap.innerText = el.Ort;
    cap.classList.add("caption");

    wrapper.append(media, cap);
    bilderEl.appendChild(wrapper);
  }
}

// Funktion: sichtbar machen mit weichem Übergang
function handleMediaLoaded(wrapper) {
  wrapper.style.transition = "opacity 0.6s ease";
  wrapper.style.opacity = "1";
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getRandomNumber(min, max) {
  return Math.random() * (max - min) + min;
}

// Lightbox-Elemente (oben einmalig deklarieren)
const lightbox = document.getElementById("lightbox");
const lbInfo = lightbox.querySelector(".lightbox-info");
const lbClose = lightbox.querySelector(".lightbox-close");
const lbInfoButton = lightbox.querySelector(".lbInfoButton");

let lbAutoClose;

function openLightbox(mediaEl) {
  // entferne altes <img> oder <video>
  const old = lightbox.querySelector(
    ".lightbox-content img, .lightbox-content video"
  );
  if (old) old.remove();

  // Metadaten suchen
  const src = mediaEl.src;
  const meta = findMetaBySrc(src);
  function findMetaBySrc(src) {
    const url = new URL(src, window.location.href);
    const filename = url.pathname.split("/").pop() || "";
    console.log(filename);
    return (
      fullData.find((item) => encodeURIComponent(item.Name) === filename) || {}
    );
  }
  console.log(src);

  // Neues Lightbox-Media erstellen
  let lbMedia;
  if (mediaEl.tagName === "VIDEO") {
    lbMedia = document.createElement("video");
    lbMedia.src = src;
    lbMedia.autoplay = true;
    lbMedia.loop = true;
    lbMedia.muted = true;
    lbMedia.playsInline = true;
  } else {
    lbMedia = document.createElement("img");
    lbMedia.src = src;
    lbMedia.alt = mediaEl.alt || meta.Name;
  }
  lbMedia.classList.add("lightbox-img");

  // Einfügen vor der Info-Box
  const content = lightbox.querySelector(".lightbox-content");
  content.insertBefore(lbMedia, content.querySelector(".lightbox-info"));

  // Meta-Info
  lbInfo.innerHTML = `
  <p class="lbInfoAttribut"><strong>Nr</strong> ${meta._nr || "?"}</p>
  <p class="lbInfoAttribut">
    <strong>Name</strong>
    <span class="lbInfoTag">${meta.Name}</span>
  </p>
 
  <p class="lbInfoAttribut">
    <strong>Datum</strong>
    <span class="lbInfoTag">${meta.Datum}</span>
  </p>
  <p class="lbInfoAttribut">
    <strong>Quelle</strong>
    <span class="lbInfoTag">${meta.Fotograf_Quelle}</span>
  </p>
 
`;

  lbInfoButton.innerHTML = `
<div class="tag selected lightbox-tag lightbox-tag-hover" data-term="${
    meta.Thema
  }">
  <span class="tag-count">${tagFrequencies[meta.Thema] || 0}</span>
  ${meta.Thema}
</div>
<div class="tag selected lightbox-tag" data-term="${meta.Ort}">
  <span class="tag-count">${tagFrequencies[meta.Ort] || 0}</span>
  ${meta.Ort}
</div>
`;

  // Event-Listener JETZT hinzufügen – weil die Tags jetzt im DOM sind
  document.querySelectorAll(".lightbox-tag").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      const term = tagEl.dataset.term;

      if (!term) return;

      // 1. Ausgewählte oben leeren
      selectedTags.clear();
      selectedTagsEl.innerHTML = "";

      // 2. Entferne Tag aus .tagContainer (falls vorhanden)
      const originalTag = scrollContainerEl.querySelector(
        `.tag[data-term="${CSS.escape(term)}"]`
      );

      if (originalTag) {
        originalTag.classList.add("selected");
        selectedTagsEl.prepend(originalTag);
      } else {
        // Notfall: tag war noch nie da → erzeugen
        const fallbackTag = document.createElement("div");
        fallbackTag.classList.add("tag", "selected");
        fallbackTag.dataset.term = term;
        fallbackTag.innerHTML = `
          <span class="tag-count">${tagFrequencies[term] || 0}</span>
          ${term}
        `;
        fallbackTag.addEventListener("click", () => {
          fallbackTag.remove();
          selectedTags.delete(term);
          applyFilter();
        });
        selectedTagsEl.prepend(fallbackTag);
      }

      selectedTags.add(term);
      applyFilter();
    });
  });

  // Wenn wir gerade im „closing“-Zustand waren, rausnehmen,
  // damit die Slide-In-Animation wieder greift
  lightbox.classList.remove("closing");

  // Lightbox öffnen
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function ClickTagLightbox() {
  var div = document.getElementById("myDiv");
  if (div.style.display === "none") {
    div.style.display = "block";
  } else {
    div.style.display = "none";
  }
}

function closeLightbox() {
  // 1) Klasse setzen, um die Slide-Out-Animation zu triggern
  lightbox.classList.add("closing");
  document.body.style.overflow = "";

  clearTimeout(lbAutoClose);

  // 2) Nach Ende der Animation tatsächlich ausblenden
  setTimeout(() => {
    lightbox.classList.remove("closing");
    lightbox.setAttribute("aria-hidden", "true");
  }, 500); // Dauer muss mit deiner CSS-Animation übereinstimmen
}

// Close-Button

const lightboxBackdrop = lightbox.querySelector(".lightbox-backdrop");
const sidebar = document.querySelector(".sidebar");
if (lightboxBackdrop && sidebar) {
  // Klick auf Backdrop – aber nur wenn direkt

  // Klick auf Sidebar – immer schließen
  sidebar.addEventListener("click", () => {
    closeLightbox();
  });

  // Klick auf lightbox-content – nur direkt, keine Kinder!
  const lightboxContent = document.querySelector(".lightbox-content");
  if (lightboxContent) {
    lightboxContent.addEventListener("click", (e) => {
      if (e.target === lightboxContent) {
        closeLightbox();
      }
    });
  }
}

// Klick auf Bild oder Video → openLightbox aufrufen
bilderEl.addEventListener("click", (e) => {
  const mediaEl = e.target.closest(".bildAll img, .bildAll video");
  if (!mediaEl) return;
  openLightbox(mediaEl);
});

randomBtn.addEventListener("click", () => {
  // Schritt 1: Auswahl zurücksetzen – vorherige ausgewählte Tags zurückschieben
  const previouslySelected = Array.from(
    selectedTagsEl.querySelectorAll(".tag")
  );
  previouslySelected.forEach((tag) => {
    tag.classList.remove("selected");
    scrollContainerEl.appendChild(tag);
  });
  selectedTags.clear();

  // Schritt 2: Neue Auswahl aus dem Scrollcontainer
  const tags = Array.from(scrollContainerEl.querySelectorAll(".tag"));
  const terms = tags.map((tag) => tag.dataset.term);

  const count = Math.floor(Math.random() * terms.length) + 1;
  const shuffled = terms.sort(() => Math.random() - 0.5);
  const pick = shuffled.slice(0, count);

  tags.forEach((tag) => {
    const term = tag.dataset.term;
    if (pick.includes(term)) {
      selectedTags.add(term);
      tag.classList.add("selected");
      selectedTagsEl.appendChild(tag);
    }
  });

  applyFilter();
});

// Reset-Button: alle Tag-Auswahl löschen

resetBtn.addEventListener("click", () => {
  // Alle ausgewählten Tags zurücksetzen
  const selectedEls = Array.from(
    selectedTagsEl.querySelectorAll(".tag.selected")
  );

  selectedEls.forEach((tag) => {
    tag.classList.remove("selected");
    scrollContainerEl.appendChild(tag);
  });

  selectedTags.clear(); // logische Auswahl zurücksetzen

  applyFilter();
});

// Array, in dem wir alle Overlay-Instanzen sammeln
const overlayBoxes = [];
// Element, das nur sichtbar sein soll, wenn keine Box offen ist
const tagAuswahlEl = document.querySelector(".tagAuswahl");

document
  .querySelectorAll("#archivbox .tagAuswahl .tag")
  .forEach((tag) => tag.classList.add("visible"));

/**
 * Prüft, ob mindestens eine Overlay-Box offen ist,
 * und blendet die .tagAuswahl entsprechend ein/aus.
 */
function updateTagAuswahlVisibility() {
  const tagAuswahlMitLinie = document.querySelector(".tagAuswahlMitLinie");
  const anyOpen = overlayBoxes.some(
    (o) => o.box.getAttribute("aria-hidden") === "false"
  );
  if (anyOpen) {
    tagAuswahlMitLinie.style.display = "none";
  } else {
    tagAuswahlMitLinie.style.display = "";
  }
}

/**
 * Vereinfacht das Open/Close-Verhalten für eine Overlay-Box
 *
 * @param {string} btnId        ID des Open-Buttons
 * @param {string} boxId        ID der Overlay-Box
 * @param {string} closeSel     CSS-Selektor für den Close-Button in der Box
 * @param {number} animDuration Dauer der CSS-Animation in ms (muss zur CSS passen)
 */
function setupOverlayBox(btnId, boxId, closeSel, animDuration = 500) {
  const btn = document.getElementById(btnId);
  const box = document.getElementById(boxId);
  const closeBtn = box ? box.querySelector(closeSel) : null;
  if (!btn || !box || !closeBtn) return;

  // Funktion zum Schließen der Box
  function closeBox() {
    box.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      box.style.display = "none";

      // NUR HIER ist wirklich garantiert, dass sie als "geschlossen" gilt
      updateTagAuswahlVisibility();
      updateButtonOpacity();
    }, animDuration);
  }

  function openBox() {
    overlayBoxes.forEach(({ box: otherBox, close }) => {
      if (otherBox !== box) close();
    });
    if (box.getAttribute("aria-hidden") === "true") {
      box.style.display = "block";
      box.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
    updateTagAuswahlVisibility();
    updateButtonOpacity();
  }

  btn.addEventListener("click", openBox);
  closeBtn.addEventListener("click", closeBox);

  // Registrierung im globalen Array
  overlayBoxes.push({ box, close: closeBox });
}

// Archiv-Button: Schließt beim Klick wirklich ALLE Overlay-Boxen
const archivBtn = document.getElementById("archivButton");
if (archivBtn) {
  archivBtn.addEventListener("click", () => {
    console.log("Archiv Button geklickt");
    archivOpen = true; // globale Variable setzen

    overlayBoxes.forEach(({ close }) => close());
    updateTagAuswahlVisibility();
  });
}

// Initialisierung der Overlay-Boxen
setupOverlayBox("startButton", "startbox", ".startbox-close", 500);
setupOverlayBox("impressumButton", "impressumbox", ".impressumbox-close", 500);
setupOverlayBox("datenbankButton", "datenbankbox", ".datenbankbox-close", 500);
setupOverlayBox("archivButton", "archivbox", null);

// Klick auf den gelben Hintergrund schließt die Box (nicht den Inhalt)
function setupBackdropClickToClose(boxId, backdropSelector) {
  const backdrop = document.querySelector(backdropSelector);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      // Nur schließen, wenn direkt auf das backdrop geklickt wurde – nicht auf Inhalt
      if (e.target === backdrop) {
        const closeObj = overlayBoxes.find((o) => o.box.id === boxId);
        if (closeObj) closeObj.close();
      }
    });
  }
}

function updateButtonOpacity() {
  const buttons = document.querySelectorAll(".navButton");
  const archivButton = document.getElementById("archivButton");
  const impressumButton = document.getElementById("impressumButton");
  const datenbankButton = document.getElementById("datenbankButton");

  const startboxOpen = overlayBoxes.some(
    (o) =>
      o.box.id === "startbox" && o.box.getAttribute("aria-hidden") === "false"
  );

  const startboxBackdrop = document.querySelector(
    "#startbox .startbox-backdrop"
  );
  if (startboxBackdrop) {
    startboxBackdrop.addEventListener("click", () => {
      const closeObj = overlayBoxes.find((o) => o.box.id === "startbox");
      if (closeObj) closeObj.close();
    });
  }

  const impressumboxOpen = overlayBoxes.some(
    (o) =>
      o.box.id === "impressumbox" &&
      o.box.getAttribute("aria-hidden") === "false"
  );
  const impressumboxBackdrop = document.querySelector(
    "#impressumbox .impressumbox-backdrop"
  );
  if (impressumboxBackdrop) {
    impressumboxBackdrop.addEventListener("click", () => {
      const closeObj = overlayBoxes.find((o) => o.box.id === "impressumbox");
      if (closeObj) closeObj.close();
    });
  }

  const datenbankboxOpen = overlayBoxes.some(
    (o) =>
      o.box.id === "datenbankbox" &&
      o.box.getAttribute("aria-hidden") === "false"
  );

  const datenbankboxBackdrop = document.querySelector(
    "#datenbankbox .datenbankbox-backdrop"
  );
  if (datenbankboxBackdrop) {
    datenbankboxBackdrop.addEventListener("click", () => {
      const closeObj = overlayBoxes.find((o) => o.box.id === "datenbankbox");
      if (closeObj) closeObj.close();
    });
  }

  if (startboxOpen) {
    buttons.forEach((button) => {
      button.style.opacity = button.id === "startButton" ? "1" : "0.2";
      button.style.color = "black";
      follower.style.color = "black";
      navButtonLeiste.style.borderLeft = "3px solid black";
      wordmarke.style.borderLeft = "3px solid black";

      wordmarkeEl.style.color = "black";
    });
    setCursorColor("black");
  } else if (impressumboxOpen) {
    buttons.forEach((button) => {
      button.style.opacity = button.id === "impressumButton" ? "1" : "0.2";
      button.style.color = "black";
      follower.style.color = "black";
      navButtonLeiste.style.borderLeft = "3px solid black";
      wordmarke.style.borderLeft = "3px solid black";

      wordmarkeEl.style.color = "black";
    });
    setCursorColor("black");
  } else if (datenbankboxOpen) {
    buttons.forEach((button) => {
      button.style.opacity = button.id === "datenbankButton" ? "1" : "0.2";
      button.style.color = "white";
      follower.style.color = "white";
      navButtonLeiste.style.borderLeft = "3px solid white";
      wordmarke.style.borderLeft = "3px solid white";
      wordmarkeEl.style.color = "white";
    });

    setCursorColor("white"); // ← HIER Cursor auf weiß setzen
  } else if (archivOpen) {
    buttons.forEach((button) => {
      button.style.opacity = button.id === "archivButton" ? "1" : "0.2";
      follower.style.color = "black";
      button.style.color = "black";
      wordmarke.style.borderLeft = "3px solid black";

      wordmarkeEl.style.color = "black";
      navButtonLeiste.style.borderLeft = "3px solid black";
    });
    setCursorColor("black");
  } else {
    // fallback
    buttons.forEach((button) => {
      button.style.opacity = button.id === "archivButton" ? "1" : "0.2";
      follower.style.color = "black";
      button.style.color = "black";
      wordmarke.style.borderLeft = "3px solid black";

      wordmarkeEl.style.color = "black";
      navButtonLeiste.style.borderLeft = "3px solid black";
    });
    setCursorColor("black");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Hier sicherstellen, dass die Funktionen erst aufgerufen werden, wenn die DOM vollständig geladen ist
  updateTagAuswahlVisibility();
  updateButtonOpacity();
});

if (wordmarkeEl) {
  wordmarkeEl.addEventListener("click", () => {
    location.reload();
  });
}

// ——— Render die komplette Datenbank-Tabelle ———
function renderDatabase() {
  const infoEl = document.querySelector(".datenbankbox-info");
  const previewBox = document.querySelector(".datenbankBild");
  const previewImg = previewBox.querySelector("img");
  const previewVid = previewBox.querySelector("video");

  infoEl.innerHTML = ""; // klarmachen

  // 1) Alphabetisch nach Name sortieren
  const sorted = [...fullData].sort((a, b) =>
    a.Name.localeCompare(b.Name, undefined, { sensitivity: "base" })
  );

  // 2) Tabelle aufbauen
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Nr.</th>
        <th>Name</th>
        <th>Ort</th>
        <th>Thema</th>
        <th>Datum</th>
        <th>Quelle</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");

  sorted.forEach((item, i) => {
    // Tr anlegen und Zellen füllen
    const tr = document.createElement("tr");
    const nr = String(i + 1).padStart(3, "0");
    const ort = item.Ort || "";
    const thema = item.Thema || "";
    const datum = item.Datum || "";
    const quelle = item.Fotograf_Quelle || item.Quelle || "";

    item._nr = nr;

    tr.innerHTML = `
      <td>${nr}</td>
      <td>${item.Name}</td>
      <td>${ort}</td>
      <td>${thema}</td>
      <td>${datum}</td>
      <td>${quelle}</td>
    `;

    // Hover-Preview: Bild oder Video
    tr.addEventListener("mouseenter", () => {
      const isVid = /\.(mp4|mov)$/i.test(item.Name);
      const url = "img/" + item.Name;
      if (isVid) {
        previewVid.src = url;
        previewImg.src = "";
        previewVid.style.display = "block";
        previewImg.style.display = "none";
      } else {
        previewImg.src = url;
        previewVid.src = "";
        previewImg.style.display = "block";
        previewVid.style.display = "none";
      }
      previewBox.classList.add("show");
    });

    tr.addEventListener("mouseleave", () => {
      previewBox.classList.remove("show");
      // nach der CSS-Transition (300ms) den src leeren
    });

    tbody.appendChild(tr);
    // Bei Klick auf Zeile → Datenbankbox schließen & Lightbox öffnen
    tr.addEventListener("click", () => {
      const datenbankbox = document.getElementById("datenbankbox");
      const closeObj = overlayBoxes.find((o) => o.box.id === "datenbankbox");

      if (closeObj) {
        closeObj.close(); // Schließt die Box

        // Öffne die Lightbox nach kurzem Delay (damit die Animation durchläuft)
        setTimeout(() => {
          const mediaEl = document.createElement(
            item.Name.match(/\.(mp4|mov)$/i) ? "video" : "img"
          );
          mediaEl.src = "img/" + item.Name;

          openLightbox(mediaEl); // ← deine bereits existierende Lightbox-Funktion
        }, 300);
      }
    });
  });

  table.appendChild(tbody);
  infoEl.appendChild(table);
}

const follower = document.getElementById("follower");
let mouseX = 0,
  mouseY = 0;
let currentX = 0,
  currentY = 0;
const delay = 0.1; // Je kleiner, desto schneller folgt das Div

// Mausposition live updaten
document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function animate() {
  // Interpolation für sanftes Nachziehen
  currentX += (mouseX - currentX) * delay;
  currentY += (mouseY - currentY) * delay;

  follower.style.transform = `translate(${currentX}px, ${currentY}px)`;

  requestAnimationFrame(animate);
}

animate();

// Setzt den Text und die Farbe des Followers (außerhalb der Datenbankbox)
function setFollower(content = "", color = "white", isHTML = false) {
  follower.style.color = color;
  if (isHTML) {
    follower.innerHTML = content;
  } else {
    follower.textContent = content;
  }
}

// Rücksetzen beim Schließen der Datenbankbox
const datenbankboxBackdrop = document.querySelector(
  "#datenbankbox .datenbankbox-backdrop"
);
if (datenbankboxBackdrop) {
  datenbankboxBackdrop.addEventListener("click", () => {
    const closeObj = overlayBoxes.find((o) => o.box.id === "datenbankbox");
    if (closeObj) closeObj.close();
    inDatenbankBox = false;
    setFollower(); // Standard zurück
  });
}

// ——— Standardbereiche ———
// Hilfsfunktion zum Hinzufügen von Hover-Text
function addHoverText(
  selector,
  content,
  color = "white",
  isHTML = false,
  onlyIfLightboxOpen = false,
  cursorColor = null // optional neue Farbe
) {
  const el = document.querySelector(selector);
  if (!el) return;

  el.addEventListener("mouseenter", () => {
    const lightbox = document.getElementById("lightbox");
    const isLightboxOpen =
      lightbox && lightbox.getAttribute("aria-hidden") === "false";

    if (onlyIfLightboxOpen && !isLightboxOpen) return;

    const datenbankbox = document.getElementById("datenbankbox");
    const isDatenbankOpen =
      datenbankbox?.getAttribute("aria-hidden") === "false";
    const finalColor = isDatenbankOpen ? "white" : color;

    setFollower(content, finalColor, isHTML);

    if (cursorColor) setCursorColor(cursorColor);

    follower.setAttribute("data-active", selector);
  });

  el.addEventListener("mouseleave", () => {
    if (follower.getAttribute("data-active") === selector) {
      setFollower();
      follower.removeAttribute("data-active");

      const datenbankbox = document.getElementById("datenbankbox");
      const isOpen = datenbankbox?.getAttribute("aria-hidden") === "false";

      setCursorColor(isOpen ? "white" : "black");
      follower.style.color = isOpen ? "white" : "black"; // ← DAS hat bisher gefehlt
    }
  });
}

const hoverMappings = [
  {
    selectors: ["#container", ".tagContainer", ".listeAttributeStart"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>scroll
      </span>
      <span class="cursorStylingLight">&</span>
      <span class="cursorStylingBold">click</span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
    cursorColor: "#ffff00",
  },
  {
    selectors: [".selectedTags"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>click
      </span>
      <span class="cursorStylingLight">&</span>
      <span class="cursorStylingBold">delete</span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
    cursorColor: "#ffff00",
  },

  {
    selectors: [
      ".impressumbox-backdrop",
      "#impressumbox",
      ".lightbox-backdrop",
    ],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>click
      </span>
      <span class="cursorStylingLight">&</span>
      <span class="cursorStylingBold">close</span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
  },
  {
    selectors: [
      ".buttonTagsNav",
      ".navButton",
      "#archivButton",
      "#impressumButton",
      "#datenbankButton",
    ],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>click
      </span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
  },
  {
    selectors: ["#zufaelligWaehlen", "#resetButton"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>click
      </span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
    cursorColor: "#ffff00",
  },
  {
    selectors: [".startbox-content"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>click
      </span>
      <span class="cursorStylingLight">&</span>
      <span class="cursorStylingBold">start</span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
  },
  {
    selectors: [".wordmarke"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>reload
      </span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "black",
  },

  {
    selectors: [".datenbankbox-backdrop"],
    text: `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>close
      </span>
      <span class="cursorStylingLight">}</span>
    `,
    color: "white",
  },
];

addHoverText(
  ".sidebar",
  `
    <span class="cursorStylingBold">
      <span class="cursorStylingLight">{</span>close</span>
      <span class="cursorStylingLight">}</span>
    </span>
  `,
  "black",
  true,
  true,
  "#ffff00"
  // ← Nur wenn Lightbox offen ist
);

addHoverText(
  ".lbInfoButton",
  `
    <span class="cursorStylingBold">
      <span class="cursorStylingLight">{</span>click
    </span>
    <span class="cursorStylingLight">}</span>
  `,
  "black",
  true,
  true // Nur wenn Lightbox offen
);
// Datenbankbox-Info: scroll
addHoverText(
  ".datenbankbox-info",
  `
      <span class="cursorStylingBold">
        <span class="cursorStylingLight">{</span>scroll
      </span>
      <span class="cursorStylingLight">&</span>
      <span class="cursorStylingBold">click</span>
      <span class="cursorStylingLight">}</span>
    `,
  "#ffff00",
  true,
  false,
  "#ffff00"
);

document.querySelectorAll(".datenbankbox-info").forEach((el) => {
  el.addEventListener("mouseleave", (e) => {
    const backdrop = document.querySelector(".datenbankbox-backdrop");
    if (backdrop && backdrop.contains(e.relatedTarget)) {
      setFollower(
        `<span class="cursorStylingBold"><span class="cursorStylingLight">{</span>close</span><span class="cursorStylingLight">}</span>`,
        "white",
        true,
        false,
        "#ffff00"
      );
      follower.setAttribute("data-active", ".datenbankbox-backdrop");
    }
  });
});

document.querySelectorAll(".lbInfoButton").forEach((el) => {
  el.addEventListener("mouseleave", (e) => {
    const backdrop = document.querySelector(".lightbox-backdrop");
    if (backdrop && backdrop.contains(e.relatedTarget)) {
      // Du bist wieder in der Lightbox – setze den "Close"-Follower neu
      setFollower(
        `<span class="cursorStylingBold"><span class="cursorStylingLight">{</span>close</span><span class="cursorStylingLight">}</span>`,
        "black",
        true
      );
      follower.setAttribute("data-active", ".lightbox-backdrop");
    }
  });
});

hoverMappings.forEach(({ selectors, text, color, cursorColor }) => {
  selectors.forEach((selector) => {
    addHoverText(selector, text.trim(), color, true, false, cursorColor);
  });
});

window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.classList.add("hidden");
    setTimeout(() => loader.remove(), 1000); // optional: komplett aus DOM entfernen
  }
});

const cursorNormal = document.getElementById("custom-cursor");
const cursorPointer = document.getElementById("custom-cursor-pointer");

document.addEventListener("mousemove", (e) => {
  const x = e.clientX;
  const y = e.clientY;

  cursorNormal.style.top = `${y}px`;
  cursorNormal.style.left = `${x}px`;

  cursorPointer.style.top = `${y}px`;
  cursorPointer.style.left = `${x}px`;
});

function setCursorColor(color = "black") {
  const cursorNormal = document.getElementById("custom-cursor");
  const cursorPointer = document.getElementById("custom-cursor-pointer");
  if (cursorNormal) cursorNormal.style.color = color;
  if (cursorPointer) cursorPointer.style.color = color;
}

// Zeigt pointer-Cursor auf Buttons o.Ä.
document
  .querySelectorAll(
    "a, button, .navButton, .tag, .clickable, .wordmarke, .lbInfoButton"
  )
  .forEach((el) => {
    el.addEventListener("mouseenter", () => {
      cursorPointer.style.display = "block";
      cursorNormal.style.display = "none";
    });
    el.addEventListener("mouseleave", () => {
      cursorPointer.style.display = "none";
      cursorNormal.style.display = "block";
    });
  });

const beschreibungTagsLightboxBtn = document.getElementById(
  "beschreibungTagsLightbox"
);

beschreibungTagsLightbox.addEventListener("click", () => {
  // Aktuelles Bild-Metaobjekt erneut ermitteln
  const imgEl = lightbox.querySelector(".lightbox-img");
  if (!imgEl || !imgEl.src) return;

  const url = new URL(imgEl.src, window.location.href);
  const filename = url.pathname.split("/").pop() || "";
  const meta = fullData.find(
    (item) => encodeURIComponent(item.Name) === filename
  );
  if (!meta) return;

  const { Ort, Thema } = meta;
  selectedTags.clear(); // Vorherige Auswahl löschen
  selectedTagsEl.innerHTML = ""; // UI leeren

  [Ort, Thema].forEach((term) => {
    if (!term) return;
    selectedTags.add(term);

    // Tag aus scrollContainerEl finden
    const originalTag = scrollContainerEl.querySelector(
      `.tag[data-term="${CSS.escape(term)}"]`
    );

    if (originalTag) {
      originalTag.classList.add("selected");
      selectedTagsEl.appendChild(originalTag);
    } else {
      // Fallback, falls nicht vorhanden
      const fallbackTag = document.createElement("div");
      fallbackTag.classList.add("tag", "selected");
      fallbackTag.dataset.term = term;
      fallbackTag.innerHTML = `
        <span class="tag-count">${tagFrequencies[term] || 0}</span>
        ${term}
      `;
      fallbackTag.addEventListener("click", () => {
        fallbackTag.remove();
        selectedTags.delete(term);
        applyFilter();
      });
      selectedTagsEl.appendChild(fallbackTag);
    }
  });

  applyFilter(); // Filter anwenden
  closeLightbox(); // Lightbox schließen
});
