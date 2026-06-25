const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const HASH_DEFAULT_SCROLL_INDEX = 0;
const HASH_RANDOM_PREFIX = "~";
const HASH_TELEGRAM_PREFIX = "x";
const HASH_CARD_PREFIX = "ad-";
const TELEGRAM_HASH_NONCE_LENGTH = 4;
const USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

function bytesToBigIntTagged(bytes) {
  return BigInt("0x" + [1, ...bytes].map(b => b.toString(16).padStart(2, "0")).join(""));
}

function encodeBaseN(bytes, alphabet) {
  let num = bytesToBigIntTagged(bytes);
  let encoded = "";
  const base = BigInt([...alphabet].length);
  const symbols = [...alphabet];

  while (num > 0n) {
    encoded = symbols[Number(num % base)] + encoded;
    num /= base;
  }

  return encoded || symbols[0];
}

function randomSeedText() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return encodeBaseN(bytes, chars).replace(/^0+/, "") || "0";
}

function normalizeCardId(value, scrollIndex = HASH_DEFAULT_SCROLL_INDEX) {
  const safeIndex = Math.max(0, Number.isSafeInteger(scrollIndex) ? scrollIndex : HASH_DEFAULT_SCROLL_INDEX);
  const cardId = String(value || "").trim();
  return /^ad-\d+$/.test(cardId) ? cardId : `${HASH_CARD_PREFIX}${safeIndex}`;
}

function parseHashIndex(value) {
  const scrollIndex = Number.parseInt(value || "0", 36);
  return Number.isSafeInteger(scrollIndex) && scrollIndex >= 0 ? scrollIndex : null;
}

function formatHashIndex(scrollIndex) {
  const safeIndex = Math.max(0, Number.isSafeInteger(scrollIndex) ? scrollIndex : scrollIndex | 0);
  return safeIndex.toString(36);
}

function telegramShift(nonce, charIndex, scrollIndex) {
  return hashText32(`${nonce}:${scrollIndex}:${charIndex}`) % USERNAME_CHARS.length;
}

function telegramHashSignature(username, nonce, scrollIndex) {
  return (hashText32(`${username}:${nonce}:${scrollIndex}`) % 1679616).toString(36).padStart(4, "0");
}

function encodeTelegramUsername(username, nonce = randomSeedText().slice(0, TELEGRAM_HASH_NONCE_LENGTH), scrollIndex = HASH_DEFAULT_SCROLL_INDEX) {
  return [...username].map((char, index) => {
    const charIndex = USERNAME_CHARS.indexOf(char);
    if (charIndex < 0) throw new Error("Telegram username contains unsupported symbols.");
    return USERNAME_CHARS[(charIndex + telegramShift(nonce, index, scrollIndex)) % USERNAME_CHARS.length];
  }).join("");
}

function decodeTelegramUsername(payload, nonce, scrollIndex = HASH_DEFAULT_SCROLL_INDEX) {
  return [...payload].map((char, index) => {
    const charIndex = USERNAME_CHARS.indexOf(char);
    if (charIndex < 0) return "";
    return USERNAME_CHARS[(charIndex - telegramShift(nonce, index, scrollIndex) + USERNAME_CHARS.length) % USERNAME_CHARS.length];
  }).join("");
}

function parseHashState() {
  const raw = decodeURIComponent(window.location.hash.slice(1));
  if (!raw) return null;

  const separatorIndex = raw.lastIndexOf(".");
  const seedPart = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  const indexPart = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : "0";
  const scrollIndex = parseHashIndex(indexPart);
  if (scrollIndex === null) return null;

  if (seedPart.startsWith(HASH_TELEGRAM_PREFIX)) {
    const encoded = seedPart.slice(HASH_TELEGRAM_PREFIX.length);
    const nonce = encoded.slice(0, TELEGRAM_HASH_NONCE_LENGTH);
    const scopedPayload = encoded.slice(TELEGRAM_HASH_NONCE_LENGTH);
    const [payload, embeddedIndexPart = "0", signature = ""] = scopedPayload.split("-");
    const embeddedIndex = parseHashIndex(embeddedIndexPart);
    if (
      !/^[0-9a-zA-Z]{4}$/.test(nonce) ||
      !/^[a-zA-Z0-9_]{4,32}$/.test(payload) ||
      embeddedIndex === null ||
      embeddedIndex !== scrollIndex ||
      !/^[0-9a-z]{4}$/.test(signature)
    ) return null;
    const username = decodeTelegramUsername(payload, nonce, embeddedIndex);
    if (!/^[a-zA-Z0-9_]{4,32}$/.test(username) || signature !== telegramHashSignature(username, nonce, embeddedIndex)) return null;
    return { seed: `u:${username}:${nonce}:${embeddedIndex}`, scrollIndex, cardId: normalizeCardId("", scrollIndex) };
  }

  if (seedPart.startsWith(HASH_RANDOM_PREFIX)) {
    const seed = seedPart.slice(HASH_RANDOM_PREFIX.length);
    if (!/^[0-9a-zA-Z]+$/.test(seed)) return null;
    return { seed, scrollIndex, cardId: normalizeCardId("", scrollIndex) };
  }

  return null;
}

