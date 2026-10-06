// 共通ロジック：ゲーム状態の保存、LINE API呼び出し、メッセージ組み立て
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// ===== 設定 =====
export const TIME_LIMIT = { write: 30, draw: 60, guess: 30 }; // 秒
export const DONE_TEXT = { write: "✅ お題を書きました", draw: "✅ 描き終わりました", guess: "✅ 答えました" };
export const MIN_PLAYERS = 2;

// お題：難易度ごとのリスト（ここに足せば増えます）
export const PROMPTS = {
  easy: [
    "りんご", "ねこ", "いぬ", "太陽", "傘", "家", "車", "魚", "花", "雪だるま", "おにぎり", "バナナ", "星", "月", "木", "山",
    "時計", "めがね", "帽子", "靴", "ケーキ", "アイスクリーム", "電車", "飛行機", "船", "うさぎ", "ぞう", "キリン", "パンダ", "ペンギン",
    "テレビ", "電話", "鉛筆", "本", "椅子", "虹", "雲", "雷", "信号機", "かたつむり", "いちご", "ぶどう", "スイカ", "みかん",
    "さくらんぼ", "にんじん", "きのこ", "トマト", "パン", "ドーナツ", "ハンバーガー", "ピザ", "目玉焼き", "ソフトクリーム", "ライオン", "さる",
    "ぶた", "うし", "ひよこ", "かえる", "へび", "くま", "ねずみ", "かめ", "たこ", "かに", "くじら", "ちょうちょ", "てんとう虫", "鳥",
    "ふくろう", "ヘリコプター", "バス", "ロケット", "トラック", "風船", "ボール", "手紙", "はさみ", "かぎ", "ろうそく", "電球", "カメラ",
    "ギター", "太鼓", "王冠", "リボン", "手袋", "靴下", "Tシャツ", "ベッド", "ドア", "コップ", "スプーン", "火山", "島", "葉っぱ",
    "チューリップ", "ひまわり", "サボテン",
  ],
  normal: [
    "自転車", "富士山", "ラーメン", "歯ブラシ", "観覧車", "忍者", "宇宙人", "たこ焼き", "消防車", "王様", "ロボット", "花火", "カレーライス",
    "恐竜", "掃除機", "魔法使い", "東京タワー", "金魚", "サンタクロース", "温泉", "天使", "灯台", "かき氷", "大仏", "人魚", "洗濯機",
    "ピアノ", "宝箱", "UFO", "ドラゴン", "結婚式", "遊園地", "おばけ", "回転寿司", "名探偵", "ハロウィン", "鏡餅", "招き猫", "自動販売機",
    "ジェットコースター", "雪合戦", "運動会", "新幹線", "救急車", "パトカー", "宇宙飛行士", "海賊", "侍", "お姫様", "河童", "鬼", "ミイラ",
    "ゾンビ", "吸血鬼", "魔女", "天狗", "鳥居", "金閣寺", "ピラミッド", "自由の女神", "エッフェル塔", "スカイツリー", "水族館", "動物園",
    "図書館", "美容院", "コンビニ", "映画館", "銭湯", "キャンプ", "バーベキュー", "お花見", "七夕", "こいのぼり", "節分", "クリスマスツリー",
    "流れ星", "竜巻", "噴水", "滑り台", "ブランコ", "綱引き", "相撲", "野球", "サッカー", "スキー", "サーフィン", "ボウリング", "マラソン",
    "ピエロ", "指揮者", "餃子", "焼き鳥", "目覚まし時計", "冷蔵庫", "エレベーター", "扇風機", "こたつ", "虫眼鏡", "ランドセル",
  ],
  hard: [
    "寝坊", "筋トレ", "満員電車", "締め切り", "二度寝", "一目惚れ", "給料日", "迷子", "筋肉痛", "反抗期", "夏休みの宿題", "猫舌", "既読スルー",
    "寝ぐせ", "時差ぼけ", "花粉症", "立ち読み", "サプライズ", "雨宿り", "早口言葉", "金縛り", "自撮り", "居眠り", "断捨離", "片思い", "天気予報",
    "卒業式", "引っ越し", "歯医者", "肩こり", "宝くじ", "長電話", "衝動買い", "猫背", "雨男", "二日酔い", "親バカ", "猫の手も借りたい",
    "棚からぼたもち", "猿も木から落ちる", "猫に小判", "花より団子", "井の中の蛙", "寝耳に水", "鬼に金棒", "急がば回れ", "石の上にも三年", "笑う門には福来る",
    "一石二鳥", "三日坊主", "寝落ち", "遅刻", "忘れ物", "静電気", "しゃっくり", "くしゃみ", "あくび", "寝言", "食べ過ぎ", "ダイエット", "残業",
    "月曜日の朝", "大掃除", "夜更かし", "早起き", "停電", "渋滞", "行列", "値引きシール", "誤送信", "充電切れ", "圏外", "パスワード忘れ", "炎上",
    "バズる", "推し活", "人見知り", "ドヤ顔", "上から目線", "空気を読む", "ゴマすり", "板挟み", "修羅場", "デジャヴ", "走馬灯", "五月病",
    "自業自得", "腹ペコ", "貧乏ゆすり", "根回し", "有給休暇", "聖地巡礼", "一発ギャグ", "写真映え", "割り勘", "逆ギレ", "現実逃避", "ため息",
    "居留守", "二度見",
  ],
};
export const LEVELS = { mix: "ミックス", easy: "かんたん", normal: "ふつう", hard: "むずかしい" };
const LEVEL_ORDER = ["mix", "easy", "normal", "hard"];
export const nextLevel = (lv) => LEVEL_ORDER[(LEVEL_ORDER.indexOf(lv || "mix") + 1) % LEVEL_ORDER.length];

