const STORAGE_KEY = "seeking-light-journal-v5";

const feelings = {
  energized: { label: "充满活力", short: "活力", energy: 2, color: "#2f6654", bg: "#dce9e1" },
  satisfied: { label: "满足愉快", short: "满足", energy: 2, color: "#8a6719", bg: "#f7edc9" },
  calm: { label: "平静舒展", short: "平静", energy: 1, color: "#54708c", bg: "#e1e9ef" },
  neutral: { label: "没什么变化", short: "平稳", energy: 0, color: "#68716d", bg: "#eceeea" },
  tense: { label: "紧绷烦躁", short: "紧绷", energy: -1, color: "#b16a3d", bg: "#f5e4d7" },
  drained: { label: "疲惫耗尽", short: "耗尽", energy: -2, color: "#a84f4f", bg: "#f3ded7" },
};

const areaLabels = { work: "个人工作", life: "生活" };
const workSignals = ["工作", "项目", "需求", "同事", "客户", "会议", "学习", "写作", "设计", "研究", "汇报", "邮件", "消息", "代码", "创作"];
const stopWords = new Set(["今天", "一个", "一些", "然后", "这个", "那个", "自己", "一起", "进行", "完成", "开始", "感觉", "事情", "工作", "生活", "时候", "比较", "还是", "没有", "用了"]);
const themeWords = ["写作", "设计", "研究", "阅读", "学习", "表达", "创作", "沟通", "协作", "整理", "规划", "解决", "分析", "复盘", "运动", "散步", "陪伴", "做饭", "教学", "分享", "编程", "项目", "探索", "反馈", "倾听", "思考", "制作", "采访", "连接"];

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function offsetDate(days, from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + days);
  return date;
}

function defaultState() {
  return {
    version: 3,
    days: {},
    reminder: {
      enabled: false,
      time: "21:30",
      message: "今天发生了什么，想留下哪一件？",
      lastSent: "",
    },
    acceptedExperiment: null,
    freewriteDraft: "",
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.version === 3 && stored.days && stored.reminder) return stored;
  } catch {
    // A damaged local draft should not keep the journal from opening.
  }
  return defaultState();
}

let state = loadState();
let activeView = "today";
let activePeriod = "7";
let editing = { area: "life", id: null, date: localDateKey() };
let calendarCursor = new Date();
let selectedHistoryDate = localDateKey();
let toastTimer = 0;
let freewriteTimer = 0;
let copilotController = null;
let copilotPreviewEntries = [];
let copilotPreviewModel = "";
let copilotFinding = null;
let streamDate = "";
let streamLimit = 20;
let newestEntryId = "";
let footprintPeriod = "year";
let footprintYear = new Date().getFullYear();
let footprintMonth = new Date().getMonth();
let renderedDate = localDateKey();
let saveStatusTimer = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function saveState(message = "已自动保存") {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch {
    $("#saveStatus").textContent = "暂时无法保存，请不要关闭页面";
    showToast("设备存储暂时不可用，内容尚未保存");
    return false;
  }
  const status = $("#saveStatus");
  if (status) {
    status.textContent = message;
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = window.setTimeout(updateDraftStatus, 2000);
  }
  return true;
}

function updateDraftStatus() {
  const date = state.freewriteDraftDate;
  $("#saveStatus").textContent = state.freewriteDraft
    ? (date && date !== localDateKey() ? `${formatShortDate(date)}的草稿已保留` : "草稿已保留")
    : "保存在这台设备上";
}

function refreshIcons() { window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } }); }

function icon(name) {
  const node = createElement("i");
  node.dataset.lucide = name;
  node.setAttribute("aria-hidden", "true");
  return node;
}

function savedEntries() {
  return getAllEntries().filter((entry) => !entry.demo && entry.date <= localDateKey());
}

function countByDate(entries = savedEntries()) {
  const counts = new Map();
  entries.forEach((entry) => counts.set(entry.date, (counts.get(entry.date) || 0) + 1));
  return counts;
}

function heatLevel(count) { return count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4; }

function yearDates(year) {
  const first = new Date(year, 0, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Math.round((new Date(year + 1, 0, 1) - first) / 86400000);
  const weeks = Math.ceil((offset + days) / 7);
  return { weeks, dates: Array.from({ length: weeks * 7 }, (_, index) => offsetDate(index - offset, first)) };
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function getDay(key = localDateKey()) {
  return state.days[key] || { entries: [] };
}

function getAllEntries() {
  return Object.entries(state.days).flatMap(([date, day]) =>
    (day.entries || []).map((entry) => ({ ...entry, date }))
  );
}

function entriesForPeriod(period = activePeriod) {
  const entries = getAllEntries().filter((entry) => !entry.draft && feelings[entry.feeling] && entry.engagement >= 1 && entry.engagement <= 5 && entry.date <= localDateKey());
  if (period === "all") return entries.sort((a, b) => b.createdAt - a.createdAt);
  const cutoff = offsetDate(-(Number(period) - 1));
  cutoff.setHours(0, 0, 0, 0);
  return entries.filter((entry) => parseDateKey(entry.date) >= cutoff).sort((a, b) => b.createdAt - a.createdAt);
}

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function formatShortDate(key) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(parseDateKey(key));
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderEntry(entry) {
  const article = createElement("article", "journal-entry");
  if (entry.id === newestEntryId) article.classList.add("is-new");
  const date = entry.date || localDateKey();
  const time = createElement("time", "entry-time", date === localDateKey()
    ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt || 0))
    : formatShortDate(date));
  time.dateTime = date;
  time.title = date;
  const copy = createElement("div", "entry-copy");
  copy.appendChild(createElement("h3", "", entry.activity));
  if (entry.demo) copy.appendChild(createElement("p", "entry-meta", "体验示例"));
  const actions = createElement("details", "entry-actions");
  const summary = createElement("summary");
  summary.setAttribute("aria-label", "这条记录的操作");
  summary.title = "编辑或删除";
  summary.appendChild(icon("ellipsis"));
  const menu = createElement("div", "entry-menu");
  const edit = createElement("button");
  edit.type = "button";
  edit.dataset.editEntry = entry.id;
  edit.append(icon("pencil"), createElement("span", "", "编辑"));
  const remove = createElement("button");
  remove.type = "button";
  remove.dataset.deleteEntry = entry.id;
  remove.append(icon("trash-2"), createElement("span", "", "删除"));
  menu.append(edit, remove);
  actions.append(summary, menu);
  article.append(time, copy, actions);
  return article;
}

