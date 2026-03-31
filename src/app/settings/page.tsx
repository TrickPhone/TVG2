"use client";

import { useState, useEffect } from "react";
import { getChannels, toggleFavorite, type ChannelRow } from "@/lib/actions";

const BROADCAST_TYPES = [
  { key: "td", label: "地上波" },
  { key: "bs", label: "BS" },
  { key: "cs", label: "CS" },
];

export default function SettingsPage() {
  const [activeType, setActiveType] = useState("td");
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChannels = async () => {
    setLoading(true);
    try {
      const chs = await getChannels(activeType);
      setChannels(chs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [activeType]);

  const handleToggleFavorite = async (channelId: number) => {
    const isFav = await toggleFavorite(channelId);
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId ? { ...ch, isFavorite: isFav ? 1 : 0 } : ch
      )
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-400">TVG</span>
          <span className="text-gray-500">設定</span>
        </div>
        <div className="flex gap-4 text-gray-400">
          <a href="/" className="hover:text-gray-200 transition-colors">番組表</a>
          <span className="text-gray-200">設定</span>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-medium text-gray-200 mb-3">チャンネル設定</h2>
        <p className="text-gray-500 mb-4">⭐ をクリックしてMyチャンネルに追加</p>

        <div className="flex gap-2 mb-4">
          {BROADCAST_TYPES.map((bt) => (
            <button
              key={bt.key}
              onClick={() => setActiveType(bt.key)}
              className={`px-4 py-2 rounded-lg text-lg transition-colors ${
                activeType === bt.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
              }`}
            >
              {bt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : channels.length === 0 ? (
          <p className="text-gray-500">チャンネルがありません。番組表画面でデータを取得してください。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-mono text-base">{ch.channelNumber}</span>
                  <span className="text-gray-200 text-lg">{ch.channelName}</span>
                </div>
                <button
                  onClick={() => handleToggleFavorite(ch.id)}
                  className={`text-2xl transition-colors ${
                    ch.isFavorite ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400/50"
                  }`}
                >
                  {ch.isFavorite ? "⭐" : "☆"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
