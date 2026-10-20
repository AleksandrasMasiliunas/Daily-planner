// Hourly Planner
// Plan your day hour by hour. Everything is saved in the browser
// with localStorage, so there is no backend.

const STORAGE_PREFIX = "hourly-planner-";

// ---------- state ----------
let settings = { firstHour: 6, lastHour: 22, focusMinutes: 25 };
let viewDate = startOfDay(new Date());   // the day currently on screen
let day = { tasks: [] };                 // the tasks for that day
let timer = null;                        // the running focus/break timer
let audioContext = null;                 // used for the beep sound


// ---------- small helpers ----------
function $(id) {
  return document.getElementById(id);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function dateKey(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function hourLabel(hour) {
  return pad(hour) + ":00";
}

function timeLabel(task) {
  return pad(task.hour) + ":" + pad(task.min || 0);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function clamp(n, low, high) {
  return Math.min(Math.max(n, low), high);
}

// turns "06:30" into { hour: 6, min: 30 }, or null if it isn't a valid time
function parseTime(text) {
  const match = /^(\d{1,2}):(\d{2})/.exec(text || "");
  if (!match) return null;
  const hour = Number(match[1]);
  const min = Number(match[2]);
  if (hour > 23 || min > 59) return null;
  return { hour: hour, min: min };
}

// shortcut for making an element with a class and some text
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// how many days the shown day is from today (0 = today, 1 = tomorrow, -1 = yesterday)
function dayDifference() {
  return Math.round((startOfDay(viewDate) - startOfDay(new Date())) / 86400000);
}


// ---------- saving and loading ----------
// localStorage can fail (private browsing for example), so these are wrapped in try/catch
function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // nothing to do, the planner still works until the page is closed
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function getJSON(key) {
  const text = getItem(key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function loadDay(date) {
  const data = getJSON(STORAGE_PREFIX + dateKey(date));
  if (data && Array.isArray(data.tasks)) return data;
  return null;
}

function saveDay(date, data) {
  setItem(STORAGE_PREFIX + dateKey(date), JSON.stringify(data));
}

// save the day that is on screen
function save() {
  saveDay(viewDate, day);
}

function saveSettings() {
  setItem(STORAGE_PREFIX + "settings", JSON.stringify(settings));
}

function anySavedDays() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^hourly-planner-\d{4}-\d{2}-\d{2}$/.test(localStorage.key(i))) return true;
    }
  } catch (e) {}
  return false;
}

function emptyDay() {
  return { seeded: false, tasks: [] };
}

// a few example tasks for the very first visit
function seedDay() {
  return {
    seeded: true,
    tasks: [
      { id: newId(), hour: 8, min: 0, text: "Breakfast and review the day", done: false, star: false },
      { id: newId(), hour: 9, min: 0, text: "Deep work: most important task", done: false, star: true },
      { id: newId(), hour: 13, min: 0, text: "Lunch away from the screen", done: false, star: false },
      { id: newId(), hour: 15, min: 0, text: "Reply to emails", done: false, star: false },
      { id: newId(), hour: 18, min: 0, text: "Go for a walk", done: false, star: false }
    ]
  };
}

// the rows shown go from the start of the day to the last hour,
// but they stretch if a task is outside that range
function getRange() {
  let first = settings.firstHour;
  let last = settings.lastHour;
  for (const task of day.tasks) {
    if (task.hour < first) first = task.hour;
    if (task.hour > last) last = task.hour;
  }
  return { first: first, last: last };
}


// ---------- focus timer ----------
function saveTimer() {
  if (timer) {
    setItem(STORAGE_PREFIX + "timer", JSON.stringify(timer));
  } else {
    removeItem(STORAGE_PREFIX + "timer");
  }
}

function makeAudio() {
  try {
    if (!audioContext) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioContext = new AudioClass();
    }
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
  } catch (e) {}
}

function beep(times) {
  try {
    makeAudio();
    if (!audioContext) return;
    for (let i = 0; i < times; i++) {
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      oscillator.frequency.value = 880;
      volume.gain.value = 0.08;
      oscillator.connect(volume);
      volume.connect(audioContext.destination);
      const start = audioContext.currentTime + i * 0.3;
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    }
  } catch (e) {}
}

