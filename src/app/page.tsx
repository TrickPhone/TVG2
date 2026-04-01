"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  scrapeAndStore,
  scrapeToday,
  getProgramsByType,
  getFavoriteChannelPrograms,
  getDates,
  searchPrograms as searchProgsAction,
  reorderFavoriteChannels,
  toggleFavorite,
  type ChannelRow,
  type ProgramRow,
} from "@/lib/actions";

// ─── Types & Constants ───────────────────────────────────

const BROADCAST_TABS = [
  { key: "my", label: "Myチャンネル" },
  { key: "td", label: "地上波" },
  { key: "bs", label: "BS" },
  { key: "cs", label: "CS" },
] as const;

type TabKey = (typeof BROADCAST_TABS)[number]["key"];

type DateInfo = { date: string; label: string; weekday: string; isToday: boolean };

const GENRE_COLORS: Record<string, string> = {
  ニュース: "bg-blue-600/30 text-blue-300 border-blue-500/40",
  報道: "bg-blue-600/30 text-blue-300 border-blue-500/40",
  スポーツ: "bg-green-600/30 text-green-300 border-green-500/40",
  ドラマ: "bg-pink-600/30 text-pink-300 border-pink-500/40",
  映画: "bg-purple-600/30 text-purple-300 border-purple-500/40",
  アニメ: "bg-orange-600/30 text-orange-300 border-orange-500/40",
  バラエティ: "bg-cyan-600/30 text-cyan-300 border-cyan-500/40",
  ドキュメンタリー: "bg-teal-600/30 text-teal-300 border-teal-500/40",
  情報: "bg-sky-600/30 text-sky-300 border-sky-500/40",
  趣味: "bg-lime-600/30 text-lime-300 border-lime-500/40",
};

