// AIチャットが動かないときの診断用: npm run check:ai
//
// 次の3つを順に調べて、どこで止まっているかを日本語で表示する。
//   1. このPC(Node.js)から、GoogleのGemini APIに接続できるか
//   2. このAPIキーで使えるモデルは何か
//   3. 実際に短い質問をして、何秒で答えが返るか
// APIキー自体は画面に表示しない。

import { readFileSync } from "node:fs";
import { setDefaultResultOrder } from "node:dns";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// ---- .env.local から設定を読む(Next.jsを起動しなくても使えるように)
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // .env.local が無い場合は、環境変数だけを使う
  }
  return env;
}

const env = loadEnv();
const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
const preferred = process.env.GEMINI_MODEL || env.GEMINI_MODEL;

const line = (text = "") => console.log(text);
const seconds = (ms) => (ms / 1000).toFixed(1) + "秒";

async function call(path, { method = "GET", body, timeoutMs = 20000 } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms: Date.now() - started, text };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      timedOut,
      code: timedOut ? "TIMEOUT" : (error?.cause?.code ?? error?.cause?.message ?? error?.message ?? "不明"),
    };
  } finally {
    clearTimeout(timer);
  }
}

const snippet = (text, n = 220) => (text ?? "").replace(/\s+/g, " ").slice(0, n);

line("=== Gemini 接続診断 ===");
line(`Node.js ${process.version}`);
const proxyVars = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].filter((k) => process.env[k]);
line(
  proxyVars.length
    ? `プロキシ設定(環境変数): ${proxyVars.join(", ")}  ※Node.jsが使うには NODE_USE_ENV_PROXY=1 も必要です`
    : "プロキシ設定(環境変数): なし"
);

if (!apiKey) {
  line();
  line("✗ GEMINI_API_KEY が見つかりません。.env.local に GEMINI_API_KEY=... を書いてください。");
  process.exit(1);
}
line(`APIキー: 設定あり(${apiKey.length}文字)`);

// ---- 1. 接続とモデル一覧
line();
line("【1】GoogleのAPIに接続できるか(モデル一覧の取得)");
let list = await call("/models?pageSize=200", { timeoutMs: 15000 });

if (!list.ok && (list.timedOut || list.status === 0)) {
  line(`  ✗ 失敗: ${list.code}(${seconds(list.ms)})`);
  // IPv6が原因で止まることがあるので、IPv4を優先して、もう一度だけ試す
  setDefaultResultOrder("ipv4first");
  line("  → IPv4を優先して、もう一度試します…");
  list = await call("/models?pageSize=200", { timeoutMs: 15000 });
  if (list.ok) {
    line(`  ✓ IPv4優先なら接続できました(${seconds(list.ms)})。IPv6が原因です。`);
    line("    対処: 開発サーバーを次のように起動してください(PowerShell)。");
    line('      $env:NODE_OPTIONS="--dns-result-order=ipv4first"; npm run dev');
  }
}

if (!list.ok) {
  if (list.status === 0) {
    line(`  ✗ このPCのNode.jsから、GoogleのAPIに届きません(${list.code})。`);
    line("    よくある原因と対処:");
    line("    ・学校や会社のネットワークで、プロキシやファイアウォールを通している");
    line("      → 別のネットワーク(スマホのテザリングなど)につないで、もう一度この診断を実行");
    line("      → プロキシを使う場合(Node.js 22.21以降 / 24以降):");
    line('        $env:HTTPS_PROXY="http://プロキシのアドレス:ポート"; $env:NODE_USE_ENV_PROXY="1"; npm run dev');
    line("    ・ブラウザではGoogleが開けるのに、ここだけ失敗する場合は、上のプロキシが原因のことが多いです");
  } else {
    line(`  ✗ Googleから拒否されました(status ${list.status})`);
    line(`    ${snippet(list.text)}`);
    if (/API key|API_KEY/i.test(list.text ?? "")) {
      line("    → APIキーが正しくない・無効です。Google AI Studio でキーを作り直して .env.local を直してください。");
    }
  }
  process.exit(1);
}
line(`  ✓ 接続できました(${seconds(list.ms)})`);

// ---- 2. このキーで使えるモデル
line();
line("【2】このAPIキーで使える Flash 系モデル");
let available = [];
try {
  available = (JSON.parse(list.text).models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m.name).replace(/^models\//, ""))
    .filter((name) => /flash/i.test(name) && !/image|tts|live|audio|robotics|transcribe|embedding/i.test(name));
} catch {
  // 一覧が読めなくても、次の確認は続ける
}
if (available.length) {
  for (const name of available.slice(0, 15)) line(`  ・${name}`);
  if (available.length > 15) line(`  …ほか ${available.length - 15} 件`);
} else {
  line("  (一覧から該当するモデルを見つけられませんでした)");
}

// ---- 3. 実際に質問して、速さを測る
line();
line("【3】実際に短い質問をして、返答までの時間を測る");
const candidates = [...new Set([preferred, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"].filter(Boolean))];
let working = null;

for (const model of candidates) {
  const note = available.length && !available.includes(model) ? "(一覧には無いモデル)" : "";
  const result = await call(`/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    timeoutMs: 20000,
    body: {
      contents: [{ role: "user", parts: [{ text: "「OK」とだけ返してください。" }] }],
      generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } },
    },
  });

  if (result.ok) {
    let answer = "";
    try {
      answer = (JSON.parse(result.text).candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    } catch {
      // 読めなくても、時間は分かる
    }
    line(`  ✓ ${model}${note}: ${seconds(result.ms)} → 「${snippet(answer, 40)}」`);
    working ??= { model, ms: result.ms };
  } else if (result.status === 0) {
    line(`  ✗ ${model}${note}: ${result.timedOut ? "20秒待っても応答なし" : result.code}`);
  } else {
    line(`  ✗ ${model}${note}: status ${result.status}(${seconds(result.ms)})`);
    line(`      ${snippet(result.text)}`);
  }
}

line();
line("=== 結果 ===");
if (working) {
  line(`✓ 使えるモデル: ${working.model}(${seconds(working.ms)}で応答)`);
  if (working.model !== candidates[0]) {
    line(`  アプリは候補を順に試して、このモデルまで自動で切り替えます。`);
    line(`  毎回の待ち時間を減らすには、.env.local に次の1行を足してください:`);
    line(`    GEMINI_MODEL=${working.model}`);
  }
  if (working.ms > 8000) {
    line("  ※応答がやや遅めです。混み合っている時間帯かもしれません。時間をおいて再度試してください。");
  }
} else {
  line("✗ どのモデルでも質問に答えられませんでした。上の status とメッセージを確認してください。");
  line("  429 → 無料枠の上限(少し待つ)  /  403・404 → このキーでは使えないモデル  /  応答なし → 混雑かネットワーク");
}
