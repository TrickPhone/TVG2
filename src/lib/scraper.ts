import * as cheerio from "cheerio";

const BASE_URL = "https://bangumi.org/epg";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

const URL_PATTERNS: Record<string, string> = {
  td: `${BASE_URL}/td?broad_cast_date={date}&ggm_group_id=45`,
  bs: `${BASE_URL}/bs?broad_cast_date={date}`,
  cs: `${BASE_URL}/cs?broad_cast_date={date}`,
};

const GENRE_MAP: Record<string, string> = {
  "gc-news": "ニュース",
  "gc-sports": "スポーツ",
  "gc-info": "情報",
  "gc-drama": "ドラマ",
  "gc-variety": "バラエティ",
  "gc-movie": "映画",
  "gc-anime": "アニメ",
  "gc-document": "ドキュメンタリー",
  "gc-theater": "劇場",
  "gc-hobby": "趣味",
  "gc-welfare": "福祉",
  "gc-other": "その他",
};

const NEWS_KEYWORDS = [
  "ニュース", "NEWS", "news", "報道", "ニュースーン",
  "ニュースウオッチ", "ニュース7", "おはよう日本",
  "首都圏ネットワーク", "ニュース845", "時論公論",
  "クローズアップ現代", "NHKジャーナル",
  "news zero", "NEWS23", "news23",
  "報道ステーション", "報ステ",
  "Live News", "FNN", "ワールドニュース",
  "深層NEWS", "情報ライブ",
  "ニュースウォッチ", "ウェークアップ",
];

const HOUDOU_KEYWORDS = [
  "ドキュランド", "ETV特集", "NHKスペシャル",
  "プロフェッショナル", "映像の世紀",
  "ガイアの夜明け", "カンブリア宮殿",
  "情熱大陸", "プロジェクトX",
  "クローズアップ現代",
];

function correctGenre(genre: string, title: string): string {
  for (const kw of HOUDOU_KEYWORDS) {
    if (title.includes(kw)) return "報道";
  }
  for (const kw of NEWS_KEYWORDS) {
    if (title.includes(kw)) return "ニュース";
  }
  return genre;
}

function extractGenre(classes: string[]): string {
  for (const cls of classes) {
    if (GENRE_MAP[cls]) return GENRE_MAP[cls];
  }
  return "";
}

function epochToTime(epoch: string): string {
  if (epoch.length >= 12) {
    return `${epoch.slice(8, 10)}:${epoch.slice(10, 12)}`;
  }
  return "";
}

export interface ScrapedChannel {
  name: string;
  number: string;
  index: number;
}

export interface ScrapedProgram {
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  detailUrl: string;
  genre: string;
  pid: string;
}

export interface ScrapeResult {
  channels: ScrapedChannel[];
  programs: Record<number, ScrapedProgram[]>;
  date: string;
  broadcastType: string;
}

async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        console.warn(`Attempt ${attempt + 1} failed for ${url}: ${res.status}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return await res.text();
    } catch (e) {
      console.warn(`Attempt ${attempt + 1} failed for ${url}:`, e);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

export function parseEpgPage(html: string): { channels: ScrapedChannel[]; programs: Record<number, ScrapedProgram[]> } {
  const $ = cheerio.load(html);
  const result: { channels: ScrapedChannel[]; programs: Record<number, ScrapedProgram[]> } = {
    channels: [],
    programs: {},
  };

  const epg = $("section.si_epg");
  if (epg.length === 0) return result;

  const mainDivs = epg.children("div");
  if (mainDivs.length < 2) return result;

  const grid = mainDivs.eq(1);
  const colDivs = grid.children("div");

  // Extract channel names from column 0
  if (colDivs.length > 0) {
    colDivs.eq(0).find("li.js_channel").each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;
      const match = text.match(/^(\d+)\s+(.+?)\.{0,2}$/);
      const number = match ? match[1] : "";
      const name = match ? match[2].trim() : text;
      result.channels.push({ name, number, index: result.channels.length });
    });
  }

  // Collect program ULs — skip colDivs that contain channel list or time column
  // Program ULs contain LIs with "s" (start epoch) attribute
  const allUls: cheerio.Cheerio<cheerio.Element>[] = [];
  colDivs.each((_, el) => {
    $(el).children("ul").each((_, ul) => {
      // Check if this UL contains program data (LIs with "s" attribute)
      const firstLi = $(ul).children("li").first();
      if (firstLi.attr("s") !== undefined) {
        allUls.push($(ul));
      }
    });
  });

  allUls.forEach((ul, chIdx) => {
    const progs: ScrapedProgram[] = [];
    ul.children("li").each((_, li) => {
      const $li = $(li);
      const startEpoch = $li.attr("s") || "";
      const endEpoch = $li.attr("e") || "";
      const pid = $li.attr("pid") || "";

      const startTime = epochToTime(startEpoch);
      const endTime = epochToTime(endEpoch);

      const timeDiv = $li.find(".program_time").first();
      const classes = (timeDiv.attr("class") || "").split(/\s+/);
      let genre = extractGenre(classes);

      const title = $li.find(".program_title").first().text().trim();
      const description = $li.find(".program_detail").first().text().trim();
      const href = $li.find("a.title_link").first().attr("href") || "";
      const detailUrl = href.startsWith("/") ? `https://bangumi.org${href}` : href;

      if (title) {
        genre = correctGenre(genre, title);
        progs.push({ startTime, endTime, title, description, detailUrl, genre, pid });
      }
    });
    result.programs[chIdx] = progs;
  });

  return result;
}

export async function scrapeDate(broadcastType: string, dateStr: string): Promise<ScrapeResult> {
  const url = URL_PATTERNS[broadcastType].replace("{date}", dateStr);
  const html = await fetchHtml(url);
  if (!html) {
    return { channels: [], programs: {}, date: dateStr, broadcastType };
  }
  const data = parseEpgPage(html);
  return { ...data, date: dateStr, broadcastType };
}