function GenreBadge({ genre }: { genre: string }) {
  if (!genre) return null;
  const color = GENRE_COLORS[genre] || "bg-gray-600/30 text-gray-300 border-gray-500/40";
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`}>{genre}</span>;
}

// ─── Standard tab card ───────────────────────────────────

function ProgramCard({ program }: { program: ProgramRow }) {
  return (
    <a
      href={program.detailUrl || "#"}
      target="_blank"
      rel="noopener noreferrer"
      data-start-time={program.startTime}
      className="block p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/60
                 border border-gray-700/50 hover:border-gray-600/60
                 transition-all duration-150 group"
    >
      <div className="flex items-start gap-2">
        <span className="text-base text-gray-500 font-mono mt-0.5 shrink-0 w-11">
          {program.startTime}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <GenreBadge genre={program.genre || ""} />
          </div>
          <p className="text-lg font-medium text-gray-200 group-hover:text-white leading-snug line-clamp-2">
            {program.title}
          </p>
          {program.description && (
            <p className="text-base text-gray-500 mt-1 line-clamp-2 leading-relaxed">
              {program.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

function scrollToCurrentTime() {
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const cards = document.querySelectorAll<HTMLElement>("[data-start-time]");
  if (cards.length === 0) return;
  let target: HTMLElement | null = null;
  for (const card of cards) {
    const t = card.getAttribute("data-start-time") || "";
    if (t >= nowStr) { target = card; break; }
  }
  if (!target) target = cards[cards.length - 1] as HTMLElement;
  target.scrollIntoView({ block: "center", behavior: "instant" });
}

function ChannelColumn({ channel, programs }: { channel: ChannelRow; programs: ProgramRow[] }) {
  return (
    <div className="min-w-[340px] max-w-[420px] flex-shrink-0">
      <div className="sticky top-14 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-700/50 px-3 py-2 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-base text-gray-500 font-mono">{channel.channelNumber}</span>
          <span className="text-lg font-medium text-gray-200 truncate">{channel.channelName}</span>
        </div>
      </div>
      <div className="space-y-1 p-1.5">
        {programs.map((prog) => (
          <ProgramCard key={prog.id} program={prog} />
        ))}
        {programs.length === 0 && (
          <p className="text-base text-gray-600 text-center py-8">番組データなし</p>
        )}
      </div>
    </div>
  );
}

// ─── Myチャンネル EPG Grid ───────────────────────────────

const PX_PER_MIN = 3;

function getTimeMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const hour = h < 4 ? h + 24 : h;
  return hour * 60 + m;
}

const DAY_START = 4 * 60;
const DAY_END = 28 * 60;
const TOTAL_HEIGHT = (DAY_END - DAY_START) * PX_PER_MIN;

const HOUR_MARKS = Array.from({ length: 24 }, (_, i) => {
  const hour = (i + 4) % 24;
  return { hour, top: i * 60 * PX_PER_MIN };
});

function FixedScrollbar({
  scrollRef,
  headerRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  headerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const main = scrollRef.current;
    const bar = barRef.current;
    const inner = innerRef.current;
    const header = headerRef?.current;
    if (!main || !bar || !inner) return;

    const sync = () => { inner.style.width = `${main.scrollWidth}px`; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(main);

    const onMainScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      bar.scrollLeft = main.scrollLeft;
      if (header) header.scrollLeft = main.scrollLeft;
      syncing.current = false;
    };
    const onBarScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      main.scrollLeft = bar.scrollLeft;
      if (header) header.scrollLeft = bar.scrollLeft;
      syncing.current = false;
    };
    main.addEventListener("scroll", onMainScroll);
    bar.addEventListener("scroll", onBarScroll);
    return () => {
      ro.disconnect();
      main.removeEventListener("scroll", onMainScroll);
      bar.removeEventListener("scroll", onBarScroll);
    };
  }, [scrollRef, headerRef]);

  return (
    <div ref={barRef} className="epg-scrollbar-fixed">
      <div ref={innerRef} style={{ height: 1 }} />
    </div>
  );
}

function MyChannelGrid({
  channels,
  programs,
  onReorderChannels,
}: {
  channels: ChannelRow[];
  programs: Record<string, ProgramRow[]>;
  onReorderChannels: (ids: number[]) => void;
}) {
  const [orderedChannels, setOrderedChannels] = useState(channels);
  const dragChannelIdx = useRef<number | null>(null);
  const dragOverChannelIdx = useRef<number | null>(null);

  useEffect(() => { setOrderedChannels(channels); }, [channels]);

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const mins = (h < 4 ? h + 24 : h) * 60 + m;
    const top = (mins - DAY_START) * PX_PER_MIN - 200;
    window.scrollTo({ top: Math.max(0, top + 180), behavior: "instant" });
  }, []);

  const handleDragStart = (idx: number) => { dragChannelIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); dragOverChannelIdx.current = idx; };
  const handleDrop = () => {
    if (dragChannelIdx.current === null || dragOverChannelIdx.current === null) return;
    if (dragChannelIdx.current === dragOverChannelIdx.current) return;
    const newOrder = [...orderedChannels];
    const [dragged] = newOrder.splice(dragChannelIdx.current, 1);
    newOrder.splice(dragOverChannelIdx.current, 0, dragged);
    setOrderedChannels(newOrder);
    onReorderChannels(newOrder.map((c) => c.id));
    dragChannelIdx.current = null;
    dragOverChannelIdx.current = null;
  };

  if (orderedChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-6xl">📺</p>
        <p className="text-gray-400 text-lg">Myチャンネルが未設定です</p>
        <p className="text-gray-600 text-base">設定画面でチャンネルを ⭐ お気に入りに追加してください</p>
        <a href="/settings" className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-lg rounded-lg transition-colors">設定画面へ</a>
      </div>
    );
  }

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const syncScroll = useCallback((source: "header" | "body") => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const from = source === "header" ? headerScrollRef.current : bodyScrollRef.current;
    const to = source === "header" ? bodyScrollRef.current : headerScrollRef.current;
    if (from && to) to.scrollLeft = from.scrollLeft;
    syncingRef.current = false;
  }, []);

  return (
    <div className="epg-wrapper">
      <div className="sticky top-14 z-30 flex bg-gray-900 border-b border-gray-600/50">
        <div className="shrink-0 w-[50px] bg-gray-900 border-r border-gray-600/50 flex items-center justify-center h-12">
          <span className="text-lg text-gray-500">時刻</span>
        </div>
        <div className="flex-1 min-w-0 overflow-x-hidden" ref={headerScrollRef} onScroll={() => syncScroll("header")}>
          <div className="flex min-w-max">
            {orderedChannels.map((ch, chIdx) => (
              <div
                key={ch.id}
                draggable
                onDragStart={() => handleDragStart(chIdx)}
                onDragOver={(e) => handleDragOver(e, chIdx)}
                onDrop={handleDrop}
                onDragEnd={() => { dragChannelIdx.current = null; dragOverChannelIdx.current = null; }}
                className="w-[260px] shrink-0 h-12 border-r border-blue-700/40 bg-blue-900/80 hover:bg-blue-800/80 px-2 flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition-colors select-none"
              >
                <span className="text-blue-400/60 text-base">⠿</span>
                <span className="text-lg text-blue-300/70 font-mono">{ch.channelNumber}</span>
                <span className="text-base font-medium text-blue-100 truncate">{ch.channelName}</span>
                <span className={`ml-auto text-base px-1 py-0.5 rounded shrink-0 ${
                  ch.broadcastType === "td" ? "bg-blue-700/50 text-blue-300"
                    : ch.broadcastType === "bs" ? "bg-green-800/50 text-green-300"
                    : "bg-purple-800/50 text-purple-300"
                }`}>
                  {ch.broadcastType === "td" ? "地上" : ch.broadcastType.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="epg-body flex">
        <div className="sticky left-0 z-20 bg-gray-950 shrink-0 w-[50px] border-r border-gray-600/50">
          <div className="relative" style={{ height: TOTAL_HEIGHT }}>
            {HOUR_MARKS.map(({ hour, top }) => {
              const isPrime = hour >= 19 && hour <= 23;
              return (
                <div key={hour} className={`absolute left-0 right-0 border-t border-gray-700/60 ${isPrime ? "bg-indigo-950/20" : ""}`} style={{ top, height: 60 * PX_PER_MIN }}>
                  <div className="flex items-baseline justify-center pt-1 gap-0.5">
                    <span className={`text-xl font-bold tabular-nums leading-none ${isPrime ? "text-amber-300" : hour >= 6 && hour <= 18 ? "text-sky-300" : "text-gray-500"}`}>{hour}</span>
                    <span className="text-lg text-gray-600">:00</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-x-scroll epg-body-scroll" ref={bodyScrollRef} onScroll={() => syncScroll("body")}>
          <div className="flex min-w-max">
            {orderedChannels.map((ch) => {
              const chProgs = programs[String(ch.id)] || [];
              return (
                <div key={ch.id} className="w-[260px] shrink-0 border-r border-gray-700/40">
                  <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                    {HOUR_MARKS.map(({ hour, top }) => (
                      <div key={hour} className={`absolute left-0 right-0 border-t border-gray-800/50 ${hour >= 19 && hour <= 23 ? "bg-indigo-950/10" : ""}`} style={{ top, height: 60 * PX_PER_MIN }} />
                    ))}
                    {chProgs.map((prog) => {
                      const startMin = getTimeMinutes(prog.startTime);
                      const endMin = prog.endTime ? getTimeMinutes(prog.endTime) : startMin + 30;
                      const topPx = (startMin - DAY_START) * PX_PER_MIN;
                      const heightPx = Math.max((endMin - startMin) * PX_PER_MIN, 24);
                      const mm = prog.startTime.split(":")[1];
                      return (
                        <a
                          key={prog.id}
                          href={prog.detailUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute left-0 right-0 border-b border-gray-700/40 bg-gray-800/90 hover:bg-gray-700/90 overflow-hidden transition-colors group"
                          style={{ top: topPx, height: heightPx }}
                        >
                          <div className="px-1.5 py-0.5 h-full flex gap-1">
                            <span className="text-sm font-bold text-blue-300 shrink-0 leading-tight w-[2ch] text-right">{mm}</span>
                            <div className="min-w-0 flex-1">
                              <GenreBadge genre={prog.genre || ""} />
                              <p className="text-base font-medium text-gray-200 group-hover:text-white leading-tight line-clamp-3 mt-0.5">{prog.title}</p>
                              {heightPx > 90 && prog.description && (
                                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2 leading-tight">{prog.description}</p>
                              )}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <FixedScrollbar scrollRef={bodyScrollRef} headerRef={headerScrollRef} />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("td");
  const [dates, setDates] = useState<DateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [chs, setChs] = useState<ChannelRow[]>([]);
  const [progs, setProgs] = useState<Record<string, ProgramRow[]>>({});
  const [myChs, setMyChs] = useState<ChannelRow[]>([]);
  const [myProgs, setMyProgs] = useState<Record<string, ProgramRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<ProgramRow[] | null>(null);
  const [genreFilter, setGenreFilter] = useState("");
  const [needsScroll, setNeedsScroll] = useState(false);
  const initialLoadDone = useRef(false);

  // Load dates
  useEffect(() => {
    getDates().then((d) => {
      setDates(d);
      if (d.length > 0) setSelectedDate(d[0].date);
    });
  }, []);

  // My channels
  const loadMyChannels = useCallback(async () => {
    if (!selectedDate) return;
    try {
      const data = await getFavoriteChannelPrograms(selectedDate, genreFilter || undefined);
      setMyChs(data.channels);
      setMyProgs(data.programs);
    } catch (e) { console.error("Failed to fetch my channels:", e); }
  }, [selectedDate, genreFilter]);

  useEffect(() => {
    if (activeTab === "my" && selectedDate) {
      setLoading(true);
      loadMyChannels().finally(() => setLoading(false));
    }
  }, [activeTab, selectedDate, loadMyChannels]);

  // Standard tabs with auto-scrape
  const loadPrograms = useCallback(async () => {
    if (!selectedDate || activeTab === "my") return;
    setLoading(true);
    setSearchResults(null);
    try {
      const data = await getProgramsByType(activeTab, selectedDate, genreFilter || undefined);
      const totalProgs = Object.values(data.programs).flat().length;
      const today = todayStr();

      if (totalProgs === 0 && selectedDate === today && !initialLoadDone.current) {
        initialLoadDone.current = true;
        setScraping(true);
        try {
          await Promise.all([
            scrapeAndStore("td", today),
            scrapeAndStore("bs", today),
            scrapeAndStore("cs", today),
          ]);
          const fresh = await getProgramsByType(activeTab, selectedDate, genreFilter || undefined);
          setChs(fresh.channels);
          setProgs(fresh.programs);
          setNeedsScroll(true);
        } finally { setScraping(false); }
      } else {
        setChs(data.channels);
        setProgs(data.programs);
        if (totalProgs > 0 && selectedDate === today && !initialLoadDone.current) {
          initialLoadDone.current = true;
          setNeedsScroll(true);
        }
      }
    } catch (e) { console.error("Failed to fetch programs:", e); }
    finally { setLoading(false); }
  }, [activeTab, selectedDate, genreFilter]);

  useEffect(() => {
    if (activeTab !== "my") loadPrograms();
  }, [loadPrograms, activeTab]);

  // Scroll to current time
  useEffect(() => {
    if (needsScroll && !loading) {
      requestAnimationFrame(() => scrollToCurrentTime());
      setNeedsScroll(false);
    }
  }, [needsScroll, loading]);

  const handleSearch = async () => {
    if (!searchKeyword.trim()) { setSearchResults(null); return; }
    setLoading(true);
    try {
      const bt = activeTab === "my" ? undefined : activeTab;
      const results = await searchProgsAction(searchKeyword, selectedDate, bt);
      setSearchResults(results);
    } finally { setLoading(false); }
  };

  const handleScrape = async (type?: string) => {
    setScraping(true);
    try {
      if (type) await scrapeAndStore(type, selectedDate);
      else {
        await Promise.all([
          scrapeAndStore("td", selectedDate),
          scrapeAndStore("bs", selectedDate),
          scrapeAndStore("cs", selectedDate),
        ]);
      }
      if (activeTab === "my") await loadMyChannels();
      else await loadPrograms();
    } finally { setScraping(false); }
  };

  const allGenres = [...new Set(
    Object.values(activeTab === "my" ? myProgs : progs).flat().map((p) => p.genre).filter(Boolean) as string[]
  )].sort();

  return (
    <div className="max-w-[1800px] mx-auto px-4 py-4">
      {/* Nav header + Controls — sticky */}
      <div className="sticky top-0 z-20 bg-[var(--background)] pb-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-400">TVG</span>
          <span className="text-gray-500">番組表</span>
        </div>
        <div className="flex gap-4 text-gray-400">
          <span className="text-gray-200">番組表</span>
          <a href="/settings" className="hover:text-gray-200 transition-colors">設定</a>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-gray-800 rounded-lg p-0.5">
          {BROADCAST_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`px-4 py-1.5 text-lg rounded-md transition-all ${
                activeTab === tab.key
                  ? tab.key === "my" ? "bg-amber-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.key === "my" && "★ "}{tab.label}
              {tab.key === "my" && myChs.length > 0 && <span className="ml-1 text-base opacity-70">({myChs.length})</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5 overflow-x-auto">
          {dates.map((d) => (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              className={`px-3 py-1.5 text-base rounded-md transition-all whitespace-nowrap ${
                selectedDate === d.date ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>{d.label}</span>
              <span className={`ml-1 ${d.weekday === "土" ? "text-blue-300" : d.weekday === "日" ? "text-red-300" : ""}`}>({d.weekday})</span>
              {d.isToday && <span className="ml-1 text-lg text-yellow-400">今日</span>}
            </button>
          ))}
        </div>

        {allGenres.length > 0 && (
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="bg-gray-800 text-gray-300 text-lg rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">全ジャンル</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        {activeTab !== "my" && (
          <div className="flex gap-1">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="番組検索..."
              className="bg-gray-800 text-gray-200 text-lg rounded-lg px-3 py-1.5 w-48 border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-600"
            />
            <button onClick={handleSearch} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-lg rounded-lg transition-colors">検索</button>
            {searchResults && (
              <button onClick={() => { setSearchResults(null); setSearchKeyword(""); }} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-lg rounded-lg text-gray-400 transition-colors">クリア</button>
            )}
          </div>
        )}

        {activeTab !== "my" && (
          <button
            onClick={() => handleScrape(activeTab)}
            disabled={scraping}
            className="ml-auto px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-lg rounded-lg text-gray-400 border border-gray-700 transition-colors disabled:opacity-50"
          >
            {scraping ? "取得中..." : "📡 データ更新"}
          </button>
        )}
      </div>
      </div>{/* end sticky nav+controls */}

      {/* Search results */}
      {searchResults && activeTab !== "my" && (
        <div className="mb-6">
          <h2 className="text-lg text-gray-400 mb-3">「{searchKeyword}」の検索結果: {searchResults.length}件</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {searchResults.map((prog) => (
              <div key={prog.id} className="relative">
                <span className="absolute top-2 right-2 text-lg text-gray-500">{prog.channelName}</span>
                <ProgramCard program={prog} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Channel grid */}
      {activeTab === "my" && !searchResults && (
        loading ? (
          <div className="flex items-center justify-center py-20"><div className="text-gray-500 text-lg">読み込み中...</div></div>
        ) : (
          <MyChannelGrid channels={myChs} programs={myProgs} onReorderChannels={reorderFavoriteChannels} />
        )
      )}

      {/* Standard program grid */}
      {activeTab !== "my" && !searchResults && (
        <>
          {loading || scraping ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-gray-500 text-lg">{scraping ? "📡 番組データを取得中..." : "読み込み中..."}</div>
            </div>
          ) : chs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-gray-500">番組データがありません。データを取得してください。</p>
              <button onClick={() => handleScrape(activeTab)} disabled={scraping} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50">
                {scraping ? "取得中..." : `${BROADCAST_TABS.find((t) => t.key === activeTab)?.label}のデータを取得`}
              </button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-4">
              {chs.map((ch) => (
                <ChannelColumn key={ch.id} channel={ch} programs={progs[String(ch.id)] || []} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