function formatHashState(seed, scrollIndex) {
  const safeIndex = Math.max(0, Number.isSafeInteger(scrollIndex) ? scrollIndex : scrollIndex | 0);
  const indexText = formatHashIndex(safeIndex);
  const indexPart = safeIndex ? `.${indexText}` : "";
  const telegram = String(seed).match(/^u:([a-zA-Z0-9_]{4,32})(?::([0-9a-zA-Z]{4}))?(?::([0-9]+))?$/);
  if (telegram) {
    const nonce = telegram[2] || randomSeedText().slice(0, TELEGRAM_HASH_NONCE_LENGTH);
    const payload = encodeTelegramUsername(telegram[1], nonce, safeIndex);
    const signature = telegramHashSignature(telegram[1], nonce, safeIndex);
    return `#${HASH_TELEGRAM_PREFIX}${nonce}${payload}-${indexText}-${signature}${indexPart}`;
  }
  return `#${HASH_RANDOM_PREFIX}${String(seed).replace(/[^0-9a-zA-Z]/g, "") || randomSeedText()}${indexPart}`;
}

const parsedHashState = parseHashState();
const initialHashState = parsedHashState || { seed: randomSeedText(), scrollIndex: HASH_DEFAULT_SCROLL_INDEX, cardId: normalizeCardId("", HASH_DEFAULT_SCROLL_INDEX) };
if (!parsedHashState) {
  history.replaceState(null, "", formatHashState(initialHashState.seed, initialHashState.scrollIndex));
}

