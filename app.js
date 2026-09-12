const state = { photos: [], align: "center", results: [] };
const $ = (selector) => document.querySelector(selector);
const photosInput = $("#photos");
const messagesInput = $("#messages");
const notice = $("#notice");

photosInput.addEventListener("change", (event) => {
  state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
  state.photos = [...event.target.files].filter((file) => file.type.startsWith("image/")).map((file, index) => ({
    file, url: URL.createObjectURL(file), name: file.name, index
  }));
  $("#photo-count").textContent = state.photos.length ? `${state.photos.length}장의 사진을 선택했어요.` : "아직 선택한 사진이 없어요.";
  $("#photo-list").replaceChildren(...state.photos.map((photo) => {
    const image = new Image(); image.src = photo.url; image.alt = photo.name; return image;
  }));
});

document.querySelectorAll("[data-align]").forEach((button) => button.addEventListener("click", () => {
  state.align = button.dataset.align;
  document.querySelectorAll("[data-align]").forEach((item) => item.classList.toggle("active", item === button));
}));

function scorePhoto(message, photo) {
  // 파일명에 담긴 단어(예: beach_sunset.jpg)를 활용해 가장 가까운 사진을 먼저 추천합니다.
  const text = `${message} ${photo.name}`.toLowerCase();
  const groups = [
    ["바다", "해변", "파도", "여름", "beach", "sea", "ocean", "wave", "summer"],
    ["하늘", "노을", "햇살", "sun", "sky", "sunset", "light"],
    ["꽃", "봄", "flower", "garden", "bloom"],
    ["커피", "카페", "coffee", "cafe", "브런치"],
    ["여행", "길", "도시", "trip", "travel", "street", "city"],
    ["웃음", "행복", "사랑", "love", "happy", "smile", "friend"],
    ["밤", "별", "달", "night", "moon", "star"]
  ];
  return groups.reduce((total, words) => total + (words.some((word) => message.toLowerCase().includes(word)) && words.some((word) => photo.name.toLowerCase().includes(word)) ? 10 : 0), 0) + (state.photos.length - photo.index) / 100;
}

function loadImage(source) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
}

function drawCover(context, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale, drawHeight = image.height * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrapText(context, text, maxWidth) {
  const words = text.split(/\s+/); const lines = []; let line = "";
  words.forEach((word) => {
    const proposal = line ? `${line} ${word}` : word;
    if (context.measureText(proposal).width > maxWidth && line) { lines.push(line); line = word; } else line = proposal;
  });
  if (line) lines.push(line);
  return lines;
}

async function renderPost(message, photoIndex) {
  await document.fonts.load('400 74px "Gowun Dodum"');
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext("2d"); const photo = state.photos[photoIndex];
  const image = await loadImage(photo.url); drawCover(context, image, canvas.width, canvas.height);
  if ($("#shade").checked) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,.12)"); gradient.addColorStop(.5, "rgba(0,0,0,.04)"); gradient.addColorStop(1, "rgba(0,0,0,.65)");
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  }
  let fontSize = 74; context.font = `400 ${fontSize}px "Gowun Dodum", sans-serif`;
  while (wrapText(context, message, 850).length > 4 && fontSize > 38) { fontSize -= 4; context.font = `400 ${fontSize}px "Gowun Dodum", sans-serif`; }
  const lines = wrapText(context, message, 850); const lineHeight = fontSize * 1.28;
  const y = state.align === "top" ? 210 : state.align === "bottom" ? 1130 - lines.length * lineHeight : 675 - (lines.length - 1) * lineHeight / 2;
  context.textAlign = "center"; context.textBaseline = "top"; context.font = `400 ${fontSize}px "Gowun Dodum", sans-serif`;
  context.fillStyle = "rgba(0,0,0,.26)"; lines.forEach((line, i) => context.fillText(line, 544, y + i * lineHeight + 4));
  context.fillStyle = "#fff"; lines.forEach((line, i) => context.fillText(line, 540, y + i * lineHeight));
  return canvas.toDataURL("image/jpeg", .93);
}

async function makeResult(message, suggestedIndex) {
  const fragment = $("#result-template").content.cloneNode(true); const card = fragment.querySelector("article");
  const preview = fragment.querySelector(".result-image"); const picker = fragment.querySelector(".image-picker");
  fragment.querySelector(".message-preview").textContent = message;
  state.photos.forEach((photo, index) => picker.add(new Option(`사진 ${index + 1} · ${photo.name}`, index, index === suggestedIndex, index === suggestedIndex)));
  preview.src = await renderPost(message, suggestedIndex);
  picker.addEventListener("change", async () => { preview.src = await renderPost(message, Number(picker.value)); });
  fragment.querySelector(".download-button").addEventListener("click", () => download(preview.src, message));
  $("#result-list").append(fragment);
}

function download(dataUrl, message) { const a = document.createElement("a"); a.href = dataUrl; a.download = `instagram-${message.slice(0, 18).replace(/[\\/:*?\"<>|]/g, "") || "post"}.jpg`; a.click(); }

$("#create").addEventListener("click", async () => {
  const rawMessages = messagesInput.value.trim();
  const messages = [...rawMessages.matchAll(/(?:^|\n)\s*\d+\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s*)|$)/g)].map((match) => match[1].trim()).filter(Boolean);
  if (!state.photos.length || !rawMessages) { notice.textContent = "사진과 메시지를 모두 넣어 주세요."; return; }
  if (!messages.length) { notice.textContent = "메시지를 1. 문장 · 2. 문장 형식으로 입력해 주세요."; return; }
  notice.textContent = "사진을 고르고 이미지를 만들고 있어요…"; $("#create").disabled = true;
  $("#result-list").replaceChildren();
  for (const message of messages) {
    const recommended = [...state.photos].sort((a, b) => scorePhoto(message, b) - scorePhoto(message, a))[0];
    await makeResult(message, recommended.index);
  }
  $("#results").hidden = false; $("#create").disabled = false; notice.textContent = `${messages.length}개의 게시물을 만들었어요.`;
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#download-all").addEventListener("click", () => document.querySelectorAll(".result-image").forEach((image, index) => setTimeout(() => download(image.src, `instagram-${index + 1}`), index * 350)));
