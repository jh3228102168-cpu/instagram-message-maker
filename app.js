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

async function renderPost(message, photoIndex) {
  await document.fonts.load('400 74px "Gowun Dodum"');
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext("2d"); const photo = state.photos[photoIndex];
  const image = await loadImage(photo.url); drawCover(context, image, canvas.width, canvas.height);
  // 입력한 번호와 줄바꿈은 그대로 유지하고, 예시와 같은 크기로 고정합니다.
  const lines = message.split(/\r?\n/); const fontSize = 74;
  context.font = `700 ${fontSize}px "Gowun Dodum", sans-serif`;
  const lineHeight = fontSize * 1.42;
  const textHeight = lines.length * lineHeight;
  const y = state.align === "top" ? 210 : state.align === "bottom" ? 1130 - textHeight : 675 - textHeight / 2;
  const boxX = 82, boxY = y - 42, boxWidth = 916, boxHeight = textHeight + 84;
  context.fillStyle = "rgba(42,42,45,.38)"; context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.textAlign = "left"; context.textBaseline = "top"; context.font = `700 ${fontSize}px "Gowun Dodum", sans-serif`;
  context.fillStyle = "#fff"; lines.forEach((line, i) => context.fillText(line, 130, y + i * lineHeight));
  return canvas.toDataURL("image/jpeg", .93);
}

async function makeResult(post, suggestedIndex) {
  const fragment = $("#result-template").content.cloneNode(true); const card = fragment.querySelector("article");
  const preview = fragment.querySelector(".result-image"); const picker = fragment.querySelector(".image-picker");
  fragment.querySelector(".message-preview").textContent = post.display;
  state.photos.forEach((photo, index) => picker.add(new Option(`사진 ${index + 1} · ${photo.name}`, index, index === suggestedIndex, index === suggestedIndex)));
  preview.src = await renderPost(post.display, suggestedIndex);
  picker.addEventListener("change", async () => { preview.src = await renderPost(post.display, Number(picker.value)); });
  fragment.querySelector(".download-button").addEventListener("click", async () => {
    try { await saveToPhotos(preview.src, post.display); } catch (error) {
      if (error.name !== "AbortError") { download(preview.src, post.display); notice.textContent = "사진 저장을 열 수 없어 다운로드 폴더에 저장했습니다."; }
    }
  });
  $("#result-list").append(fragment);
}

function fileName(message) { return `instagram-${message.slice(0, 18).replace(/[\\/:*?\"<>|]/g, "") || "post"}.jpg`; }
function download(dataUrl, message) { const a = document.createElement("a"); a.href = dataUrl; a.download = fileName(message); a.click(); }
async function saveToPhotos(dataUrl, message) {
  const file = new File([await (await fetch(dataUrl)).blob()], fileName(message), { type: "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "인스타 이미지" });
    notice.textContent = "공유 메뉴에서 ‘이미지 저장’을 선택하면 사진 앱에 저장됩니다.";
  } else {
    download(dataUrl, message);
    notice.textContent = "이 브라우저에서는 다운로드 폴더에 저장됩니다.";
  }
}

$("#create").addEventListener("click", async () => {
  const rawMessages = messagesInput.value.trim();
  const messages = [...rawMessages.matchAll(/(?:^|\n)[ \t]*(\d+)\.([\s\S]*?)(?=\n[ \t]*\d+\.|$)/g)]
    .map((match) => ({ number: match[1], content: match[2].trim(), display: `${match[1]}.${match[2]}` }))
    .filter((post) => post.content);
  if (!state.photos.length || !rawMessages) { notice.textContent = "사진과 메시지를 모두 넣어 주세요."; return; }
  if (!messages.length) { notice.textContent = "메시지를 1. 문장 · 2. 문장 형식으로 입력해 주세요."; return; }
  if (state.photos.length < messages.length) { notice.textContent = "같은 사진을 쓰지 않으려면 메시지 수 이상으로 사진을 올려 주세요."; return; }
  notice.textContent = "사진을 고르고 이미지를 만들고 있어요…"; $("#create").disabled = true;
  $("#result-list").replaceChildren();
  const remainingPhotos = [...state.photos];
  for (const post of messages) {
    const recommended = [...remainingPhotos].sort((a, b) => scorePhoto(post.content, b) - scorePhoto(post.content, a))[0];
    remainingPhotos.splice(remainingPhotos.indexOf(recommended), 1);
    await makeResult(post, recommended.index);
  }
  $("#results").hidden = false; $("#create").disabled = false; notice.textContent = `${messages.length}개의 게시물을 만들었어요.`;
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#download-all").addEventListener("click", () => document.querySelectorAll(".result-image").forEach((image, index) => setTimeout(() => download(image.src, `instagram-${index + 1}`), index * 350)));
