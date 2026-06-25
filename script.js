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
  return [...String(text)].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
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

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (percent) => Math.random() * 100 < percent;
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const phone = () => `+7 (${900 + Math.floor(Math.random() * 99)}) ${100 + Math.floor(Math.random() * 900)}-${10 + Math.floor(Math.random() * 90)}-${10 + Math.floor(Math.random() * 90)}`;

function makeClockTime() {
  const hour = String(Math.floor(Math.random() * 6) + (chance(70) ? 0 : 21)).padStart(2, "0");
  const minute = String(Math.floor(Math.random() * 60)).padStart(2, "0");
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

function markovWord(source, min = 5, max = 12) {
  const words = source.join(" ").toLowerCase().replace(/[^а-яёa-z\s-]/g, "").split(/\s+/).filter((word) => word.length > 3);
  const starts = words.map((word) => word.slice(0, 2));
  let pair = pick(starts);
  let word = pair;
  const target = min + Math.floor(Math.random() * (max - min + 1));
  while (word.length < target) {
    const next = words.flatMap((candidate) => {
      const hits = [];
      for (let index = 0; index < candidate.length - 2; index += 1) {
        if (candidate.slice(index, index + 2) === pair) hits.push(candidate[index + 2]);
      }
      return hits;
    });
    const char = next.length ? pick(next) : pick("абвгдежзиклмнопрстуфхшщыэюя".split(""));
    word += char;
    pair = word.slice(-2);
  }
  return word;
}

function generatedProvider() {
  const prefixes = ["ООО", "ИП", "Сервис", "Бюро", "Комитет", "Артель", "Лавка", "Центр"];
  return chance(45) ? `${pick(prefixes)} ${cap(markovWord(providerNames))} и ${cap(markovWord([...weirdNouns, ...titleObjects]))}` : pick(providerNames);
}

function generatedPlace() {
  const base = chance(42) ? `${pick(["у", "возле", "под", "за", "в районе"])} ${pick(weirdAdjectives)} ${pick(weirdNouns)}` : pick(places);
  return chance(35) ? `${base}, ${pick(["подъезд", "секция", "склад", "павильон"])} ${mysteryNumber()}` : base;
}

function generatedPrice(category) {
  if (category === "lost") return chance(45) ? pick(rewardTypes) : `${mysteryNumber()} ₽ нашедшему`;
  if (chance(55)) return `${pick(["от", "до", "ровно", "почти"])} ${Math.floor(2 + Math.random() * 88) * 100} ₽ ${pick(["", "за мешок", "за визит", "и тишина", "без сдачи"] )}`.trim();
  return pick(pricePhrases);
}

function smartTitle(category) {
  const noun = pick([...titleObjects, ...wantedThings, ...tradedThings, ...impossibleThings, `${pick(weirdAdjectives)} ${markovWord([...weirdNouns, ...titleObjects])}`]);
  const variants = {
    service: [`${pick([...verbsRepair, ...verbsRemove, ...verbsInstall])} ${noun} ${generatedPlace()}`, `${generatedProvider()}: ${pick(weirdProcesses)}`],
    lost: [`Пропал ${pick(lostThings)} ${generatedPlace()}`, `Нашли ${pick(weirdAdjectives)} ${pick(weirdNouns)}. Это ваше?`],
    medical: [`${pick(personNames)} — ${pick(clinicMethods)}`, `${pick(titleActions)} ${pick(bodyParts)} без очереди`],
    food: [`Домашнее МЯСО и ${pick(abstractThings)}`, `${pick(verbsSell)} ${pick(weirdAdjectives)} обед ${mysteryTime()}`],
    mystic: [`${pick(eventNames)}: ${pick(titleEvents)}`, `${cap(pick(weirdPhenomena))} — срочный выезд`],
    trade: [`${pick([...verbsBuy, ...verbsSell])} ${noun}`, `Обмен: ${pick(tradedThings)} на ${pick(wantedThings)}`]
  };
  return pick(variants[category]);
}

function generateListing() {
  const category = pick(categories);
  const title = smartTitle(category);
  const org = chance(55) ? generatedProvider() : pick([...providerNames, ...titlePeople, ...personNames]);
  const desc = `${cap(pick(descActions))} ${mysteryTime()}: ${pick(descPromises)}. ${cap(pick(descConditions))}. ${pick(descWarnings)}. Код ${mysteryNumber()}.`;
  const meta = `${pick(metaLines)} · ${generatedPlace()} · ${pick(guarantees)}`;
  return { title, desc, category, price: generatedPrice(category), meta, image: art(title), tabs: [phone(), `${pick(phoneTags)}: ${chance(60) ? phone() : pick(schedules)}`, chance(38) ? `Telegram: @${markovWord([...providerNames, ...weirdNouns], 6, 10)}${Math.floor(Math.random() * 90)}` : pick(contactNotes), `${org} · ${pick(restrictions)}`] };
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

function matches(item) {
  const term = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  return (category === "all" || item.category === category) && [item.title, item.desc, item.meta, item.price].join(" ").toLowerCase().includes(term);
}

function appendCard(item) {
  const node = template.content.cloneNode(true);
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

function makeBatch(size = 18) {
	let guard = 0;

	while (size > 0 && guard < 500) {
		const item = generateListing();

		guard += 1;
		generatedCount += 1;

		if (!matches(item)) continue;

		const fingerprint =
			`${item.category}|${item.title}|${item.price}|${item.meta}`;

		if (generatedFingerprints.has(fingerprint)) continue;

		generatedFingerprints.add(fingerprint);
		appendCard(item);
		size -= 1;
	}
}

function resetFeed() {
  board.innerHTML = "";
  generatedFingerprints = new Set();
  renderedCount = 0;
  generatedCount = 0;
  slogan.textContent = pick(slogans);
  warning.textContent = pick(warnings);
  makeBatch(24);
}

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) makeBatch(18);
}, { rootMargin: "1400px 0px" });

searchInput.addEventListener("input", resetFeed);
categoryFilter.addEventListener("change", resetFeed);
observer.observe(sentinel);
resetFeed();