function focusStatsKey() {
  return STORAGE_PREFIX + "focus-" + dateKey(new Date());
}

function loadFocusStats() {
  const stats = getJSON(focusStatsKey());
  if (stats && typeof stats.minutes === "number") return stats;
  return { sessions: 0, minutes: 0 };
}

function startFocus(task) {
  const ms = settings.focusMinutes * 60 * 1000;
  timer = {
    mode: "focus",
    total: ms,
    endsAt: Date.now() + ms,
    left: ms,
    paused: false,
    text: task.text,
    taskId: task.id,
    dayKey: dateKey(viewDate)
  };
  makeAudio();
  saveTimer();
  render();
}

function startBreak() {
  const ms = 5 * 60 * 1000;
  timer = {
    mode: "break",
    total: ms,
    endsAt: Date.now() + ms,
    left: ms,
    paused: false,
    text: "Stand up, stretch, drink some water.",
    taskId: null,
    dayKey: null
  };
}

// called when the countdown reaches zero
function finishTimer() {
  if (timer.mode === "focus") {
    const stats = loadFocusStats();
    stats.sessions = stats.sessions + 1;
    stats.minutes = stats.minutes + Math.round(timer.total / 60000);
    setItem(focusStatsKey(), JSON.stringify(stats));
    beep(2);
    startBreak();
  } else {
    beep(1);
    timer = null;
  }
  saveTimer();
  render();
}

function showTimer() {
  const box = $("timer");
  if (!timer) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  let msLeft = timer.left;
  if (!timer.paused) msLeft = Math.max(0, timer.endsAt - Date.now());
  const seconds = Math.ceil(msLeft / 1000);
  $("timerClock").textContent = pad(Math.floor(seconds / 60)) + ":" + pad(seconds % 60);

  const mode = $("timerMode");
  if (timer.mode === "focus") {
    mode.textContent = "Focus";
    mode.className = "pill";
  } else {
    mode.textContent = "Break";
    mode.className = "pill break";
  }
  $("timerText").textContent = timer.text || "";
  $("timerPause").textContent = timer.paused ? "Resume" : "Pause";
  $("timerStop").textContent = timer.mode === "break" ? "Skip" : "Stop";
}

$("timerPause").addEventListener("click", function () {
  if (!timer) return;
  makeAudio();
  if (timer.paused) {
    timer.endsAt = Date.now() + timer.left;
    timer.paused = false;
  } else {
    timer.left = Math.max(0, timer.endsAt - Date.now());
    timer.paused = true;
  }
  saveTimer();
  showTimer();
});

$("timerStop").addEventListener("click", function () {
  timer = null;
  saveTimer();
  render();
});

// check the timer four times a second
setInterval(function () {
  if (!timer || timer.paused) return;
  if (Date.now() >= timer.endsAt) {
    finishTimer();
  } else {
    showTimer();
  }
}, 250);


// ---------- tasks ----------
function makeCheckbox(task) {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!task.done;
  box.setAttribute("aria-label", "Mark done: " + task.text);
  box.addEventListener("change", function () {
    task.done = box.checked;
    save();
    render();
  });
  return box;
}

