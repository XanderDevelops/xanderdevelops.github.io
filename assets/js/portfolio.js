const artRoot = "assets/img/portfolio/";
const stills = [
  { file: "capers-key-art.webp", caption: "Mickey and Oswald, from the game’s key art.", alt: "Mickey and Oswald stand at opposite ends of a dimly lit industrial room." },
  { file: "capers-farm.webp", caption: "A water tower above the fields.", alt: "An in-game view of a fenced field with a water tower and bare trees." },
  { file: "capers-cranes.webp", caption: "Platforms high above the construction site.", alt: "A crane suspends a platform over scaffolding in a monochrome city." },
  { file: "capers-road.webp", caption: "A chase on the mountain road.", alt: "A character rides a horse along a road beneath the mountains." }
];

const gallery = document.querySelector(".stills");
const stillImage = document.querySelector("#still-image");
const stillCaption = document.querySelector("#still-caption");
const stillCount = document.querySelector("#still-count");
let currentStill = 0;
function showStill(offset) {
  currentStill = (currentStill + offset + stills.length) % stills.length;
  const still = stills[currentStill];
  stillImage.src = artRoot + still.file;
  stillImage.alt = still.alt;
  stillCaption.textContent = still.caption;
  stillCount.textContent = (currentStill + 1) + " / " + stills.length;
}
stillImage.addEventListener("load", () => stillImage.classList.add("changing"));
stillImage.addEventListener("animationend", () => stillImage.classList.remove("changing"));
document.querySelector("#prev-still").addEventListener("click", () => showStill(-1));
document.querySelector("#next-still").addEventListener("click", () => showStill(1));
gallery.querySelector(".film-controls").hidden = false;

const clock = document.querySelector("#local-time");
const localClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Santo_Domingo", hour: "numeric", minute: "2-digit"
});
function updateClock() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = localClock.format(now);
}
updateClock();
setInterval(updateClock, 30000);

const filters = document.querySelector(".filters");
const projects = document.querySelectorAll("[data-category]");
const featureGrid = document.querySelector(".project-features");
const catalog = document.querySelector(".catalog");
const filterResult = document.querySelector("#filter-result");
filters.hidden = false;
catalog.open = false;
filters.addEventListener("click", event => {
  const selected = event.target.closest("button[data-filter]");
  if (!selected) return;
  const category = selected.dataset.filter;
  for (const button of filters.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button === selected));
  }
  let count = 0;
  for (const project of projects) {
    project.hidden = category !== "all" && project.dataset.category !== category;
    if (!project.hidden) count++;
  }
  featureGrid.hidden = !featureGrid.querySelector("article:not([hidden])");
  catalog.open = category !== "all";
  filterResult.textContent = count + " entries, " + selected.textContent.toLowerCase() + ".";
});

const piano = document.querySelector(".piano");
const AudioEngine = window.AudioContext || window.webkitAudioContext;
if (AudioEngine) {
  piano.parentElement.hidden = false;
  document.querySelector("#piano-invite").hidden = false;
}
let engine;
async function playKey(key) {
  if (!AudioEngine) return;
  if (!engine) engine = new AudioEngine();
  if (engine.state === "suspended") await engine.resume();
  const start = engine.currentTime;
  const tone = engine.createOscillator();
  const volume = engine.createGain();
  tone.type = "triangle";
  tone.frequency.value = 440 * 2 ** ((Number(key.dataset.midi) - 69) / 12);
  volume.gain.setValueAtTime(.0001, start);
  volume.gain.exponentialRampToValueAtTime(.18, start + .012);
  volume.gain.exponentialRampToValueAtTime(.0001, start + .85);
  tone.connect(volume);
  volume.connect(engine.destination);
  tone.onended = () => { tone.disconnect(); volume.disconnect(); };
  tone.start(start);
  tone.stop(start + .86);
}
piano.addEventListener("click", event => {
  const key = event.target.closest("button");
  if (!key) return;
  key.classList.add("played");
  setTimeout(() => key.classList.remove("played"), 220);
  playKey(key).catch(() => { /* The browser may block audio on muted webviews. */ });
});
