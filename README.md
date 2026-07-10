# Community Advisor

An IBM-branded tool for Customer Success Managers to scan IBM Community forum groups, surface unanswered threads, generate AI-powered draft responses, and analyse recurring themes — powered by IBM watsonx.ai.

## Features

- **Multi-product scanning** — select one or more IBM product communities and fetch open/unanswered threads in one click
- **AI draft answers** — watsonx.ai (IBM Granite) generates a suggested community reply for each thread
- **Theme analytics** — AI clusters all scanned threads into recurring themes with a bar chart and card view
- **IBM Carbon design** — clean, IBM-branded UI with Carbon design tokens

## Project structure

```
community-advisor/
├── config/
│   ├── groups.json          ← add your product community keys here
│   └── watsonx.json         ← your TechZone credentials (git-ignored)
│   └── watsonx.json.example ← template to copy
├── server/
│   ├── index.js             ← Express API server
│   ├── scraper.js           ← IBM Community HTML scraper
│   ├── watsonx.js           ← watsonx.ai client
│   ├── drafter.js           ← answer generation
│   └── analyser.js          ← theme clustering
└── client/
    ├── index.html
    ├── style.css            ← IBM Carbon tokens
    └── app.js               ← vanilla JS SPA
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure watsonx.ai credentials

Copy the example and fill in your TechZone credentials:

```bash
cp config/watsonx.json.example config/watsonx.json
```

Edit `config/watsonx.json`:

```json
{
  "apiKey": "YOUR_IBM_CLOUD_API_KEY",
  "projectId": "YOUR_WATSONX_PROJECT_ID",
  "url": "https://us-south.ml.cloud.ibm.com",
  "modelId": "ibm/granite-3-3-8b-instruct"
}
```

### 3. Add your community groups

Edit `config/groups.json` and add the `communityKey` for each IBM product group you want to scan. The community key is the `communitykey=` query parameter from the IBM Community URL.

### 4. Exclude threads by title keyword or phrase

Open `config/groups.json` and add words or phrases to the `"exclusions"` array at the top of the file:

```json
{
  "exclusions": [
    "TechXchange",
    "webinar registration"
  ],
  ...
}
```

- Matching is **case-insensitive** and checks whether the phrase appears **anywhere** in the thread title.
- A thread is hidden from both the Unanswered Threads tab and Theme Analytics if its title matches any entry.
- Add as many entries as needed; remove an entry to stop filtering it.
- The server logs how many threads were excluded per product on each scan.
- Changes take effect on the next scan — no restart required.

### 5. Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Select products** — tick the products you want to scan
2. **Run Report** — the app scrapes each community for open/unanswered threads
3. **Unanswered Threads tab** — browse threads, expand any to generate a watsonx.ai draft answer
4. **Theme Analytics tab** — click "Analyse Themes" to see AI-generated topic clusters across all scanned threads

## Notes

- `config/watsonx.json` is git-ignored — never commit credentials
- The scraper works without authentication (public community pages only)
- When watsonx.ai is not configured, draft answers and theme analysis return a placeholder message; keyword fallback is used for theme grouping