function makeButton(className, text, label, onClick) {
  const button = makeEl("button", "act " + className, text);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function removeTask(task) {
  day.tasks = day.tasks.filter(function (t) {
    return t.id !== task.id;
  });
  save();
  render();
}

function toggleStar(task) {
  const hint = $("priHint");
  const starCount = day.tasks.filter(function (t) {
    return t.star;
  }).length;

  // only three priorities are allowed
  if (!task.star && starCount >= 3) {
    hint.textContent = "Three is the limit. Unstar one first.";
    hint.className = "hint warn";
    return;
  }
  task.star = !task.star;
  save();
  render();
}

// swaps the task text for a little edit form (text + time)
function editTask(task, textButton) {
  const form = makeEl("span", "editbox");

  const textInput = makeEl("input", "edit");
  textInput.type = "text";
  textInput.value = task.text;
  textInput.setAttribute("aria-label", "Edit task");

  const timeInput = makeEl("input", "time-input");
  timeInput.type = "time";
  timeInput.step = 300;
  timeInput.value = timeLabel(task);
  timeInput.setAttribute("aria-label", "Start time");

  const saveButton = makeEl("button", "act txt", "Save");
  saveButton.type = "button";
  const cancelButton = makeEl("button", "act txt", "Cancel");
  cancelButton.type = "button";

  form.appendChild(textInput);
  form.appendChild(timeInput);
  form.appendChild(saveButton);
  form.appendChild(cancelButton);
  textButton.replaceWith(form);
  textInput.focus();
  textInput.select();

  function saveEdit() {
    const newText = textInput.value.trim();
    const newTime = parseTime(timeInput.value);
    if (newText) task.text = newText;
    if (newTime) {
      task.hour = newTime.hour;
      task.min = newTime.min;
    }
    save();
    render();
  }

  saveButton.addEventListener("click", saveEdit);
  cancelButton.addEventListener("click", function () {
    render();
  });
  textInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      render();
    }
  });
}

function buildTask(task, info) {
  const item = makeEl("li", "task" + (task.done ? " done" : ""));
  item.appendChild(makeCheckbox(task));

  // only show the time when it isn't on the hour (the row already shows the hour)
  if (task.min) {
    item.appendChild(makeEl("span", "task-time", timeLabel(task)));
  }

  const textButton = makeEl("button", "text", task.text);
  textButton.type = "button";
  textButton.title = "Click to edit";
  textButton.addEventListener("click", function () {
    editTask(task, textButton);
  });
  item.appendChild(textButton);

  // a task is late once its hour has finished
  const isLate = !task.done && (info.diff < 0 || (info.diff === 0 && task.hour < info.nowHour));
  const isFocusing = timer && timer.mode === "focus" && timer.taskId === task.id &&
    timer.dayKey === dateKey(viewDate);
  if (isLate) item.appendChild(makeEl("span", "pill late", "Late"));
  if (isFocusing) item.appendChild(makeEl("span", "pill", "Focusing"));

  const buttons = makeEl("span", "acts");

  const starButton = makeButton("star", task.star ? "★" : "☆",
    task.star ? "Remove from top priorities" : "Add to top priorities",
    function () {
      toggleStar(task);
    });
  starButton.setAttribute("aria-pressed", task.star ? "true" : "false");
  buttons.appendChild(starButton);

  if (!task.done) {
    buttons.appendChild(makeButton("txt", "Focus",
      "Start a " + settings.focusMinutes + " minute focus timer",
      function () {
        startFocus(task);
      }));

    if (isLate && info.diff === 0 && info.nowHour <= info.lastHour) {
      buttons.appendChild(makeButton("txt", "To now", "Move to the current hour", function () {
        task.hour = info.nowHour;
        task.min = 0;
        save();
        render();
      }));
    } else if (!isLate && task.hour < info.lastHour) {
      buttons.appendChild(makeButton("txt", "+1h", "Push to the next hour", function () {
        task.hour = task.hour + 1;
        save();
        render();
      }));
    }
  }

  buttons.appendChild(makeButton("remove", "×", "Remove task", function () {
    removeTask(task);
  }));
  item.appendChild(buttons);
  return item;
}