function hashText32(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function makeRng(seedText, stream = 0) {
  let state = (hashText32(`${seedText}:${stream}`) || 0x9e3779b9) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

let activeRng = makeRng(initialHashState.seed);
const withRng = (rng, callback) => {
  const previous = activeRng;
  activeRng = rng;
  try { return callback(); } finally { activeRng = previous; }
};

const HORROR_PALETTES = [
  { bg: "#050506", fog: "#17171a", blood: "#b00020", bone: "#f2eee6", ash: "#6d6d72" },
  { bg: "#090608", fog: "#201114", blood: "#d11124", bone: "#fff8ef", ash: "#7b7376" },
  { bg: "#010101", fog: "#161616", blood: "#8f0014", bone: "#ece6dc", ash: "#5d5d63" },
  { bg: "#0d0b0c", fog: "#21191b", blood: "#c60b1e", bone: "#faf6ee", ash: "#878186" }
];

const escapeSvg = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function hashText(text) {
  return hashText32(text);
}

function wrapSvgText(text, maxLineLength = 20, maxLines = 3) {
  const words = String(text).toUpperCase().replace(/[—–]/g, "-").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  const normalized = lines.flatMap((line) => {
    if (line.length <= maxLineLength + 4) return line;
    const chunks = [];
    for (let index = 0; index < line.length; index += maxLineLength) chunks.push(line.slice(index, index + maxLineLength));
    return chunks;
  });

  if (normalized.length <= maxLines) return normalized;
  const clipped = normalized.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(8, maxLineLength - 1))}…`;
  return clipped;
}

const svgTextLines = (lines, x, firstY, size, lineHeight, attrs = "") =>
  lines.map((line, index) => `<text x='${x}' y='${firstY + index * lineHeight}' ${attrs} font-size='${size}'>${escapeSvg(line)}</text>`).join("");

function generateNightCity(seed, palette) {
	let svg = '';

	const rnd = (() => {
		let s = seed >>> 0;
		return () => {
			s = (s * 1664525 + 1013904223) >>> 0;
			return s / 4294967296;
		};
	})();

	let x = -20;

	while (x < 680) {
		const width = 30 + rnd() * 80;
		const height = 30 + rnd() * 90;

		svg += `
			<rect
				x='${x}'
				y='${280 - height}'
				width='${width}'
				height='${height}'
				fill='${palette.ash}'
				opacity='.18'
			/>
		`;

		x += width * (0.5 + rnd() * 0.8);
	}

	x = -30;

	while (x < 680) {
		const width = 24 + rnd() * 70;
		const height = 70 + rnd() * 160;

		const y = 280 - height;

		svg += `
			<rect
				x='${x}'
				y='${y}'
				width='${width}'
				height='${height}'
				fill='${palette.fog}'
				stroke='${palette.ash}'
				stroke-width='1'
				opacity='.95'
			/>
		`;

		const roof = Math.floor(rnd() * 5);

		if (roof === 0) {
			svg += `
				<path
					d='M${x} ${y}
					L${x + width / 2} ${y - 20 - rnd() * 20}
					L${x + width} ${y}Z'
					fill='${palette.fog}'
					stroke='${palette.ash}'
				/>
			`;
		}

		if (roof === 1) {
			const towerW = width * 0.25;

			svg += `
				<rect
					x='${x + width * 0.4}'
					y='${y - 40}'
					width='${towerW}'
					height='40'
					fill='${palette.fog}'
					stroke='${palette.ash}'
				/>
			`;
		}

		if (roof === 2) {
			svg += `
				<line
					x1='${x + width / 2}'
					y1='${y}'
					x2='${x + width / 2}'
					y2='${y - 35 - rnd() * 30}'
					stroke='${palette.ash}'
					stroke-width='2'
				/>
			`;
		}

		const cols = Math.max(1, Math.floor(width / 12));
		const rows = Math.max(1, Math.floor(height / 16));

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (rnd() > 0.18) continue;

				const color =
					rnd() > 0.95
						? palette.blood
						: palette.bone;

				svg += `
					<rect
						x='${x + 5 + col * 10}'
						y='${y + 8 + row * 14}'
						width='4'
						height='6'
						fill='${color}'
						opacity='.8'
					/>
				`;
			}
		}

		x += width + rnd() * 35;
	}

	for (let i = 0; i < 8; i++) {
		if (rnd() > 0.4) continue;

		const lx = 30 + rnd() * 580;

		svg += `
			<line
				x1='${lx}'
				y1='280'
				x2='${lx}'
				y2='220'
				stroke='${palette.ash}'
				stroke-width='2'
			/>
			<circle
				cx='${lx}'
				cy='220'
				r='4'
				fill='${palette.bone}'
				opacity='.7'
			/>
		`;
	}

	return svg;
}

const art = (title, tone, mark) => {
	const seed = Math.abs(hashText(title));

	const palette = tone && mark
		? {
				bg: tone,
				fog: '#191316',
				blood: mark,
				bone: '#fff5eb',
				ash: '#777'
			}
		: HORROR_PALETTES[seed % HORROR_PALETTES.length];

	const variant = seed % 6;

	const lines = wrapSvgText(title, variant === 4 ? 18 : 22, 3);

	const textSize =
		lines.length === 1 ? 44 :
		lines.length === 2 ? 36 :
		22;

	const lineHeight = Math.round(textSize * 1.1);

	const panelTop = 204;
	const panelHeight = 82;
	const textBlockHeight = lineHeight * (lines.length - 1);
	const textY = panelTop + (panelHeight - textBlockHeight) / 2 + textSize * 0.35;

	const moons = [
		`<circle cx='528' cy='70' r='45' fill='${palette.bone}' opacity='.1'/><circle cx='510' cy='63' r='45' fill='${palette.bg}' opacity='.92'/>`,
		`<path d='M510 30c54 10 83 62 58 111-38-18-77-44-58-111Z' fill='${palette.bone}' opacity='.16'/>`,
		`<circle cx='520' cy='82' r='9' fill='${palette.blood}'/><circle cx='558' cy='92' r='6' fill='${palette.blood}'/>`
	];

	const scene = generateNightCity(seed, palette);

	return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 320' role='img' aria-label='${escapeSvg(title)}'>
<defs>
	<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
		<stop offset='0' stop-color='${palette.bg}'/>
		<stop offset='.58' stop-color='${palette.fog}'/>
		<stop offset='1' stop-color='#000'/>
	</linearGradient>

	<radialGradient id='r' cx='.72' cy='.2' r='.7'>
		<stop offset='0' stop-color='${palette.blood}' stop-opacity='.42'/>
		<stop offset='.42' stop-color='${palette.blood}' stop-opacity='.08'/>
		<stop offset='1' stop-color='${palette.bg}' stop-opacity='0'/>
	</radialGradient>
</defs>

<rect width='640' height='320' fill='url(#g)'/>
<rect width='640' height='320' fill='url(#r)'/>

${moons[seed % moons.length]}
${scene}

<path
	d='M0 278 C92 245 158 308 242 270 S395 238 468 276 572 254 640 292 L640 320 L0 320Z'
	fill='#020202'
	opacity='.9'
/>

<path
	d='M28 204h584l-12 82H40z'
	fill='#050505'
	opacity='.82'
	stroke='${palette.blood}'
	stroke-width='3'
/>

<path
	d='M40 204h560'
	stroke='${palette.bone}'
	stroke-width='1'
	opacity='.25'
/>

<g
	font-family='Impact, Haettenschweiler, Arial Black, system-ui, sans-serif'
	font-weight='900'
	letter-spacing='.5'
	fill='${palette.bone}'
	stroke='#000'
	stroke-width='2'
	paint-order='stroke'
	text-rendering='geometricPrecision'
	shape-rendering='geometricPrecision'
>
	${svgTextLines(lines, 54, textY, textSize, lineHeight)}
</g>
</svg>
`)}`;
};

const labels = { all: "Все", service: "Услуги", lost: "Пропажи", medical: "Медицина", food: "Еда", mystic: "Мистика", trade: "Купля/продажа" };
const board = document.getElementById("board");
const searchInput = document.getElementById("search");
const categoryFilter = document.getElementById("categoryFilter");
const template = document.getElementById("cardTemplate");
const sentinel = document.getElementById("sentinel");
const slogan = document.getElementById("slogan");
const warning = document.getElementById("warning");
let renderedCount = 0;
let generatedCount = 0;
let generatedFingerprints = new Set();
let activeListingIndex = HASH_DEFAULT_SCROLL_INDEX;

const pick = (arr) => arr[Math.floor(activeRng() * arr.length)];
const chance = (percent) => activeRng() * 100 < percent;
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const phone = () => `+7 (${900 + Math.floor(activeRng() * 99)}) ${100 + Math.floor(activeRng() * 900)}-${10 + Math.floor(activeRng() * 90)}-${10 + Math.floor(activeRng() * 90)}`;

function makeClockTime() {
  const hour = String(Math.floor(activeRng() * 6) + (chance(70) ? 0 : 21)).padStart(2, "0");
  const minute = String(Math.floor(activeRng() * 60)).padStart(2, "0");
  return `в ${hour}:${minute}`;
}

function mysteryTime() {
  return chance(68) ? makeClockTime() : pick(mysteryTimeTemplates);
}

function mysteryNumber() {
  if (chance(58)) {
    const value = pick([0, 1, 2, 3, 4, 7, 9, 13, 27, 41, 66, 101, 404, 666]);
    const unit = pick(["шт.", "мешка", "литра", "дубля", "взгляда", "звонка", "подъезда", "минуты", "безымянных"]);
    return chance(35) ? `№${value}` : `${value} ${unit}`;
  }
  return pick(mysteryNumbers);
}

const markovModels = new Map();
const splitCharsCache = new Map();

function charsOf(text) {
  if (!splitCharsCache.has(text)) splitCharsCache.set(text, text.split(""));
  return splitCharsCache.get(text);
}

function markovModel(source) {
  const key = source.join("\u0000");
  if (markovModels.has(key)) return markovModels.get(key);

  const normalized = source.join(" ").toLowerCase();
  const words = normalized
    .replace(/[^а-яёa-z\s-]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 3);

  const latinCount = (normalized.match(/[a-z]/g) || []).length;
  const cyrillicCount = (normalized.match(/[а-яё]/g) || []).length;
  const fallbackAlphabet = latinCount >= cyrillicCount
    ? charsOf("abcdefghijklmnopqrstuvwxyz")
    : charsOf("абвгдежзийклмнопрстуфхцчшщыэюя");

  const transitions = new Map();
  const starts = words.map(word => word.slice(0, 2));
  words.forEach((word) => {
    for (let index = 0; index < word.length - 2; index += 1) {
      const pair = word.slice(index, index + 2);
      if (!transitions.has(pair)) transitions.set(pair, []);
      transitions.get(pair).push(word[index + 2]);
    }
  });

  const model = { starts, fallbackAlphabet, transitions };
  markovModels.set(key, model);
  return model;
}

function markovWord(source, min = 5, max = 12) {
  const model = markovModel(source);
  if (!model.starts.length) return "";

  let pair = pick(model.starts);
  let word = pair;
  const target = min + Math.floor(activeRng() * (max - min + 1));

  while (word.length < target) {
    const next = model.transitions.get(pair);
    word += next && next.length ? pick(next) : pick(model.fallbackAlphabet);
    pair = word.slice(-2);
  }

  return word;
}
function targetTelegramUsernameFor(index = activeListingIndex) {
  const match = initialHashState.seed.match(/^u:([a-zA-Z0-9_]{4,32})(?::[0-9a-zA-Z]{4})?(?::([0-9]+))?$/);
  const targetIndex = match && match[2] ? Number.parseInt(match[2], 10) : initialHashState.scrollIndex;
  return match && index === targetIndex && index === initialHashState.scrollIndex ? match[1] : "";
}

function babelTelegramUsername(min = 6, max = 20) {
  const length = min + Math.floor(activeRng() * (max - min + 1));
  const firstChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let username = pick(firstChars.split(""));
  for (let index = 1; index < length; index += 1) {
    username += pick(USERNAME_CHARS.split(""));
  }
  return username;
}

function telegramUsername(min = 6, max = 20, index = activeListingIndex) {
  const targetUsername = targetTelegramUsernameFor(index);
  if (targetUsername) return targetUsername;

	const corpus = [
		"shadow", "phantom", "whisper", "forgotten", "hollow",
		"signal", "corridor", "archive", "watcher", "keeper",
		"midnight", "ashen", "catacomb", "omen", "cipher",
		"ritual", "specter", "frequency", "district", "transit",
		"memory", "paradox", "vault", "echo", "veil",
		"lantern", "observer", "nameless", "scarlet", "frozen"
	];

	if (chance(80)) {
		let username = markovWord(corpus, 6, 14);

		if (chance(40)) {
			username += "_" + markovWord(corpus, 4, 10);
		}

		if (chance(35)) {
			username += "_" + Math.floor(10 + activeRng() * 9999);
		}

		return username.slice(0, max);
	}

	return babelTelegramUsername(min, max);
}

function generatedProvider(category = "service") {
  if (chance(42)) return pick(providerNames);
  if (chance(55)) return `${pick(legal)} «${pick(tones)} ${pick(cores)}»`;
  return `${pick(legal)} ${pick(industries[category] || industries.service)} «${pick(tones)} ${pick(cores)}»`;
}

function generatedPlace() {
  const base = chance(28)
    ? `${pick(["у", "возле", "под", "за", "в районе"])} ${pick(weirdAdjectives)} ${pick(weirdNouns)}`
    : pick(places);
  return chance(35) ? `${base}, ${pick(["подъезд", "секция", "склад", "павильон"])} ${mysteryNumber()}` : base;
}

function generatedPrice(category) {
  if (category === "lost") return chance(45) ? pick(rewardTypes) : `${mysteryNumber()} ₽ нашедшему`;
  if (chance(55)) return `${pick(["от", "до", "ровно", "почти"])} ${Math.floor(2 + activeRng() * 88) * 100} ₽ ${pick(["", "за мешок", "за визит", "и тишина", "без сдачи"] )}`.trim();
  return pick(pricePhrases);
}

function smartTitle(category) {
	const noun = pick([
		...titleObjects,
		...wantedThings,
		...tradedThings,
		...impossibleThings,
		`${pick(weirdAdjectives)} ${pick(weirdNouns)}`
	]);

	const place = chance(58) ? generatedPlace() : pick(titlePlaces);
	const provider = generatedProvider(category);

	const variants = {
		service: [
			`${cap(pick([...verbsRepair, ...verbsRemove, ...verbsInstall]))} ${noun} ${place}`,
			`${provider}: ${pick(weirdProcesses)}`,
			`${cap(pick(descActions))}: ${pick(titleObjects)} под ключ`,
			`${cap(pick([...verbsRepair, ...verbsInstall]))} ${pick(titleObjects)} без лишних вопросов`,
			`${provider} — выезд ${place}`,
			`${pick(titleObjects)}: диагностика и настройка`,
			`Срочно: ${pick(titleObjects)} ${place}`,
			`${cap(pick(descActions))} ${pick(impossibleThings)}`
		],

		lost: [
			`Пропал ${pick(lostThings)} ${place}`,
			`Нашли ${pick(weirdAdjectives)} ${pick(weirdNouns)}. Опишите, если ваше`,
			`Ищу ${pick(lostThings)}`,
			`${pick(lostThings)} вернулся, но ведёт себя странно`,
			`Кто потерял ${pick(titleObjects)}?`,
			`Замечен ${pick(lostThings)} ${place}`,
			`Вознаграждение за ${pick(lostThings)}`,
			`Разыскивается: ${pick(weirdAdjectives)} ${pick(weirdNouns)}`
		],

		medical: [
			`${pick(personNames)} — ${pick(clinicMethods)}`,
			`${cap(pick(clinicMethods))}: запись открыта`,
			`${provider}: осмотр ${pick(bodyParts)} без очереди`,
			`${pick(bodyParts)} беспокоит? Приходите`,
			`Консультация: ${pick(bodyParts)} и не только`,
			`${provider} — приём сегодня`,
			`Осмотр без направления`,
			`${pick(clinicMethods)} рядом с вами`
		],

		food: [
			`Домашнее МЯСО и ${pick(abstractThings)} с доставкой`,
			`${cap(pick(verbsSell))} ${pick(weirdAdjectives)} обед`,
			`Ночной набор: ${pick(wantedThings)} + гарнир из ${pick(abstractThings)}`,
			`Горячая еда ${place}`,
			`${pick(weirdAdjectives)} пироги на заказ`,
			`Свежая выпечка без ожидания`,
			`${provider}: доставка до двери`,
			`Ужин для тех, кто не спит`
		],

		mystic: [
			`${pick(eventNames)}: ${pick(titleEvents)}`,
			`${cap(pick(weirdPhenomena))} — выезд мастера`,
			`${provider}: консультация, если дома стало слишком тихо`,
			`Объясним ${pick(weirdPhenomena)}`,
			`Снятие последствий ${pick(eventNames)}`,
			`${pick(weirdNouns)} в доме? Есть решение`,
			`Диагностика странных случаев`,
			`Работаем даже после полуночи`,
			`${pick(titleEvents)} без свидетелей`,
			`${provider}: опыт более 20 лет`
		],

		trade: [
			`${cap(pick([...verbsBuy, ...verbsSell]))} ${noun}`,
			`Обмен: ${pick(tradedThings)} на ${pick(wantedThings)}`,
			`${provider}: оценка ${pick(impossibleThings)} при вас`,
			`Куплю ${pick(wantedThings)} дорого`,
			`Продам ${pick(tradedThings)} срочно`,
			`${pick(tradedThings)} в хорошие руки`,
			`Интересует ${pick(impossibleThings)}`,
			`Обмен без посредников`,
			`${provider}: честная оценка`,
			`Скупка ${pick(titleObjects)}`
		]
	};

	return pick(variants[category]);
}

function buildDescription(category) {
	const endings = [
		`${cap(pick(descConditions))}. ${pick(descWarnings)}.`,
		`${cap(pick(descPromises))}; ${pick(descConditions)}.`,
		`Ориентир: ${generatedPlace()}. ${cap(pick(contactNotes).toLowerCase())}.`,
		`Код: ${mysteryNumber()}. ${pick(descWarnings)}.`,
		`Фигурирует ${pick(weirdNouns)}.`,
		`Отмечено как ${pick(abstractThings)}.`,
		`Локация: ${generatedPlace().toLowerCase()}.`,
		`${pick(restrictions)}. ${pick(contactNotes)}.`
	];

	const middle = [
		`${pick(descActions)}: ${pick(descPromises)}`,
		`${pick(descActions)} без лишних вопросов`,
		`${pick(descPromises)} при соблюдении условий`,
		`${pick(descWarnings)}`,
		`Подробности уточняются при обращении`,
		`Есть особенности, информация предоставляется отдельно`,
		`${pick(descConditions)}`,
		`Возможны дополнительные требования`,
		`Работа ведётся аккуратно`,
		`Результат зависит от обстоятельств`,
		`Заявки рассматриваются индивидуально`,
		`Опыт подтверждён предыдущими случаями`,
		`Используются проверенные методы`,
		`${pick(eventNames)} всё ещё влияет на ситуацию`,
		`Связано с ${pick(titleObjects)}`,
	];

	const details = [
		() => `${pick(descActions)} ${mysteryTime()}`,
		() => `Номер: ${mysteryNumber()}`,
		() => `Ориентир: ${generatedPlace()}`,
		() => `Идентификатор: ${pick([...weirdNouns, ...abstractThings, ...eventNames])}`,
		() => `Последняя точка: ${generatedPlace()}`,
		() => `Связь: ${generatedProvider(category)}`,
		() => `Регистрация: ${mysteryNumber()}`,
		() => `Объект: ${pick(titleObjects)}`,
		() => `Контакт: ${pick(personNames)}`,
		() => `Маркер: ${pick(weirdAdjectives)} ${pick(weirdNouns)}`,
		() => `Контекст: ${pick(eventNames).toLowerCase()}`,
		() => `Примечание: ${pick(abstractThings)}`
	];

	const extra = chance(33)
		? ` ${pick(details)()}.`
		: '';

	return `${pick(context[category])}. ${pick(middle)}. ${pick(endings)}${extra}`;
}

function contactTelegramTab(index = activeListingIndex) {
  const targetUsername = targetTelegramUsernameFor(index);
  if (targetUsername || chance(80)) return `Telegram: @${telegramUsername(6, 20, index)}`;
  return pick(contactNotes);
}

function normalizeTelegramUsername(value) {
  const username = String(value || "").trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(username)) {
    throw new Error("Telegram username must contain 4-32 letters, digits or underscores.");
  }
  return username;
}

function makeTelegramHash(username, scrollIndex = HASH_DEFAULT_SCROLL_INDEX) {
  const safeIndex = Math.max(0, scrollIndex | 0);
  const nonce = randomSeedText().slice(0, TELEGRAM_HASH_NONCE_LENGTH);
  return formatHashState(`u:${normalizeTelegramUsername(username)}:${nonce}:${safeIndex}`, safeIndex);
}

window.gethash = function gethash(username, scrollIndex = HASH_DEFAULT_SCROLL_INDEX) {
  return makeTelegramHash(username, scrollIndex);
};

function generateListing(index = generatedCount) {
  return withRng(makeRng(initialHashState.seed, index), () => {
    const previousListingIndex = activeListingIndex;
    activeListingIndex = index;

    try {
      const category = pick(categories);
      const title = smartTitle(category);
      const org = chance(55) ? generatedProvider(category) : pick([...providerNames, ...titlePeople, ...personNames]);
      const desc = buildDescription(category);
      const meta = `${pick(metaLines)} · ${generatedPlace()} · ${pick(guarantees)}`;
      return {
        title,
        desc,
        category,
        price: generatedPrice(category),
        meta,
        urgent: chance(22),
        image: art(title),
        tabs: [phone(), `${pick(phoneTags)}: ${chance(60) ? phone() : pick(schedules)}`, contactTelegramTab(index), `${org} · ${pick(restrictions)}`]
      };
    } finally {
      activeListingIndex = previousListingIndex;
    }
  });
}


function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && /^[78]/.test(digits)) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return "";
}

function contactLink(tab) {
  const telegram = tab.match(/(?:telegram|tg)\s*:?\s*@([a-zA-Z0-9_]{4,32})|@([a-zA-Z0-9_]{4,32})/i);
  if (telegram) {
    const username = telegram[1] || telegram[2];
    return { href: `https://t.me/${username}`, label: tab, type: "telegram" };
  }

  const phoneMatch = tab.match(/(?:\+?7|8)?[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  if (phoneMatch) {
    const normalized = normalizePhone(phoneMatch[0]);
    if (normalized) return { href: `tel:${normalized}`, label: tab, type: "phone" };
  }

  return null;
}

function makeTabElement(tab) {
  const link = contactLink(tab);
  const element = document.createElement(link ? "a" : "span");
  element.className = link ? `tab tab-link tab-${link.type}` : "tab";
  element.textContent = tab;
  if (link) {
    element.href = link.href;
    if (link.type === "telegram") {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
    element.setAttribute("aria-label", link.type === "phone" ? `Позвонить: ${tab}` : `Открыть Telegram: ${tab}`);
  }
  return element;
}

function currentFilters() {
  return { term: searchInput.value.trim().toLowerCase(), category: categoryFilter.value };
}

function searchableText(item) {
  if (!item.searchText) item.searchText = [item.title, item.desc, item.meta, item.price, ...item.tabs].join(" ").toLowerCase();
  return item.searchText;
}

function matches(item, filters = currentFilters()) {
  return (filters.category === "all" || item.category === filters.category) && searchableText(item).includes(filters.term);
}

function appendCard(item, index) {
  const node = template.content.cloneNode(true);
  const article = node.querySelector(".card");
  article.dataset.index = String(index);
  article.id = `ad-${index}`;
  article.classList.toggle("is-urgent", Boolean(item.urgent));
  node.querySelector(".thumb").src = item.image;
  node.querySelector(".chip").textContent = labels[item.category] || "Объявление";
  node.querySelector(".price").textContent = item.price;
  node.querySelector("h3").textContent = item.title;
  node.querySelector(".desc").textContent = item.desc;
  node.querySelector(".meta").textContent = item.meta;
  const tabs = node.querySelector(".tabs");
  item.tabs.forEach((tab) => {
    tabs.appendChild(makeTabElement(tab));
  });
  board.appendChild(node);
  renderedCount += 1;
}

function makeBatch(size = 18, filters = currentFilters()) {
	let guard = 0;

	while (size > 0 && guard < 500) {
		const index = generatedCount;
		const item = generateListing(index);

		guard += 1;
		generatedCount += 1;

		if (!matches(item, filters)) continue;

		const fingerprint =
			`${item.category}|${item.title}|${item.price}|${item.meta}`;

		if (generatedFingerprints.has(fingerprint)) continue;

		generatedFingerprints.add(fingerprint);
		appendCard(item, index);
		size -= 1;
	}
}

let resetToken = 0;
let resetTimer = 0;

function highlightCard(card) {
  if (!card) return;
  document.querySelectorAll(".card.is-hash-target").forEach((node) => node.classList.remove("is-hash-target"));
  card.classList.add("is-hash-target");
  card.setAttribute("tabindex", "-1");
  card.focus({ preventScroll: true });
}

function scrollToInitialIndex(token) {
  const targetIndex = initialHashState.scrollIndex;
  const targetCardId = normalizeCardId(initialHashState.cardId, targetIndex);
  if (!targetIndex && targetCardId === normalizeCardId("", HASH_DEFAULT_SCROLL_INDEX)) return;

  const reachTarget = () => {
    if (token !== resetToken) return;
    const target = document.getElementById(targetCardId) || document.getElementById(`ad-${targetIndex}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => highlightCard(target), 260);
      return;
    }
    if (generatedCount <= targetIndex + 80) {
      makeBatch(Math.max(8, Math.min(60, targetIndex + 24 - renderedCount)));
      requestAnimationFrame(reachTarget);
    }
  };

  requestAnimationFrame(reachTarget);
}

function resetFeed() {
  const token = ++resetToken;
  const filters = currentFilters();
  board.replaceChildren();
  generatedFingerprints = new Set();
  renderedCount = 0;
  generatedCount = 0;
  slogan.textContent = pick(slogans);
  warning.textContent = pick(warnings);

  const pump = (remaining = 24) => {
    if (token !== resetToken || remaining <= 0) return;
    makeBatch(Math.min(6, remaining), filters);
    requestAnimationFrame(() => pump(remaining - 6));
  };

  requestAnimationFrame(() => {
    pump(Math.max(12, initialHashState.scrollIndex + 12));
    scrollToInitialIndex(token);
  });
}

function scheduleReset() {
  window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(resetFeed, 90);
}

const sentinelObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) makeBatch(12);
}, { rootMargin: "1400px 0px" });


searchInput.addEventListener("input", scheduleReset);
categoryFilter.addEventListener("change", scheduleReset);
sentinelObserver.observe(sentinel);
resetFeed();
