"use server";

import { initDb, saveDb } from "@/lib/db";
import { scrapeDate } from "@/lib/scraper";

// ─── Scrape & Store ──────────────────────────────────────

export async function scrapeAndStore(broadcastType: string, dateStr: string) {
  const data = await scrapeDate(broadcastType, dateStr);
  if (data.channels.length === 0) {
    return { ok: false, error: "No data from bangumi.org" };
  }

  const db = await initDb();

  // Upsert channels
  const channelIdMap: Record<number, number> = {};
  for (const ch of data.channels) {
    const rows = db.exec(
      "SELECT id FROM channels WHERE broadcast_type = ? AND channel_name = ? AND channel_number = ?",
      [broadcastType, ch.name, ch.number]
    );
    if (rows.length > 0 && rows[0].values.length > 0) {
      channelIdMap[ch.index] = rows[0].values[0][0] as number;
    } else {
      db.run(
        "INSERT INTO channels (broadcast_type, channel_name, channel_number, sort_order) VALUES (?, ?, ?, ?)",
        [broadcastType, ch.name, ch.number, ch.index]
      );
      const idRows = db.exec("SELECT last_insert_rowid()");
      channelIdMap[ch.index] = idRows[0].values[0][0] as number;
    }
  }

  // Delete existing programs for this date and channels
  const channelIds = Object.values(channelIdMap);
  if (channelIds.length > 0) {
    const placeholders = channelIds.map(() => "?").join(",");
    db.run(
      `DELETE FROM programs WHERE broadcast_date = ? AND channel_id IN (${placeholders})`,
      [dateStr, ...channelIds]
    );
  }

  // Insert programs
  let count = 0;
  for (const [chIdxStr, progs] of Object.entries(data.programs)) {
    const chIdx = Number(chIdxStr);
    const channelId = channelIdMap[chIdx];
    if (!channelId) continue;
    for (const p of progs) {
      db.run(
        "INSERT INTO programs (channel_id, broadcast_date, start_time, end_time, title, description, detail_url, genre, pid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [channelId, dateStr, p.startTime, p.endTime, p.title, p.description, p.detailUrl, p.genre, p.pid]
      );
      count++;
    }
  }

  saveDb();
  return { ok: true, channels: data.channels.length, programs: count };
}

// ─── Read Data ───────────────────────────────────────────

export interface ChannelRow {
  id: number;
  broadcastType: string;
  channelName: string;
  channelNumber: string;
  sortOrder: number;
  visible: number;
  isFavorite: number;
}

export interface ProgramRow {
  id: number;
  channelId: number;
  broadcastDate: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string | null;
  detailUrl: string | null;
  genre: string | null;
  pid: string | null;
  channelName?: string;
  channelNumber?: string;
  broadcastType?: string;
}

function rowToChannel(row: unknown[]): ChannelRow {
  return {
    id: row[0] as number,
    broadcastType: row[1] as string,
    channelName: row[2] as string,
    channelNumber: row[3] as string,
    sortOrder: row[4] as number,
    visible: row[5] as number,
    isFavorite: row[6] as number,
  };
}

function rowToProgram(row: unknown[]): ProgramRow {
  return {
    id: row[0] as number,
    channelId: row[1] as number,
    broadcastDate: row[2] as string,
    startTime: row[3] as string,
    endTime: row[4] as string | null,
    title: row[5] as string,
    description: row[6] as string | null,
    detailUrl: row[7] as string | null,
    genre: row[8] as string | null,
    pid: row[9] as string | null,
    channelName: row[10] as string | undefined,
    channelNumber: row[11] as string | undefined,
    broadcastType: row[12] as string | undefined,
  };
}