// 同じグループで最近出たお題は避けて選ぶ
export function pickPrompt(game) {
  const level = game.level || "mix";
  const pool = level === "mix" ? Object.values(PROMPTS).flat() : PROMPTS[level];
  const used = new Set(game.usedPrompts || []);
  let candidates = pool.filter((w) => !used.has(w));
  if (!candidates.length) {
    game.usedPrompts = [];
    candidates = pool;
  }
  const word = candidates[Math.floor(Math.random() * candidates.length)];
  game.usedPrompts = [...(game.usedPrompts || []), word].slice(-80);
  return word;
}

const env = (k) => process.env[k];
export const siteUrl = () => (env("URL") || "").replace(/\/$/, "");

// ===== ストレージ（Netlify Blobs） =====
const games = () => getStore({ name: "games", consistency: "strong" });
const results = () => getStore({ name: "results", consistency: "strong" });
export const images = () => getStore({ name: "images", consistency: "strong" });

// prev を渡すと、モード・難易度・出たお題の履歴を引き継ぐ
export function newGame(groupId, prev = {}) {
  return {
    groupId, status: "lobby", mode: prev.mode || "alternate", level: prev.level || "mix",
    usedPrompts: prev.usedPrompts || [], players: [], order: [], turn: 0, chain: [],
    openedAt: null, gameId: null, rerolled: false, revealPos: 0,
  };
}
export async function loadGame(groupId) {
  return (await games().get(groupId, { type: "json" })) || newGame(groupId);
}
export async function saveGame(game) {
  await games().setJSON(game.groupId, game);
}
export async function loadResult(gameId) {
  return results().get(gameId, { type: "json" });
}

// ===== ゲーム進行 =====
// alternate: 描く→答える→描く…（テレストレーション）
// draw_only: 前の人の絵だけを見て描き続ける（絵の伝言ゲーム）
// writeFirst（交互モードで奇数人数）のときは、1人目がお題を書き、そのあと描く→答える…で必ず「答える」で終わる
export function taskOf(game, i) {
  if (game.mode === "draw_only") return "draw";
  if (game.writeFirst) return i === 0 ? "write" : i % 2 === 1 ? "draw" : "guess";
  return i % 2 === 0 ? "draw" : "guess";
}
// 今の番の人に見せる「前の人の結果」（1人目がお題を書く番では何もない）
export const lastEntry = (game) => game.chain[game.chain.length - 1] || null;
export const nameOf = (game, userId) => game.players.find((p) => p.userId === userId)?.name || "だれか";
export const currentUserId = (game) => game.order[game.turn];