function renderToday() {
  $("#dateEyebrow").textContent = formatLongDate();
  $("#streamDate").max = localDateKey();
  $("#streamDate").value = streamDate;
  const entries = getAllEntries().filter((entry) => entry.date <= localDateKey() && (!streamDate || entry.date === streamDate))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const momentStream = $("#momentStream");
  momentStream.replaceChildren(...entries.slice(0, streamLimit).map(renderEntry));
  if (!entries.length) {
    momentStream.appendChild(createElement("p", "moment-empty", streamDate ? "这一天没有记录，也没关系。" : "先留下一件小事。"));
  }
  $("#momentStreamTitle").textContent = streamDate ? `${formatShortDate(streamDate)}记下的` : "最近记下的";
  $("#momentCount").textContent = entries.length ? `${entries.length} 条${entries.some((entry) => entry.demo) ? "（含示例）" : ""}` : "";
  $("#clearStreamDate").hidden = !streamDate;
  $("#loadMoreNotes").hidden = entries.length <= streamLimit;
  $("#captureMomentsButton").disabled = !$("#freewriteInput").value.trim();
  renderFootprint();
  renderHomeFinding();
  refreshIcons();
  resizeComposer();
}

function resizeComposer() {
  const input = $("#freewriteInput");
  input.style.height = "auto";
  if (document.body.classList.contains("composer-focus")) {
    input.style.overflowY = "auto";
    return;
  }
  const height = input.scrollHeight || 96;
  input.style.height = `${Math.max(96, Math.min(280, height))}px`;
  input.style.overflowY = height > 280 ? "auto" : "hidden";
}

function renderHomeFinding() {
  const current = new Map(savedEntries().map((entry) => [entry.id, JSON.stringify(copilotPayloadEntry(entry))]));
  const valid = copilotFinding && copilotFinding.entries.every((entry) => current.get(entry.id) === JSON.stringify(entry));
  $("#homeFinding").hidden = !valid;
  $("#findingDot").hidden = !valid;
  if (valid) $("#homeFindingTitle").textContent = copilotFinding.insights[0].title;
}

