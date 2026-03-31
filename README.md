# TVG2 - TV Guide Viewer (Next.js Edition)

地上波・BS・CSの番組表を自在に閲覧・設定できるWebアプリ。
Python不要、Next.js単体で動作。

## Tech Stack
- **Framework**: Next.js 15 (App Router + Server Actions)
- **DB**: SQLite (better-sqlite3 + Drizzle ORM)
- **Scraping**: Cheerio (server-side)
- **Styling**: Tailwind CSS v4

## Setup & Run

```bash
npm install
npm run dev
```

http://localhost:3002 でアクセス。

## Usage
1. 初回アクセス時、今日の番組データを自動スクレイプ
2. 番組表画面で地上波/BS/CSを切替、日付選択
3. 設定画面でチャンネルの ⭐ お気に入り設定 → Myチャンネルに表示