function buildHourRow(hour, info) {
  const isNow = info.diff === 0 && hour === info.nowHour;
  const isPast = info.diff === 0 && hour < info.nowHour;

  const row = makeEl("li", "hour" + (isNow ? " now" : "") + (isPast ? " past" : ""));
  row.id = "hour-" + hour;

  const label = makeEl("div", "label", hourLabel(hour));
  if (isNow) label.appendChild(makeEl("span", "pill", "Now"));
  row.appendChild(label);

  const slot = makeEl("div", "slot");

  // tasks for this hour, earliest first
  const list = makeEl("ul", "tasks");
  const tasksThisHour = day.tasks
    .filter(function (t) {
      return t.hour === hour;
    })
    .sort(function (a, b) {
      return (a.min || 0) - (b.min || 0);
    });
  for (const task of tasksThisHour) {
    list.appendChild(buildTask(task, info));
  }
  slot.appendChild(list);

  // the "add a task" form
  const form = makeEl("form", "add");

  const textInput = makeEl("input", "new-task");
  textInput.type = "text";
  textInput.id = "add-" + hour;
  textInput.placeholder = "Add a task at " + hourLabel(hour);
  textInput.autocomplete = "off";
  textInput.setAttribute("aria-label", "Add a task at " + hourLabel(hour));

  const timeInput = makeEl("input", "time-input");
  timeInput.type = "time";
  timeInput.step = 300;
  timeInput.value = hourLabel(hour);
  timeInput.setAttribute("aria-label", "Start time");

  form.appendChild(textInput);
  form.appendChild(timeInput);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    let text = textInput.value.trim();
    if (!text) return;

    let taskHour = hour;
    let taskMin = 0;
    const picked = parseTime(timeInput.value);
    if (picked) {
      taskHour = picked.hour;
      taskMin = picked.min;
    }

    // typing the time at the start also works, for example "6:30 gym"
    const typedTime = text.match(/^(\d{1,2})[:.](\d{2})\s+(.+)$/);
    if (typedTime && Number(typedTime[1]) < 24 && Number(typedTime[2]) < 60) {
      taskHour = Number(typedTime[1]);
      taskMin = Number(typedTime[2]);
      text = typedTime[3].trim();
    }

    textInput.value = "";
    day.tasks.push({ id: newId(), hour: taskHour, min: taskMin, text: text, done: false, star: false });
    save();
    render(hour);
  });

  slot.appendChild(form);
  row.appendChild(slot);
  return row;
}


// ---------- drawing the page ----------
function showHeader(diff) {
  const names = { "-1": "Yesterday", "0": "Today", "1": "Tomorrow" };
  const weekday = viewDate.toLocaleDateString("en-GB", { weekday: "long" });
  $("title").textContent = (names[String(diff)] || weekday) + ", by the hour";
  $("dateLine").textContent = viewDate.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long"
  });
  $("goToday").disabled = diff === 0;

  const total = day.tasks.length;
  const done = day.tasks.filter(function (t) {
    return t.done;
  }).length;
  $("count").textContent = done + " of " + total + " done";
  $("barFill").style.width = total ? (done / total * 100) + "%" : "0";
}

// offers to move unfinished tasks from the day before onto this day
function showCarryBanner(diff) {
  const banner = $("carry");
  banner.hidden = true;
  banner.innerHTML = "";
  if (diff < 0 || day.carryDismissed) return;

  const previousDate = addDays(viewDate, -1);
  const previousDay = loadDay(previousDate);
  if (!previousDay) return;

  const unfinished = previousDay.tasks.filter(function (t) {
    return !t.done;
  });
  if (unfinished.length === 0) return;

  let whichDay;
  if (diff === 0) {
    whichDay = "yesterday";
  } else if (diff === 1) {
    whichDay = "today";
  } else {
    whichDay = previousDate.toLocaleDateString("en-GB", { weekday: "long" });
  }
  const noun = unfinished.length === 1 ? " unfinished task from " : " unfinished tasks from ";
  const message = makeEl("span", "", unfinished.length + noun + whichDay + ".");

  const buttons = makeEl("span", "btns");

  const moveButton = makeEl("button", "", "Move here");
  moveButton.type = "button";
  moveButton.addEventListener("click", function () {
    const range = getRange();
    let hour = settings.firstHour;
    if (diff === 0) hour = clamp(new Date().getHours(), range.first, range.last);

    for (const task of unfinished) {
      day.tasks.push({ id: newId(), hour: hour, min: 0, text: task.text, done: false, star: !!task.star });
    }
    // take them off the old day so they aren't counted twice
    previousDay.tasks = previousDay.tasks.filter(function (t) {
      return t.done;
    });
    saveDay(previousDate, previousDay);
    save();
    render();
  });

  const dismissButton = makeEl("button", "", "Dismiss");
  dismissButton.type = "button";
  dismissButton.addEventListener("click", function () {
    day.carryDismissed = true;
    save();
    render();
  });

  buttons.appendChild(moveButton);
  buttons.appendChild(dismissButton);
  banner.appendChild(message);
  banner.appendChild(buttons);
  banner.hidden = false;
}