function renderFootprint() {
  const entries = savedEntries();
  const counts = countByDate(entries);
  const today = localDateKey();
  $("#footprintToday").textContent = String(counts.get(today) || 0);
  $("#footprintMonth").textContent = String(entries.filter((entry) => entry.date.startsWith(today.slice(0, 7))).length);
  $("#footprintYear").textContent = String(entries.filter((entry) => entry.date.startsWith(today.slice(0, 4))).length);
  const years = [...new Set([new Date().getFullYear(), footprintYear, ...entries.map((entry) => Number(entry.date.slice(0, 4)))])].sort((a, b) => b - a);
  const yearSelect = $("#footprintYearSelect");
  yearSelect.replaceChildren(...years.map((year) => { const option = createElement("option", "", `${year} 年`); option.value = String(year); return option; }));
  yearSelect.value = String(footprintYear);
  const monthSelect = $("#footprintMonthSelect");
  monthSelect.replaceChildren(...Array.from({ length: 12 }, (_, month) => { const option = createElement("option", "", `${month + 1} 月`); option.value = String(month); return option; }));
  monthSelect.value = String(footprintMonth);
  const yearView = footprintPeriod === "year";
  $("#annualFootprint").hidden = !yearView;
  $("#monthlyFootprint").hidden = yearView;
  $("#footprintMonthControl").hidden = yearView;
  $$("[data-footprint-period]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.footprintPeriod === footprintPeriod)));
  const prefix = `${footprintYear}${yearView ? "" : `-${String(footprintMonth + 1).padStart(2, "0")}`}`;
  const periodCount = entries.filter((entry) => entry.date.startsWith(prefix)).length;
  $("#footprintPeriodCount").hidden = yearView && footprintYear === new Date().getFullYear();
  $("#footprintPeriodCount").textContent = `${footprintYear} 年${yearView ? "" : ` ${footprintMonth + 1} 月`} · ${periodCount} 条记录`;
  const { weeks, dates } = yearDates(footprintYear);
  const grid = $("#footprintGrid");
  grid.style.setProperty("--weeks", weeks);
  grid.setAttribute("aria-label", `${footprintYear} 年每日记录热力图，共 ${entries.filter((entry) => entry.date.startsWith(String(footprintYear))).length} 条。颜色越深，记录越多。可通过下方日期选择器回看。`);
  grid.replaceChildren(...dates.map((date) => {
    const key = localDateKey(date);
    const cell = createElement("span", "footprint-cell");
    if (date.getFullYear() !== footprintYear) cell.classList.add("is-outside");
    else {
      const count = counts.get(key) || 0;
      if (key > today) cell.classList.add("is-future");
      cell.dataset.level = String(heatLevel(count));
      cell.dataset.footprintDate = key;
      cell.title = key > today ? `${formatShortDate(key)} · 尚未到来` : `${formatShortDate(key)} · ${count} 条`;
    }
    return cell;
  }));
  const labels = $("#footprintMonthLabels");
  labels.style.setProperty("--weeks", weeks);
  labels.replaceChildren(...Array.from({ length: 12 }, (_, month) => {
    const label = createElement("span", "", `${month + 1}月`);
    const index = dates.findIndex((date) => date.getFullYear() === footprintYear && date.getMonth() === month && date.getDate() === 1);
    label.style.gridColumn = `${Math.floor(index / 7) + 1} / span 3`;
    label.style.gridRow = "1";
    return label;
  }));
  const first = new Date(footprintYear, footprintMonth, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(footprintYear, footprintMonth + 1, 0).getDate();
  const cells = Array.from({ length: offset }, () => createElement("span"));
  for (let day = 1; day <= days; day += 1) {
    const key = localDateKey(new Date(footprintYear, footprintMonth, day));
    const count = counts.get(key) || 0;
    const button = createElement("button");
    button.type = "button";
    button.dataset.streamDate = key;
    button.dataset.level = String(heatLevel(count));
    button.disabled = key > today;
    button.setAttribute("aria-pressed", String(key === streamDate));
    button.setAttribute("aria-label", `${formatShortDate(key)}，${key > today ? "尚未到来" : `${count} 条记录`}`);
    button.append(createElement("span", "", String(day)), createElement("small", "", key > today ? "—" : `${count} 条`));
    cells.push(button);
  }
  $("#footprintMonthGrid").replaceChildren(...cells);
}

function renderCompass(container, entries, withCaptions = true) {
  container.replaceChildren();
  if (withCaptions) {
    [["投入高", "top"], ["投入低", "bottom"], ["消耗", "left"], ["能量", "right"]].forEach(([text, place]) => {
      container.appendChild(createElement("span", `compass-caption ${place}`, text));
    });
  }
  entries.forEach((entry) => {
    const dot = createElement("span", `compass-dot ${entry.area}`);
    const energy = feelings[entry.feeling]?.energy || 0;
    const x = 8 + ((energy + 2) / 4) * 84;
    const y = 8 + ((entry.engagement - 1) / 4) * 84;
    dot.style.left = `${x}%`;
    dot.style.bottom = `${y}%`;
    dot.title = `${entry.activity}：投入 ${entry.engagement}/5，${feelings[entry.feeling].label}`;
    container.appendChild(dot);
  });
}

function trimText(text, max) {
  const chars = Array.from(text || "");
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

function openEntryDialog(area, id = null) {
  const entry = id ? findEntry(id) : null;
  editing = { area, id, date: entry?.date || localDateKey() };
  $("#entryDialogTitle").textContent = entry ? "编辑记录" : "记下一件小事";
  $("#entryForm").reset();
  $("#entryDialog details").open = false;
  $("#activityInput").value = entry?.activity || "";
  const areaInput = $(`input[name="entry-area"][value="${entry?.area || area}"]`);
  if (areaInput) areaInput.checked = true;
  const engagement = entry?.draft && !entry.reflectionVersion ? null : entry?.engagement;
  const feeling = entry?.draft && !entry.reflectionVersion ? null : entry?.feeling;
  const engagementInput = $(`input[name="engagement"][value="${engagement}"]`);
  const feelingInput = $(`input[name="feeling"][value="${feeling}"]`);
  if (engagementInput) engagementInput.checked = true;
  if (feelingInput) feelingInput.checked = true;
  $$('input[name="context"]').forEach((input) => { input.checked = (entry?.contexts || []).includes(input.value); });
  $("#entryDialog").showModal();
  window.setTimeout(() => $("#activityInput").focus(), 50);
}

function submitEntry(event) {
  event.preventDefault();
  const activity = $("#activityInput").value.trim();
  if (!activity) {
    showToast("先写下你做了什么");
    $("#activityInput").focus();
    return;
  }
  const engagement = Number($("input[name='engagement']:checked")?.value) || null;
  const feeling = $("input[name='feeling']:checked")?.value || null;
  const contexts = $$('input[name="context"]:checked').map((input) => input.value);
  const selectedArea = $("input[name='entry-area']:checked")?.value || editing.area;
  const date = editing.date;
  const before = JSON.stringify(state);
  if (!state.days[date]) state.days[date] = { entries: [] };
  const entries = state.days[date].entries;
  const draft = !(engagement && feeling);
  if (editing.id) {
    const index = entries.findIndex((entry) => entry.id === editing.id);
    if (index < 0) return;
    entries[index] = { ...entries[index], activity, engagement, feeling, contexts, area: selectedArea, draft, reflectionVersion: 1, updatedAt: Date.now() };
  } else {
    entries.push({ id: `e-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, area: selectedArea, activity, engagement, feeling, contexts, draft, reflectionVersion: 1, createdAt: Date.now() });
  }
  if (!saveState(editing.id ? "修改已保存" : "记录已保存")) { state = JSON.parse(before); return; }
  $("#entryDialog").close();
  renderAll();
  showToast(editing.id ? "修改已保存" : "已记下");
}

function inferArea(text) {
  return workSignals.some((signal) => text.includes(signal)) ? "work" : "life";
}

function captureFreewrite() {
  const input = $("#freewriteInput");
  const activity = input.value.trim();
  if (!activity) {
    showToast("先随便写下一点今天发生的事");
    input.focus();
    return;
  }

  window.clearTimeout(freewriteTimer);
  const before = JSON.stringify(state);
  const date = state.freewriteDraftDate || localDateKey();
  if (!state.days[date]) state.days[date] = { entries: [] };
  const createdAt = Date.now();
  const id = `e-${createdAt}-${Math.random().toString(16).slice(2, 9)}`;
  state.days[date].entries.push({ id, area: inferArea(activity), activity,
    engagement: null, feeling: null, contexts: [], draft: true, createdAt });
  state.freewriteDraft = "";
  delete state.freewriteDraftDate;
  if (!saveState("已记下")) { state = JSON.parse(before); return; }
  input.value = "";
  newestEntryId = id;
  streamDate = "";
  streamLimit = 20;
  renderAll();
  window.setTimeout(() => {
    if (newestEntryId !== id) return;
    newestEntryId = "";
    $$(".journal-entry.is-new").forEach((entry) => entry.classList.remove("is-new"));
  }, 1600);
  input.focus();
}

function toggleComposerFocus(force) {
  const active = force ?? !document.body.classList.contains("composer-focus");
  document.body.classList.toggle("composer-focus", active);
  $("#focusComposerButton").setAttribute("aria-pressed", String(active));
  const button = $("#focusComposerButton");
  button.setAttribute("aria-label", active ? "退出专注" : "专注书写");
  button.title = active ? "退出专注" : "专注书写";
  button.replaceChildren(icon(active ? "minimize" : "expand"));
  refreshIcons();
  resizeComposer();
  if (active) window.setTimeout(() => $("#freewriteInput").focus(), 60);
}

function findEntry(id) {
  return getAllEntries().find((entry) => entry.id === id);
}

function deleteEntry(id) {
  const entry = findEntry(id);
  if (!entry || !window.confirm(`删除“${trimText(entry.activity, 22)}”这条记录？`)) return;
  const before = JSON.stringify(state);
  state.days[entry.date].entries = getDay(entry.date).entries.filter((item) => item.id !== id);
  if (!state.days[entry.date].entries.length) delete state.days[entry.date];
  if (!saveState("记录已删除")) { state = JSON.parse(before); return; }
  renderAll();
}

function getKeywords(entries) {
  const score = new Map();
  entries.forEach((entry) => {
    const weight = entry.engagement + Math.max(0, feelings[entry.feeling]?.energy || 0);
    (entry.contexts || []).forEach((context) => score.set(context, (score.get(context) || 0) + weight));
    themeWords.forEach((word) => {
      if (entry.activity.includes(word)) score.set(word, (score.get(word) || 0) + weight + 2);
    });
    if (typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
      for (const segment of segmenter.segment(entry.activity)) {
        const word = segment.segment.trim();
        if (segment.isWordLike && word.length >= 2 && word.length <= 6 && !stopWords.has(word) && !/^\d+$/.test(word)) {
          score.set(word, (score.get(word) || 0) + Math.max(1, weight - 2));
        }
      }
    }
  });
  return Array.from(score.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word]) => word);
}

function analyze(entries) {
  const bright = entries
    .filter((entry) => entry.engagement >= 4 && feelings[entry.feeling].energy > 0)
    .sort((a, b) => (b.engagement + feelings[b.feeling].energy) - (a.engagement + feelings[a.feeling].energy));
  const drains = entries
    .filter((entry) => feelings[entry.feeling].energy < 0)
    .sort((a, b) => feelings[a.feeling].energy - feelings[b.feeling].energy || b.engagement - a.engagement);
  const flow = entries.filter((entry) => entry.engagement === 5);
  const averageEngagement = entries.length ? entries.reduce((sum, entry) => sum + entry.engagement, 0) / entries.length : 0;
  const averageEnergy = entries.length ? entries.reduce((sum, entry) => sum + feelings[entry.feeling].energy, 0) / entries.length : 0;
  const keywords = getKeywords(bright.length ? bright : entries);
  const contexts = new Map();
  bright.forEach((entry) => (entry.contexts || []).forEach((tag) => contexts.set(tag, (contexts.get(tag) || 0) + 1)));
  const strongestContext = Array.from(contexts.entries()).sort((a, b) => b[1] - a[1])[0];
  const commonContext = strongestContext?.[1] >= 2 ? strongestContext[0] : "";
  const contradictingContextCount = commonContext
    ? drains.filter((entry) => (entry.contexts || []).includes(commonContext)).length
    : 0;
  return { entries, bright, drains, flow, averageEngagement, averageEnergy, keywords, commonContext, contradictingContextCount };
}

function renderFindings() {
  renderCopilotAvailability();
  const entries = entriesForPeriod();
  const empty = entries.length < 2;
  $("#findingEmpty").hidden = !empty;
  $("#findingsDashboard").hidden = empty;
  if (empty) return;

  const analysis = analyze(entries);
  const { bright, drains, flow, averageEngagement, keywords, commonContext, contradictingContextCount } = analysis;
  const strongest = bright[0] || entries.slice().sort((a, b) => b.engagement - a.engagement)[0];
  const periodLabel = activePeriod === "all" ? "全部记录" : `最近 ${activePeriod} 天`;

  if (bright.length >= 2) {
    $("#leadFindingTitle").textContent = `“高投入 + 能量上升”已经出现 ${bright.length} 次。`;
    $("#leadFindingCopy").textContent = `这些活动不是在证明你属于某个固定职业，而是在提示：当你${commonContext ? `处于“${commonContext}”的情境，且` : ""}能主动使用能力、看见推进时，你更容易进入有生命力的状态。`;
  } else if (drains.length >= 2) {
    $("#leadFindingTitle").textContent = "能量消耗正在重复，值得先调整活动的结构。";
    $("#leadFindingCopy").textContent = "重复的消耗并不自动等于“这件事不适合你”。先检查时间长度、环境、互动方式和反馈速度，再判断问题来自活动本身还是活动的设计。";
  } else {
    $("#leadFindingTitle").textContent = `目前最清晰的线索来自“${trimText(strongest.activity, 24)}”。`;
    $("#leadFindingCopy").textContent = "这是一个值得继续观察的点，还不足以成为结论。下一步不是做重大选择，而是在相似活动中寻找第二次、第三次证据。";
  }

  const evidence = $("#leadEvidence");
  evidence.replaceChildren(
    createElement("span", "", `${periodLabel} · ${entries.length} 条记录`),
    createElement("span", "", `平均投入 ${averageEngagement.toFixed(1)}/5`),
    createElement("span", "", `${flow.length} 次心流时刻`)
  );
  renderCompass($("#energyCompass"), entries, true);
  renderEvidenceList($("#brightList"), bright.slice(0, 3), "bright");
  renderEvidenceList($("#drainList"), drains.slice(0, 3), "drain");

  const keywordRow = $("#keywordRow");
  keywordRow.replaceChildren(...(keywords.length ? keywords : ["继续记录"]).map((word) => createElement("span", "", word)));
  if (commonContext) {
    $("#interestTitle").textContent = `“${commonContext}”正在成为跨活动重复出现的高能量条件。`;
    $("#interestCopy").textContent = contradictingContextCount
      ? `它同时出现在多条高投入记录中，也出现在 ${contradictingContextCount} 条消耗记录里。这条反证很重要：真正起作用的可能不是“${commonContext}”本身，而是你在其中做了什么、能否看见反馈。`
      : `它同时出现在多条高投入记录中。比起把某个主题直接翻译成职业名称，更值得验证：当这个条件存在时，不同活动是否都会更吸引你。`;
  } else if (keywords.length) {
    $("#interestTitle").textContent = "目前出现了几条不同方向的兴趣线索，还没有收敛成共同模式。";
    $("#interestCopy").textContent = `这些词来自各自的高能量时刻。先把它们保留为候选，不急着合并；未来哪一类活动再次出现，哪一条线索才会变得更可信。`;
  } else {
    $("#interestTitle").textContent = "再积累一些情境，兴趣的结构会更清楚。";
    $("#interestCopy").textContent = "下一次记录时，可以补充你和谁一起、在哪里、以什么方式完成，以及是否获得了及时反馈。";
  }

  const experiment = buildExperiment(analysis);
  $("#experimentName").textContent = experiment.name;
  $("#experimentCopy").textContent = experiment.copy;
  $("#acceptExperimentButton").dataset.experiment = JSON.stringify(experiment);
}

function copilotEntries() {
  const cutoff = activePeriod === "all" ? "" : localDateKey(offsetDate(-(Number(activePeriod) - 1)));
  return getAllEntries().filter((entry) => !entry.demo && entry.date >= cutoff && entry.date <= localDateKey())
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function copilotPayloadEntry(entry) {
  const unknown = entry.draft && !entry.reflectionVersion;
  return { id: entry.id, date: entry.date, area: entry.area, activity: entry.activity,
    engagement: unknown ? null : entry.engagement ?? null, feeling: unknown ? null : entry.feeling ?? null,
    contexts: entry.contexts || [] };
}

function renderCopilotAvailability() {
  const count = copilotEntries().length;
  const button = $("#generateCopilotButton");
  button.disabled = Boolean(copilotController) || !count;
  button.textContent = copilotController ? "正在寻找线索…" : "找找线索";
  $("#cancelCopilotButton").hidden = !copilotController;
  if (!copilotController && !copilotFinding) {
    $("#copilotMessage").textContent = count ? `这个范围内有 ${count} 条真实记录，可在发送前逐条选择。` : "这个范围内还没有真实记录，体验示例不会发送给 Copilot。";
  }
  if (copilotFinding && !copilotController) {
    const current = new Map(copilotEntries().map((entry) => [entry.id, JSON.stringify(copilotPayloadEntry(entry))]));
    const stale = copilotFinding.entries.some((entry) => current.get(entry.id) !== JSON.stringify(entry));
    $("#copilotMessage").textContent = stale ? "记录或查看范围已变化。下方保留的是上一次分析，请重新选择记录再分析。" :
      `上次分析：${copilotFinding.entries.length} 条记录 · ${copilotFinding.model} · ${new Date(copilotFinding.generatedAt).toLocaleString("zh-CN")}`;
  }
}

async function checkCopilot() {
  const button = $("#checkCopilotButton");
  button.disabled = true;
  $("#copilotStatus").textContent = "正在检查本机 CLI…";
  try {
    const response = await fetch("/api/copilot/status");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $("#copilotStatus").textContent = `${result.version} · ${result.model}。登录与额度将在分析时验证。`;
  } catch {
    $("#copilotStatus").textContent = "无法连接本地服务，请确认从本地服务地址打开，且本机 Copilot 已安装。";
  } finally { button.disabled = false; }
}

function previewCopilot() {
  const entries = copilotEntries();
  if (!entries.length || copilotController) return;
  copilotPreviewModel = $("#copilotModel").value.trim();
  if (copilotPreviewModel && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(copilotPreviewModel)) {
    showToast("请填写 Copilot 支持的模型名称，或留空使用默认模型");
    return;
  }
  copilotPreviewEntries = entries.slice(0, 60).map(copilotPayloadEntry);
  $("#copilotConsentSummary").textContent = `${activePeriod === "all" ? "全部日期" : `最近 ${activePeriod} 天`} · ${entries.length > 60 ? `共 ${entries.length} 条，本次仅列出最近 60 条` : `${entries.length} 条真实记录`} · 模型：${copilotPreviewModel || "本机默认"}`;
  $("#copilotConsentCheck").checked = false;
  $("#copilotPreview").replaceChildren(...copilotPreviewEntries.map((entry, index) => {
    const label = createElement("label", "copilot-preview-entry");
    const check = createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.dataset.previewIndex = index;
    const copy = createElement("span");
    copy.append(createElement("strong", "", `${entry.date} · ${areaLabels[entry.area]}`),
      createElement("span", "", entry.activity), createElement("small", "",
        `投入：${entry.engagement === null ? "未知" : `${entry.engagement}/5`} · 感受：${feelings[entry.feeling]?.label || "未知"}`));
    if (entry.contexts.length) copy.appendChild(createElement("small", "", `情境：${entry.contexts.join("、")}`));
    label.append(check, copy);
    return label;
  }));
  $("#copilotConsentDialog").showModal();
}

async function requestCopilot(event) {
  event.preventDefault();
  if (copilotController || !$("#copilotConsentCheck").checked) return;
  const entries = $$("#copilotPreview input:checked").map((input) => copilotPreviewEntries[Number(input.dataset.previewIndex)]);
  if (!entries.length) { showToast("至少选择一条记录，或暂不分析"); return; }
  $("#copilotConsentDialog").close();
  const controller = new AbortController();
  copilotController = controller;
  const timer = window.setTimeout(() => controller.abort(), 130000);
  renderCopilotAvailability();
  $("#copilotResult").hidden = true;
  $("#copilotMessage").textContent = `正在分析你确认的 ${entries.length} 条记录，可以继续写日记…`;
  let succeeded = false;
  try {
    const response = await fetch("/api/copilot/findings", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Seeking-Light": "1" },
      body: JSON.stringify({ consent: true, entries, model: copilotPreviewModel }), signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Copilot 暂时不可用");
    copilotFinding = { ...result, entries };
    renderCopilotResult();
    succeeded = true;
    $("#copilotStatus").textContent = `已通过本机 Copilot 完成分析 · ${result.model}`;
  } catch (error) {
    $("#copilotMessage").textContent = error.name === "AbortError" ? "分析已取消或超时，日记仍保留。已经发生的模型用量可能计费。" :
      `${error.message || "连接失败"}。你的日记未改动；没有用本地统计冒充 AI 结果。`;
  } finally {
    window.clearTimeout(timer);
    copilotController = null;
    $("#generateCopilotButton").disabled = !copilotEntries().length;
    $("#generateCopilotButton").textContent = "找找线索";
    $("#cancelCopilotButton").hidden = true;
    if (succeeded) renderCopilotAvailability();
    renderHomeFinding();
  }
}

function renderCopilotResult() {
  const result = copilotFinding;
  const target = $("#copilotResult");
  const sources = new Map(result.entries.map((entry) => [entry.id, entry]));
  const evidence = (ids) => {
    const details = createElement("details", "copilot-evidence");
    details.appendChild(createElement("summary", "", `查看 ${ids.length} 条原文依据`));
    ids.forEach((id) => {
      const source = sources.get(id);
      if (source) details.appendChild(createElement("blockquote", "", `${source.date} · ${source.activity}`));
    });
    return details;
  };
  const summary = createElement("p", "copilot-summary", result.summary);
  const insights = result.insights.map((item) => {
    const article = createElement("article", "copilot-insight");
    article.append(createElement("p", "eyebrow", item.kind), createElement("h3", "", item.title),
      createElement("p", "", item.observation), createElement("p", "copilot-hypothesis", `一种可能：${item.hypothesis}`),
      evidence(item.evidenceIds), createElement("p", "copilot-question", item.question));
    return article;
  });
  const experiment = createElement("details", "copilot-experiment");
  experiment.appendChild(createElement("summary", "", "一个可选的小尝试"));
  const add = createElement("button", "secondary-button", "留作下一次小尝试");
  add.type = "button";
  add.addEventListener("click", () => {
    if (state.acceptedExperiment && !window.confirm("已有一个小尝试。用这个替换它吗？")) return;
    state.acceptedExperiment = { ...result.experiment, acceptedAt: Date.now(), targetDate: localDateKey(offsetDate(1)), provider: result.provider };
    saveState("小尝试已保存");
    add.textContent = "已保存这个小尝试";
    add.disabled = true;
    showToast("小尝试已保存在这台设备上");
  });
  experiment.append(createElement("p", "eyebrow", "可选的小尝试"), createElement("h3", "", result.experiment.name),
    createElement("p", "", result.experiment.copy), evidence(result.experiment.evidenceIds), add);
  const more = createElement("details", "more-findings");
  more.append(createElement("summary", "", `另外 ${Math.max(0, insights.length - 1)} 条线索`), ...insights.slice(1));
  target.replaceChildren(summary, ...insights.slice(0, 1), ...(insights.length > 1 ? [more] : []), experiment);
  target.hidden = false;
  $("#copilotMessage").textContent = `已分析 ${result.entries.length} 条记录。以下解释仍是假设，不是对你的定义。`;
}

function renderEvidenceList(container, entries, type) {
  if (!entries.length) {
    container.replaceChildren(createElement("p", "empty-evidence", type === "bright"
      ? "暂时还没有同时满足高投入和能量上升的活动。继续记录，不需要刻意追求高分。"
      : "暂时没有明显的能量消耗记录。这不是目标，只说明当前样本里还没有出现。"));
    return;
  }
  container.replaceChildren(...entries.map((entry) => {
    const item = createElement("article", "evidence-item");
    const header = createElement("header");
    header.append(createElement("h3", "", trimText(entry.activity, 34)), createElement("strong", "", `${entry.engagement}/5`));
    const context = (entry.contexts || []).length ? `情境：${entry.contexts.join("、")}` : "下次可补充环境、互动或反馈线索";
    const source = entry.demo ? "体验示例 · " : "";
    item.append(header, createElement("p", "", `${source}${formatShortDate(entry.date)} · ${feelings[entry.feeling].label} · ${context}`));
    return item;
  }));
}

function buildExperiment(analysis) {
  const bright = analysis.bright[0];
  const drain = analysis.drains[0];
  if (bright) {
    const context = analysis.commonContext ? `保留“${analysis.commonContext}”这个条件，` : "尽量复刻当时的关键情境，";
    const focus = (bright.contexts || []).find((item) => !["独处", "协作", "户外", "安静"].includes(item));
    return {
      name: `为“${trimText(bright.activity, 20)}”做一个更小的原型`,
      copy: `${context}安排一次 30–60 分钟的相似活动。只提高一点难度，并记录投入、能量和你获得的反馈。${focus ? `重点观察“${focus}”这种活动方式是否仍然吸引你。` : ""}`,
    };
  }
  if (drain) {
    return {
      name: `重新设计“${trimText(drain.activity, 20)}”`,
      copy: "只改变一个变量：缩短时长、换到更有精神的时间、寻求协作，或让反馈更快出现。比较改变前后的投入与能量，而不是立刻放弃这件事。",
    };
  }
  return {
    name: "做一次主动选择的 30 分钟探索",
    copy: "从最近最想靠近的主题里选一个小动作：读、写、做、问或分享。结束后马上记录投入和能量，给兴趣一个在行动中出现的机会。",
  };
}

function loadDemoData() {
  const demos = [
    { offset: 0, area: "work", activity: "把一个模糊需求梳理成清晰的产品路径", engagement: 5, feeling: "energized", contexts: ["独处", "解决问题", "看见成果"] },
    { offset: 0, area: "life", activity: "晚饭后散步，和家人认真聊了最近的变化", engagement: 4, feeling: "calm", contexts: ["户外", "照顾他人"] },
    { offset: -1, area: "work", activity: "连续参加三场没有明确结论的会议", engagement: 2, feeling: "drained", contexts: ["协作"] },
    { offset: -2, area: "work", activity: "研究一个新工具，并做出可以操作的小样", engagement: 5, feeling: "satisfied", contexts: ["独处", "创造", "学习新知", "即时反馈"] },
    { offset: -3, area: "life", activity: "整理最近的阅读笔记，写下自己的理解", engagement: 4, feeling: "energized", contexts: ["安静", "表达", "看见成果"] },
    { offset: -4, area: "life", activity: "睡前漫无目的地刷了很久手机", engagement: 1, feeling: "tense", contexts: ["独处"] },
  ];
  demos.forEach((demo, index) => {
    const key = localDateKey(offsetDate(demo.offset));
    if (!state.days[key]) state.days[key] = { entries: [] };
    const demoId = `demo-${index}`;
    if (!state.days[key].entries.some((entry) => entry.id === demoId)) {
      state.days[key].entries.push({ ...demo, id: demoId, createdAt: Date.now() - index * 1000, demo: true });
    }
  });
  saveState("体验示例已载入");
  renderAll();
  showToast("已载入体验示例，所有示例都已明确标记");
}

function switchView(view) {
  activeView = view;
  $$(".app-view").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
  $$('[data-view-target]').forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === view));
  if (view === "findings") renderFindings();
  if (view === "history") renderHistory();
  if (view === "today") resizeComposer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistory() {
  const entries = savedEntries();
  const validDays = new Set(entries.map((entry) => entry.date)).size;
  $("#summaryDays").textContent = String(validDays);
  $("#summaryEntries").textContent = String(entries.length);
  $("#clearDemoButton").hidden = !getAllEntries().some((entry) => entry.demo);
  renderCalendar();
  renderHistoryDetail(selectedHistoryDate);
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $("#calendarTitle").textContent = `${year} 年 ${month + 1} 月`;
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const date = offsetDate(i, start);
    const key = localDateKey(date);
    const count = key <= localDateKey() ? (getDay(key).entries || []).filter((entry) => !entry.demo).length : 0;
    const button = createElement("button", "calendar-day");
    button.type = "button";
    button.dataset.historyDate = key;
    button.dataset.level = String(heatLevel(count));
    button.disabled = key > localDateKey();
    button.setAttribute("aria-label", `${key}，${button.disabled ? "尚未到来" : `${count} 条记录`}`);
    button.setAttribute("aria-pressed", String(key === selectedHistoryDate));
    if (date.getMonth() !== month) button.classList.add("is-outside");
    if (key === selectedHistoryDate) button.classList.add("is-selected");
    if (key === localDateKey()) button.classList.add("is-today");
    button.appendChild(createElement("span", "", String(date.getDate())));
    if (count) button.appendChild(createElement("small", "", `${count} 条`));
    days.push(button);
  }
  $("#calendarGrid").replaceChildren(...days);
}

function renderHistoryDetail(key) {
  selectedHistoryDate = key;
  const entries = getDay(key).entries || [];
  const date = parseDateKey(key);
  $("#historyDetailDate").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
  $("#historyDetailTitle").textContent = entries.length ? `${entries.length} 条记录${entries.some((entry) => entry.demo) ? "（含示例）" : ""}` : "这一天还没有记录";
  const container = $("#historyDetailEntries");
  if (!entries.length) {
    container.replaceChildren(createElement("p", "history-placeholder", key === localDateKey() ? "今天仍然可以写下第一件事。" : "空白也属于生活，不需要补齐每一天。"));
  } else {
    container.replaceChildren(...entries.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((entry) => renderEntry({ ...entry, date: key })));
  }
  renderCalendar();
  refreshIcons();
}

function exportJournal() {
  const entries = savedEntries().sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) {
    showToast("还没有可以导出的记录");
    return;
  }
  const grouped = entries.reduce((map, entry) => {
    if (!map[entry.date]) map[entry.date] = [];
    map[entry.date].push(entry);
    return map;
  }, {});
  const lines = ["# 寻光日记", ""];
  Object.entries(grouped).forEach(([date, dayEntries]) => {
    lines.push(`## ${date}`, "");
    dayEntries.forEach((entry) => {
      lines.push(entry.activity, "");
      const metadata = copilotPayloadEntry(entry);
      if (metadata.engagement) lines.push(`投入度：${metadata.engagement}/5`);
      if (metadata.feeling) lines.push(`感受：${feelings[metadata.feeling]?.label || "未知"}`);
      if (entry.contexts?.length) lines.push(`  - 情境：${entry.contexts.join("、")}`);
    });
    lines.push("");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `寻光日记-${localDateKey()}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast("记录已导出为 Markdown");
}

function clearDemoData() {
  Object.keys(state.days).forEach((key) => {
    state.days[key].entries = (state.days[key].entries || []).filter((entry) => !entry.demo);
    if (!state.days[key].entries.length) delete state.days[key];
  });
  saveState("体验示例已清除");
  renderAll();
  showToast("体验示例已清除，你的真实记录未受影响");
}

function openReminder() {
  $("#reminderEnabled").checked = state.reminder.enabled;
  $("#reminderTime").value = state.reminder.time || "21:30";
  $("#reminderMessage").value = state.reminder.message || defaultState().reminder.message;
  $("#reminderDialog").showModal();
}

async function saveReminder(event) {
  event.preventDefault();
  const enabled = $("#reminderEnabled").checked;
  if (enabled && "Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") showToast("浏览器通知未授权，页面内提醒仍会保留");
  }
  state.reminder = {
    ...state.reminder,
    enabled,
    time: $("#reminderTime").value || "21:30",
    message: $("#reminderMessage").value.trim() || defaultState().reminder.message,
  };
  saveState("提醒设置已保存");
  renderReminderSummary();
  $("#reminderDialog").close();
  showToast(enabled ? `每天 ${state.reminder.time} 提醒你回看一天` : "每日提醒已关闭");
}

function renderReminderSummary() {
  $("#reminderSummary").textContent = state.reminder.enabled ? `每天 ${state.reminder.time}` : "尚未开启";
}

function checkReminder() {
  if (!state.reminder.enabled) return;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const key = localDateKey(now);
  if (current !== state.reminder.time || state.reminder.lastSent === key) return;
  state.reminder.lastSent = key;
  saveState();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("寻光日记", { body: state.reminder.message });
  }
  showToast(state.reminder.message);
}

function acceptExperiment() {
  const raw = $("#acceptExperimentButton").dataset.experiment;
  if (!raw) return;
  const experiment = JSON.parse(raw);
  state.acceptedExperiment = { ...experiment, acceptedAt: Date.now(), targetDate: localDateKey(offsetDate(1)) };
  saveState();
  showToast("已加入明天的探索，不需要一次做到完美");
  $("#acceptExperimentButton").textContent = "已加入明天的探索";
  $("#acceptExperimentButton").disabled = true;
}

function renderAll() {
  renderToday();
  renderReminderSummary();
  if (activeView === "findings") renderFindings();
  if (activeView === "history") renderHistory();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) switchView(viewButton.dataset.viewTarget);

    const addButton = event.target.closest("[data-add-entry]");
    if (addButton) openEntryDialog(addButton.dataset.addEntry);

    const editButton = event.target.closest("[data-edit-entry]");
    if (editButton) {
      const entry = findEntry(editButton.dataset.editEntry);
      if (entry) openEntryDialog(entry.area, entry.id);
    }

    const deleteButton = event.target.closest("[data-delete-entry]");
    if (deleteButton) deleteEntry(deleteButton.dataset.deleteEntry);

    const dayButton = event.target.closest("[data-history-date]");
    if (dayButton && !dayButton.disabled) renderHistoryDetail(dayButton.dataset.historyDate);

    const streamButton = event.target.closest("[data-stream-date]");
    if (streamButton && !streamButton.disabled) {
      streamDate = streamButton.dataset.streamDate;
      streamLimit = 20;
      renderToday();
    }
    $$(".entry-actions[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
  });

  $("#entryForm").addEventListener("submit", submitEntry);
  $("#checkCopilotButton").addEventListener("click", checkCopilot);
  $("#generateCopilotButton").addEventListener("click", previewCopilot);
  $("#copilotConsentForm").addEventListener("submit", requestCopilot);
  [$("#closeCopilotConsentButton"), $("#cancelCopilotConsentButton")].forEach((button) =>
    button.addEventListener("click", () => $("#copilotConsentDialog").close()));
  $("#cancelCopilotButton").addEventListener("click", () => copilotController?.abort());
  $$(".close-dialog").forEach((button) => button.addEventListener("click", () => $("#entryDialog").close()));
  $("#captureMomentsButton").addEventListener("click", captureFreewrite);
  $("#focusComposerButton").addEventListener("click", () => toggleComposerFocus());
  $("#freewriteInput").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      captureFreewrite();
    }
  });
  $("#freewriteInput").addEventListener("input", (event) => {
    if (!state.freewriteDraft) state.freewriteDraftDate = localDateKey();
    state.freewriteDraft = event.target.value;
    if (!state.freewriteDraft) delete state.freewriteDraftDate;
    $("#captureMomentsButton").disabled = !event.target.value.trim();
    resizeComposer();
    $("#saveStatus").textContent = "正在保留草稿…";
    window.clearTimeout(freewriteTimer);
    freewriteTimer = window.setTimeout(() => saveState("草稿已保留"), 300);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("composer-focus")) toggleComposerFocus(false);
  });
  $$("[data-footprint-period]").forEach((button) => button.addEventListener("click", () => {
    footprintPeriod = button.dataset.footprintPeriod;
    renderFootprint();
  }));
  $("#footprintYearSelect").addEventListener("change", (event) => {
    footprintYear = Number(event.target.value);
    renderFootprint();
  });
  $("#footprintMonthSelect").addEventListener("change", (event) => {
    footprintMonth = Number(event.target.value);
    renderFootprint();
  });
  $("#footprintGrid").addEventListener("pointerover", (event) => {
    const cell = event.target.closest("[data-footprint-date]");
    if (cell) $("#footprintHover").textContent = cell.title;
  });
  $("#streamDate").addEventListener("change", (event) => {
    const key = event.target.value;
    streamDate = /^\d{4}-\d{2}-\d{2}$/.test(key) && localDateKey(parseDateKey(key)) === key && key <= localDateKey() ? key : "";
    streamLimit = 20;
    renderToday();
  });
  $("#clearStreamDate").addEventListener("click", () => { streamDate = ""; streamLimit = 20; renderToday(); });
  $("#loadMoreNotes").addEventListener("click", () => { streamLimit += 20; renderToday(); });
  window.addEventListener("pagehide", () => {
    if (state.freewriteDraft) saveState("草稿已保留");
  });
  window.addEventListener("resize", resizeComposer);

  $$("[data-period]").forEach((button) => button.addEventListener("click", () => {
    activePeriod = button.dataset.period;
    $$("[data-period]").forEach((item) => item.classList.toggle("is-active", item === button));
    const label = activePeriod === "all" ? "全部记录" : `最近 ${activePeriod} 天`;
    $("#findingsView .eyebrow").textContent = `AI Finding · ${label}`;
    renderFindings();
  }));

  $("#loadDemoButton").addEventListener("click", loadDemoData);
  $("#acceptExperimentButton").addEventListener("click", acceptExperiment);
  $("#exportButton").addEventListener("click", exportJournal);
  $("#clearDemoButton").addEventListener("click", clearDemoData);

  $("#previousMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
  $("#nextMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });

  [$("#reminderButton"), $("#mobileReminderButton")].forEach((button) => button.addEventListener("click", openReminder));
  $("#reminderForm").addEventListener("submit", saveReminder);
  $$(".close-reminder").forEach((button) => button.addEventListener("click", () => $("#reminderDialog").close()));

}

function initialize() {
  $("#dateEyebrow").textContent = formatLongDate();
  $("#freewriteInput").value = state.freewriteDraft || "";
  if (state.freewriteDraft && !state.freewriteDraftDate) state.freewriteDraftDate = localDateKey();
  bindEvents();
  renderAll();
  updateDraftStatus();
  document.fonts?.ready.then(resizeComposer);
  checkReminder();
  window.setInterval(() => {
    if (renderedDate !== localDateKey()) { renderedDate = localDateKey(); renderAll(); updateDraftStatus(); }
    checkReminder();
  }, 30000);
}

initialize();

window.__seekingLight = {
  feelings,
  localDateKey,
  analyze,
  buildExperiment,
  getKeywords,
  inferArea,
  defaultState,
};