export async function getChannels(broadcastType?: string, favoritesOnly = false): Promise<ChannelRow[]> {
  const db = await initDb();
  let query = "SELECT * FROM channels WHERE visible = 1";
  const params: (string | number)[] = [];

  if (broadcastType) {
    query += " AND broadcast_type = ?";
    params.push(broadcastType);
  }
  if (favoritesOnly) {
    query += " AND is_favorite = 1";
  }
  query += " ORDER BY sort_order, id";

  const results = db.exec(query, params);
  if (results.length === 0) return [];
  return results[0].values.map(rowToChannel);
}

export async function getPrograms(
  channelIds: number[],
  date: string,
  genre?: string,
  keyword?: string
): Promise<ProgramRow[]> {
  if (channelIds.length === 0) return [];
  const db = await initDb();
  const placeholders = channelIds.map(() => "?").join(",");
  let query = `
    SELECT p.*, c.channel_name, c.channel_number, c.broadcast_type
    FROM programs p
    JOIN channels c ON p.channel_id = c.id
    WHERE p.broadcast_date = ? AND p.channel_id IN (${placeholders})
  `;
  const params: (string | number)[] = [date, ...channelIds];

  if (genre) {
    query += " AND p.genre = ?";
    params.push(genre);
  }
  if (keyword) {
    query += " AND (p.title LIKE ? OR p.description LIKE ?)";
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  query += " ORDER BY p.start_time";

  const results = db.exec(query, params);
  if (results.length === 0) return [];
  return results[0].values.map(rowToProgram);
}

export async function getProgramsByType(
  broadcastType: string,
  date: string,
  genre?: string
): Promise<{ channels: ChannelRow[]; programs: Record<string, ProgramRow[]> }> {
  const chs = await getChannels(broadcastType);
  if (chs.length === 0) return { channels: [], programs: {} };

  const channelIds = chs.map((c) => c.id);
  const progs = await getPrograms(channelIds, date, genre);

  const byChannel: Record<string, ProgramRow[]> = {};
  for (const p of progs) {
    const key = String(p.channelId);
    if (!byChannel[key]) byChannel[key] = [];
    byChannel[key].push(p);
  }
  return { channels: chs, programs: byChannel };
}

export async function getFavoriteChannelPrograms(
  date: string,
  genre?: string
): Promise<{ channels: ChannelRow[]; programs: Record<string, ProgramRow[]> }> {
  const chs = await getChannels(undefined, true);
  if (chs.length === 0) return { channels: [], programs: {} };

  const channelIds = chs.map((c) => c.id);
  const progs = await getPrograms(channelIds, date, genre);

  const byChannel: Record<string, ProgramRow[]> = {};
  for (const p of progs) {
    const key = String(p.channelId);
    if (!byChannel[key]) byChannel[key] = [];
    byChannel[key].push(p);
  }
  return { channels: chs, programs: byChannel };
}

export async function toggleFavorite(channelId: number): Promise<boolean> {
  const db = await initDb();
  const rows = db.exec("SELECT is_favorite FROM channels WHERE id = ?", [channelId]);
  if (rows.length === 0 || rows[0].values.length === 0) return false;
  const current = rows[0].values[0][0] as number;
  const newVal = current ? 0 : 1;
  db.run("UPDATE channels SET is_favorite = ? WHERE id = ?", [newVal, channelId]);
  saveDb();
  return newVal === 1;
}

export async function searchPrograms(keyword: string, date: string, broadcastType?: string): Promise<ProgramRow[]> {
  const chs = await getChannels(broadcastType);
  const channelIds = chs.map((c) => c.id);
  return getPrograms(channelIds, date, undefined, keyword);
}

export async function getDates(): Promise<{ date: string; label: string; weekday: string; isToday: boolean }[]> {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const now = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push({
      date: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`,
      label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
      weekday: weekdays[d.getDay()],
      isToday: i === 0,
    });
  }
  return dates;
}

export async function reorderFavoriteChannels(channelIds: number[]) {
  const db = await initDb();
  channelIds.forEach((id, i) => {
    db.run("UPDATE channels SET sort_order = ? WHERE id = ?", [i, id]);
  });
  saveDb();
}