function showPriorities() {
  const list = $("pri");
  list.innerHTML = "";

  const starred = day.tasks
    .filter(function (t) {
      return t.star;
    })
    .sort(function (a, b) {
      return (a.hour * 60 + (a.min || 0)) - (b.hour * 60 + (b.min || 0));
    });

  $("priCount").textContent = starred.length + " of 3";

  for (const task of starred) {
    const item = makeEl("li", task.done ? "done" : "");
    item.appendChild(makeCheckbox(task));
    item.appendChild(makeEl("span", "text", task.text));
    item.appendChild(makeEl("span", "when", timeLabel(task)));
    list.appendChild(item);
  }

  const hint = $("priHint");
  hint.className = "hint";
  if (starred.length === 0) {
    hint.textContent = "Star up to three tasks to pin them here. Do these first. " +
      "Press Focus on any task to start a " + settings.focusMinutes + " minute timer.";
  } else {
    hint.textContent = "";
  }
}

// bar chart of the last 7 days plus a few numbers
function showWeek() {
  const week = $("week");
  week.innerHTML = "";
  let doneThisWeek = 0;
  const today = startOfDay(new Date());

  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const saved = loadDay(date);
    const total = saved ? saved.tasks.length : 0;
    const done = saved ? saved.tasks.filter(function (t) {
      return t.done;
    }).length : 0;
    doneThisWeek = doneThisWeek + done;
    const percent = total ? Math.round(done / total * 100) : 0;

    const column = makeEl("div", "col" + (i === 0 ? " today" : ""));
    column.title = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) +
      ": " + done + " of " + total + " done";

    const track = makeEl("div", "track");
    const fill = makeEl("div", "fill");
    fill.style.height = percent + "%";
    track.appendChild(fill);

    const dayName = date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3);
    column.appendChild(track);
    column.appendChild(makeEl("div", "day-name", dayName));
    column.appendChild(makeEl("div", "day-count", total ? done + "/" + total : "-"));
    week.appendChild(column);
  }

  // streak = days in a row with at least one task done
  // (if nothing is done yet today, the streak is counted back from yesterday)
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const saved = loadDay(addDays(today, -i));
    const done = saved ? saved.tasks.filter(function (t) {
      return t.done;
    }).length : 0;
    if (done > 0) {
      streak = streak + 1;
    } else if (i > 0) {
      break;
    }
  }

  const focus = loadFocusStats();
  const numbers = [
    ["Day streak", String(streak), streak === 1 ? "day with a task done" : "days with a task done"],
    ["Done this week", String(doneThisWeek), doneThisWeek === 1 ? "task" : "tasks"],
    ["Focus today", focus.minutes + " min", focus.sessions + (focus.sessions === 1 ? " session" : " sessions")]
  ];

  const stats = $("stats");
  stats.innerHTML = "";
  for (const entry of numbers) {
    const stat = makeEl("div", "stat");
    stat.appendChild(makeEl("div", "stat-label", entry[0]));
    stat.appendChild(makeEl("div", "stat-value", entry[1]));
    stat.appendChild(makeEl("div", "stat-note", entry[2]));
    stats.appendChild(stat);
  }
}