export function startGame(game) {
  const order = game.players.map((p) => p.userId);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  game.order = order;
  game.turn = 0;
  game.writeFirst = game.mode === "alternate" && order.length % 2 === 1;
  game.chain = game.writeFirst ? [] : [{ type: "prompt", text: pickPrompt(game) }];
  game.openedAt = null;
  game.rerolled = false;
  game.revealPos = 0;
  game.gameId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  game.status = "playing";
}

// 今の人を飛ばす（同じお題・同じ絵が次の人に回る）
export function skipTurn(game) {
  const skipped = currentUserId(game);
  game.order.splice(game.turn, 1);
  game.openedAt = null;
  return skipped;
}

export async function finishIfLast(game) {
  if (game.turn < game.order.length) return false;
  game.status = "done";
  await results().setJSON(game.gameId, {
    gameId: game.gameId, mode: game.mode, chain: game.chain, finishedAt: Date.now(),
  });
  return true;
}

// ===== LINE API =====
async function lineApi(path, body, method = "POST") {
  const res = await fetch(`https://api.line.me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("LINE_CHANNEL_ACCESS_TOKEN")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`LINE API ${path} ${res.status}: ${await res.text()}`);
  return res.status === 200 ? res.json().catch(() => ({})) : {};
}
export const reply = (replyToken, messages) => lineApi("/v2/bot/message/reply", { replyToken, messages });
export const push = (to, messages) => lineApi("/v2/bot/message/push", { to, messages });

export async function memberName(source) {
  const kind = source.type === "room" ? "room" : "group";
  const id = source.groupId || source.roomId;
  try {
    const p = await lineApi(`/v2/bot/${kind}/${id}/member/${source.userId}`, null, "GET");
    return p.displayName;
  } catch {
    return "名無しさん";
  }
}

export function validSignature(body, signature) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", env("LINE_CHANNEL_SECRET")).update(body).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// LIFFから送られてきたIDトークンを検証して userId を返す（なりすまし防止）
export async function verifyIdToken(idToken) {
  if (!idToken) throw new Error("IDトークンがありません");
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env("LINE_LOGIN_CHANNEL_ID") }),
  });
  const data = await res.json();
  if (!res.ok || !data.sub) throw new Error("ログインの確認に失敗しました。開き直してください");
  return data.sub;
}

// ===== メッセージ組み立て =====
const QUICK_LOBBY = {
  items: ["参加", "抜ける", "開始", "モード", "難易度"].map((t) => ({
    type: "action", action: { type: "message", label: t, text: t },
  })),
};
export const text = (t, quick) => ({ type: "text", text: t, ...(quick ? { quickReply: QUICK_LOBBY } : {}) });

const modeLabel = (game) => (game.mode === "draw_only" ? "絵だけ伝言（ずっと描く）" : "描く→答えるを交互に");

export function lobbyMessage(game, lead = "") {
  const names = game.players.map((p, i) => `${i + 1}. ${p.name}`).join("\n") || "（まだいません）";
  return text(
    `${lead ? lead + "\n\n" : ""}🎨 えでんごん（絵伝言ゲーム）\nモード：${modeLabel(game)}\nお題の難易度：${LEVELS[game.level || "mix"]}\n\n参加者（${game.players.length}人）\n${names}\n\n「参加」で参加、そろったら誰かが「開始」`,
    true,
  );
}

export function helpMessage() {
  return text(
    "使えることば\n参加／抜ける：参加の受付\n開始：順番を決めてスタート\nスキップ：今の番の人を飛ばす\n状況：今どうなってるか\nモード：交互⇔絵だけ を切り替え\n難易度：お題の難しさを切り替え\nリセット：最初からやり直し",
    true,
  );
}

function turnBubble(game) {
  const task = taskOf(game, game.turn);
  const name = nameOf(game, currentUserId(game));
  const liffUrl = `https://liff.line.me/${env("LIFF_ID")}?g=${encodeURIComponent(game.groupId)}`;
  const what = {
    write: `${TIME_LIMIT.write}秒でお題を考えて書いてください（思いつかなければ「おまかせ」もOK）`,
    draw: `${TIME_LIMIT.draw}秒で絵を描いてください`,
    guess: `${TIME_LIMIT.guess}秒で絵が何か答えてください`,
  }[task];
  return {
    type: "flex",
    altText: `${name}さんの番です`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: `${game.turn + 1}人目 / 全${game.order.length}人`, size: "sm", color: "#7A8794" },
          { type: "text", text: `${name}さんの番です`, weight: "bold", size: "xl", wrap: true },
          { type: "text", text: `下のボタンを押して、${what}。\n他の人が押しても開きません。`, size: "sm", wrap: true, color: "#444444" },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: "#2F6F8F",
          action: { type: "uri", label: { write: "お題を書く", draw: "描く", guess: "答える" }[task], uri: liffUrl },
        }],
      },
    },
  };
}

