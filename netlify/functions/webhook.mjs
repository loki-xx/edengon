// LINEのWebhook：グループ内の「参加」「開始」などに反応する
import {
  validSignature, loadGame, saveGame, newGame, startGame, skipTurn, finishIfLast,
  reply, memberName, nextLevel, LEVELS, announce, lobbyMessage, helpMessage, text, nameOf,
  MIN_PLAYERS, DONE_TEXT,
} from "../../lib/game.mjs";

export default async (req) => {
  const body = await req.text();
  if (!validSignature(body, req.headers.get("x-line-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const { events = [] } = JSON.parse(body);
  for (const ev of events) {
    try {
      await handle(ev);
    } catch (e) {
      console.error(e);
    }
  }
  return new Response("ok");
};

export const config = { path: "/webhook" };

async function handle(ev) {
  const src = ev.source || {};
  const groupId = src.groupId || src.roomId;

  if (!groupId) {
    // 1対1トークで話しかけられた場合
    if (ev.type === "message" && ev.replyToken) {
      await reply(ev.replyToken, [text("グループLINEに招待して遊んでね。グループで「参加」と送ると始まります。")]);
    }
    return;
  }

  if (ev.type === "join") {
    const game = newGame(groupId, await loadGame(groupId));
    await saveGame(game);
    return reply(ev.replyToken, [lobbyMessage(game, "招待ありがとう！")]);
  }

  if (ev.type !== "message" || ev.message.type !== "text") return;
  const cmd = ev.message.text.trim();
  const game = await loadGame(groupId);
  const say = (msgs) => reply(ev.replyToken, Array.isArray(msgs) ? msgs : [msgs]);
  const sayAndSave = async (msgs) => { await saveGame(game); if (msgs.length) await say(msgs); };

  // LIFF画面から自動送信される完了メッセージ → 次の人を案内（返信なので通数無料）
  if (Object.values(DONE_TEXT).includes(cmd)) {
    if (game.status === "lobby") return;
    if (game.status === "done" && game.revealPos) return; // 結果発表は一度だけ
    return sayAndSave(announce(game));
  }

  switch (cmd) {
    case "参加": {
      if (game.status === "playing") return say(text("ゲーム中です。終わったら「リセット」で次の回を受け付けます。"));
      if (game.status === "done") Object.assign(game, newGame(groupId, game));
      if (game.players.some((p) => p.userId === src.userId)) return say(text("もう参加しています！", true));
      if (!src.userId) return say(text("参加者を確認できませんでした。LINEを最新版にしてもう一度送ってください。"));
      const name = await memberName(src);
      game.players.push({ userId: src.userId, name });
      await saveGame(game);
      return say(lobbyMessage(game, `${name}さんが参加しました`));
    }
    case "抜ける": {
      if (game.status === "playing") return say(text("ゲーム中は抜けられません。番が来たら「スキップ」で飛ばせます。"));
      game.players = game.players.filter((p) => p.userId !== src.userId);
      await saveGame(game);
      return say(lobbyMessage(game, "参加を取り消しました"));
    }
    case "開始": {
      if (game.status === "playing") return say(announce(game));
      if (game.players.length < MIN_PLAYERS) {
        return say(text(`あと${MIN_PLAYERS - game.players.length}人以上集まったら始められます（おすすめは4人以上）`, true));
      }
      startGame(game);
      await saveGame(game);
      const order = game.order.map((id, i) => `${i + 1}. ${nameOf(game, id)}`).join("\n");
      return say([text(`順番が決まりました！\n${order}`), ...announce(game)]);
    }
    case "スキップ": {
      if (game.status !== "playing") return;
      const skipped = nameOf(game, skipTurn(game));
      await finishIfLast(game);
      return sayAndSave([text(`${skipped}さんを飛ばしました`), ...announce(game)]);
    }
    case "状況":
      if (game.status === "done") return say(text("この回は終わりました。「リセット」で次の回へ", true));
      return say(announce(game));
    case "つづき":
      if (game.status !== "done") return;
      return sayAndSave(announce(game));
    case "モード": {
      if (game.status === "playing") return say(text("ゲーム中はモードを変えられません"));
      game.mode = game.mode === "draw_only" ? "alternate" : "draw_only";
      await saveGame(game);
      return say(lobbyMessage(game, "モードを切り替えました"));
    }
    case "難易度": {
      if (game.status === "playing") return say(text("ゲーム中は難易度を変えられません"));
      game.level = nextLevel(game.level);
      await saveGame(game);
      return say(lobbyMessage(game, `お題を「${LEVELS[game.level]}」にしました`));
    }
    case "リセット": {
      const fresh = newGame(groupId, game);
      await saveGame(fresh);
      return say(lobbyMessage(fresh, "新しい回の参加を受け付けます"));
    }
    case "ヘルプ":
    case "使い方":
      return say(helpMessage());
    default:
      return; // 普段の会話には反応しない
  }
}