// redraws everything. focusHour = which "add a task" box to put the cursor in afterwards
function render(focusHour) {
  // remember anything typed into the add boxes, because the rows get rebuilt
  const typed = {};
  document.querySelectorAll(".new-task").forEach(function (box) {
    if (box.value) typed[box.id] = box.value;
  });
  const active = document.activeElement;
  let activeId = null;
  if (active && active.classList && active.classList.contains("new-task")) activeId = active.id;

  const diff = dayDifference();
  const range = getRange();
  const info = { nowHour: new Date().getHours(), diff: diff, lastHour: range.last };

  showHeader(diff);
  showCarryBanner(diff);
  $("note").hidden = !day.seeded;
  showPriorities();

  const hours = $("hours");
  hours.innerHTML = "";
  for (let hour = range.first; hour <= range.last; hour++) {
    hours.appendChild(buildHourRow(hour, info));
  }

  for (const id in typed) {
    const box = $(id);
    if (box) box.value = typed[id];
  }
  const focusId = focusHour != null ? "add-" + focusHour : activeId;
  if (focusId && $(focusId)) $(focusId).focus();

  showWeek();
  showTimer();
}


// ---------- buttons and settings ----------
function scrollToNow() {
  if (dayDifference() !== 0) {
    window.scrollTo(0, 0);
    return;
  }
  const range = getRange();
  const nowHour = new Date().getHours();
  if (nowHour <= range.first) {
    window.scrollTo(0, 0);
    return;
  }
  const row = $("hour-" + clamp(nowHour, range.first, range.last));
  if (row) row.scrollIntoView({ block: "start" });
}

// show a different day
function goToDay(date) {
  viewDate = startOfDay(date);
  day = loadDay(viewDate) || emptyDay();
  render();
  scrollToNow();
}

$("prevDay").addEventListener("click", function () {
  goToDay(addDays(viewDate, -1));
});
$("nextDay").addEventListener("click", function () {
  goToDay(addDays(viewDate, 1));
});
$("goToday").addEventListener("click", function () {
  goToDay(new Date());
});

$("clearDone").addEventListener("click", function () {
  day.tasks = day.tasks.filter(function (t) {
    return !t.done;
  });
  save();
  render();
});

$("dismissNote").addEventListener("click", function () {
  day.seeded = false;
  save();
  render();
});

// fills a <select> with options and picks the current one
function fillSelect(id, values, makeText, current) {
  const select = $(id);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = makeText(value);
    if (value === current) option.selected = true;
    select.appendChild(option);
  }
  return select;
}

function numbersBetween(low, high) {
  const list = [];
  for (let i = low; i <= high; i++) list.push(i);
  return list;
}

fillSelect("setFirst", numbersBetween(4, 12), hourLabel, settings.firstHour)
  .addEventListener("change", function (e) {
    settings.firstHour = parseInt(e.target.value, 10);
    saveSettings();
    render();
  });

fillSelect("setLast", numbersBetween(16, 23), hourLabel, settings.lastHour)
  .addEventListener("change", function (e) {
    settings.lastHour = parseInt(e.target.value, 10);
    saveSettings();
    render();
  });

fillSelect("setFocus", [15, 25, 45, 60], function (m) {
  return m + " minutes";
}, settings.focusMinutes).addEventListener("change", function (e) {
  settings.focusMinutes = parseInt(e.target.value, 10);
  saveSettings();
  render();
});


// ---------- start up ----------
// load saved settings
const savedSettings = getJSON(STORAGE_PREFIX + "settings");
if (savedSettings) {
  if (typeof savedSettings.firstHour === "number") settings.firstHour = savedSettings.firstHour;
  if (typeof savedSettings.lastHour === "number") settings.lastHour = savedSettings.lastHour;
  if (typeof savedSettings.focusMinutes === "number") settings.focusMinutes = savedSettings.focusMinutes;
}

// load today. The first ever visit gets some example tasks.
day = loadDay(viewDate);
if (!day) {
  if (anySavedDays()) {
    day = emptyDay();
  } else {
    day = seedDay();
    save();
  }
}

// bring back a timer that was running before the page was refreshed
timer = getJSON(STORAGE_PREFIX + "timer");
if (timer && (typeof timer.endsAt !== "number" || (!timer.paused && timer.endsAt <= Date.now()))) {
  timer = null;
  saveTimer();
}

render();
scrollToNow();

// move the "Now" marker when a new hour starts
let lastHourSeen = new Date().getHours();
setInterval(function () {
  const hourNow = new Date().getHours();
  if (hourNow !== lastHourSeen) {
    lastHourSeen = hourNow;
    render();
  }
}, 30000);