// 結果発表用の吹き出しを全部並べる：結果発表 → お題 → 絵 → 回答 → 絵 … → まとめ
function revealList(game) {
  const list = [text("🎉 結果発表！")];
  for (const c of game.chain) {
    if (c.type === "prompt") list.push(text(c.name ? `📝 ${c.name}さんが書いたお題は「${c.text}」` : `📝 お題は「${c.text}」`));
    else if (c.type === "guess") list.push(text(`💬 ${c.name}さんの答え\n「${c.text}」`));
    else list.push(drawingBubble(c));
  }
  const first = game.chain[0].text;
  const lastText = [...game.chain].reverse().find((c) => c.type === "guess")?.text;
  const verdict = !lastText ? `最初のお題は「${first}」でした`
    : lastText === first ? "最後までちゃんと伝わりました！" : `「${first}」は「${lastText}」になりました`;
  list.push({
    type: "template", altText: verdict,
    template: {
      type: "buttons", text: verdict.slice(0, 160),
      actions: [
        { type: "uri", label: "まとめて見る", uri: `${siteUrl()}/result.html?id=${game.gameId}` },
        { type: "message", label: "もう一回", text: "リセット" },
      ],
    },
  });
  return list;
}

function drawingBubble(c) {
  const img = `${siteUrl()}/api/img/${c.imageId}`;
  return {
    type: "flex", altText: `${c.name}さんの絵`,
    contents: {
      type: "bubble", size: "kilo",
      hero: { type: "image", url: img, size: "full", aspectRatio: "1:1", aspectMode: "fit", backgroundColor: "#FFFFFF",
        action: { type: "uri", label: "拡大", uri: img } },
      body: { type: "box", layout: "vertical", paddingAll: "md",
        contents: [{ type: "text", text: `🎨 ${c.name}さんの絵`, size: "sm", weight: "bold" }] },
    },
  };
}

// 結果を1つずつめくる：1回目は「結果発表＋お題」、以降は「つづき」で1つずつ。最後の1つにはまとめを添える
export function nextRevealBatch(game) {
  const list = revealList(game);
  const pos = game.revealPos || 0;
  if (pos >= list.length) return [];
  let size = pos === 0 ? 2 : 1;
  if (pos + size === list.length - 1) size += 1; // まとめだけが残らないように
  const batch = list.slice(pos, pos + size);
  game.revealPos = pos + batch.length;
  if (game.revealPos < list.length) {
    batch[batch.length - 1] = {
      ...batch[batch.length - 1],
      quickReply: { items: [{ type: "action", action: { type: "message", label: "つづき", text: "つづき" } }] },
    };
  }
  return batch;
}

// 今の状態に応じた案内（Webhookの返信にも、予備のプッシュにも使う）
// 終了後は結果発表を進める（game.revealPos が変わるので呼んだ側で保存すること）
export function announce(game) {
  if (game.status === "lobby") return [lobbyMessage(game)];
  if (game.status === "done") return nextRevealBatch(game);
  return [turnBubble(game)];
}
