// LIFF画面・結果ページから呼ばれるAPI
import {
  verifyIdToken, loadGame, saveGame, loadResult, images, finishIfLast, push, announce,
  taskOf, nameOf, currentUserId, pickPrompt, lastEntry, TIME_LIMIT,
} from "../../lib/game.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\//, "");
  try {
    if (path === "config") return json({ liffId: process.env.LIFF_ID });

    if (path.startsWith("img/")) {
      const id = path.slice(4);
      if (!/^[a-z0-9]+-\d+$/.test(id)) return json({ error: "bad id" }, 400);
      const data = await images().get(id, { type: "arrayBuffer" });
      if (!data) return json({ error: "not found" }, 404);
      return new Response(data, {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
      });
    }

    if (path === "result") {
      const id = new URL(req.url).searchParams.get("id") || "";
      const result = await loadResult(id);
      return result ? json(result) : json({ error: "結果が見つかりません" }, 404);
    }

    if (req.method !== "POST") return json({ error: "not found" }, 404);
    const body = await req.json();
    const userId = await verifyIdToken(body.idToken);
    const game = await loadGame(body.g);

    // 自分の番かどうか確認し、番ならお題（または前の人の絵）を返す
    if (path === "turn") {
      if (game.status !== "playing") return json({ state: "notPlaying" });
      const cur = currentUserId(game);
      if (userId !== cur) {
        return json({ state: game.players.some((p) => p.userId === userId) ? "notYourTurn" : "notPlayer", currentName: nameOf(game, cur) });
      }
      const task = taskOf(game, game.turn);
      if (!game.openedAt) {
        game.openedAt = Date.now(); // 開き直しても残り時間は戻らない
        await saveGame(game);
      }
      const remainingMs = Math.max(0, game.openedAt + TIME_LIMIT[task] * 1000 - Date.now());
      const prev = lastEntry(game);
      return json({
        state: "yourTurn", task, remainingMs, limitMs: TIME_LIMIT[task] * 1000, turnNo: game.turn + 1, total: game.order.length,
        input: !prev ? {} : prev.type === "draw" ? { imageUrl: `/api/img/${prev.imageId}` } : { text: prev.text },
        isPrompt: prev?.type === "prompt",
        promptByName: prev?.type === "prompt" ? prev.name || null : null,
        canReroll: game.turn === 0 && !game.writeFirst && !game.rerolled,
      });
    }

    // お題を書く番の「おまかせ」：Botのお題を1つ提案する
    if (path === "suggest") {
      if (game.status !== "playing" || currentUserId(game) !== userId || taskOf(game, game.turn) !== "write") {
        return json({ error: "今はお題を書く番ではありません" }, 403);
      }
      const word = pickPrompt(game);
      await saveGame(game);
      return json({ text: word });
    }

    // 最初の人だけ1回：お題を交換して時間を測り直す
    if (path === "reroll") {
      if (game.status !== "playing" || game.turn !== 0 || game.writeFirst || currentUserId(game) !== userId) {
        return json({ error: "お題を変えられるのは最初の人だけです" }, 403);
      }
      if (game.rerolled) return json({ error: "お題の交換は1回だけです" }, 409);
      game.chain[0] = { type: "prompt", text: pickPrompt(game) };
      game.rerolled = true;
      game.openedAt = Date.now();
      await saveGame(game);
      return json({ text: game.chain[0].text, remainingMs: TIME_LIMIT.draw * 1000 });
    }

    // 描いた絵・答えを受け取って次の人へ
    if (path === "submit") {
      if (game.status !== "playing" || currentUserId(game) !== userId || body.turnNo !== game.turn + 1) {
        return json({ error: "もう次の人の番になっています" }, 409);
      }
      const task = taskOf(game, game.turn);
      const entry = { type: task, userId, name: nameOf(game, userId) };
      if (task === "draw") {
        const b64 = String(body.image || "").split(",")[1] || "";
        const buf = Buffer.from(b64, "base64");
        if (!buf.length || buf.length > 2_000_000) return json({ error: "画像を送れませんでした" }, 400);
        entry.imageId = `${game.gameId}-${game.turn}`;
        await images().set(entry.imageId, new Blob([buf], { type: "image/jpeg" }));
      } else if (task === "write") {
        entry.type = "prompt";
        entry.text = String(body.text || "").trim().slice(0, 30) || pickPrompt(game); // 空ならBotが代わりに決める
      } else {
        entry.text = String(body.text || "").trim().slice(0, 30) || "（時間切れ）";
      }
      game.chain.push(entry);
      game.turn += 1;
      game.openedAt = null;
      const done = await finishIfLast(game);
      await saveGame(game);
      return json({ ok: true, done, nextName: done ? null : nameOf(game, currentUserId(game)) });
    }

    // LINE外のブラウザで開いた等でトークに自動送信できなかったときの予備（プッシュ＝通数を消費）
    if (path === "notify") {
      if (!game.players.some((p) => p.userId === userId)) return json({ error: "forbidden" }, 403);
      const msgs = announce(game);
      await saveGame(game);
      if (msgs.length) await push(game.groupId, msgs);
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
};

export const config = { path: "/api/*" };
