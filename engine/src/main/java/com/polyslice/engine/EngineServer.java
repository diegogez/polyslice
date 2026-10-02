package com.polyslice.engine;

import com.polyslice.entity.Bomb;
import com.polyslice.entity.PowerOrb;
import com.polyslice.entity.Shape;
import com.polyslice.entity.ShapeType;
import com.polyslice.game.Difficulty;
import com.polyslice.game.GameEvent;
import com.polyslice.game.GameSession;
import com.polyslice.game.Scoring;
import com.polyslice.json.Json;
import com.polyslice.json.JsonWriter;
import com.polyslice.mode.GameMode;
import com.polyslice.persist.Achievement;
import com.polyslice.persist.AchievementTracker;
import com.polyslice.persist.HighScoreTable;
import com.polyslice.persist.SaveData;
import com.polyslice.powerup.PowerUpType;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.locks.LockSupport;

/**
 * Runs the game loop and talks to the Electron UI over stdin/stdout, one JSON object per line.
 *
 * <pre>
 *   UI  -> engine : {"cmd":"start","mode":"CLASSIC","player":"Ada"}
 *                   {"cmd":"blade","x":812.5,"y":433.0,"t":16832.4}
 *   engine -> UI  : {"type":"hello", ...}           catalog, high scores, achievements
 *                   {"type":"state", ...,"ev":[...]} 60 times per second
 * </pre>
 *
 * Two threads: a reader thread that parses commands into a queue, and the loop thread that owns
 * all game state. Every mutation happens on the loop thread, so no locking is needed.
 */
public final class EngineServer {

    public static final String VERSION = "1.0.0";
    public static final int TICK_HZ = 60;
    private static final long TICK_NANOS = 1_000_000_000L / TICK_HZ;
    private static final double TICK_SECONDS = 1.0 / TICK_HZ;

    private final ConcurrentLinkedQueue<Map<String, Object>> inbox = new ConcurrentLinkedQueue<>();
    private final PrintStream out;
    private final SaveData save;
    private final AchievementTracker achievements;
    private final JsonWriter frame = new JsonWriter();
    private final long startNanos = System.nanoTime();

    private volatile boolean running = true;
    private GameSession session;
    private String playerName = "Player";
    private double aspect = 16.0 / 9.0;
    private boolean paused;
    private boolean sentPausedFrame;

    public EngineServer(SaveData save) {
        this.save = save;
        this.achievements = new AchievementTracker(save);
        this.out = new PrintStream(new BufferedOutputStream(new FileOutputStream(FileDescriptor.out), 1 << 16),
                false, StandardCharsets.UTF_8);
        this.session = newAttractSession();
    }

    public void run() {
        Thread reader = new Thread(this::readLoop, "engine-stdin");
        reader.setDaemon(true);
        reader.start();

        log("PolySlice engine " + VERSION + " ready (Java " + System.getProperty("java.version") + ")");
        long next = System.nanoTime();
        while (running) {
            drainCommands();
            tick();
            next += TICK_NANOS;
            long wait = next - System.nanoTime();
            if (wait > 0) {
                LockSupport.parkNanos(wait);
            } else if (wait < -TICK_NANOS * 5) {
                next = System.nanoTime(); // fell far behind (e.g. laptop slept); don't fast-forward
            }
        }
        out.flush();
    }

    private void readLoop() {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                try {
                    inbox.add(Json.parseObject(line));
                } catch (Json.JsonException e) {
                    log("Ignoring bad command: " + e.getMessage());
                }
            }
        } catch (IOException e) {
            log("stdin closed: " + e.getMessage());
        }
        // The UI went away: shut down cleanly.
        running = false;
    }

    private void drainCommands() {
        Map<String, Object> cmd;
        while ((cmd = inbox.poll()) != null) {
            try {
                handle(cmd);
            } catch (RuntimeException e) {
                log("Command failed: " + e);
            }
        }
    }

    private void handle(Map<String, Object> cmd) {
        String name = Json.str(cmd, "cmd", "");
        switch (name) {
            case "hello":
                paused = false;
                session = newAttractSession();
                sendHello();
                break;
            case "start": {
                GameMode mode = GameMode.byId(Json.str(cmd, "mode", "CLASSIC"));
                boolean demo = Json.bool(cmd, "demo", false);
                String player = Json.str(cmd, "player", "").trim();
                if (!player.isEmpty()) {
                    playerName = player.length() > 16 ? player.substring(0, 16) : player;
                }
                long seed = (long) Json.num(cmd, "seed", System.nanoTime());
                paused = false;
                session = new GameSession(mode, worldWidth(), seed, demo, achievements);
                break;
            }
            case "blade":
                if (!session.demo() && !paused) {
                    Object pts = cmd.get("pts");
                    if (pts instanceof List) {
                        // Batched samples: [[x, y, t], ...] (coalesced pointer events).
                        for (Object o : (List<?>) pts) {
                            if (o instanceof List && ((List<?>) o).size() >= 3) {
                                List<?> p = (List<?>) o;
                                session.bladeMove(asDouble(p.get(0)), asDouble(p.get(1)), asDouble(p.get(2)));
                            }
                        }
                    } else {
                        session.bladeMove(Json.num(cmd, "x", 0), Json.num(cmd, "y", 0), Json.num(cmd, "t", 0));
                    }
                }
                break;
            case "bladeUp":
                if (!session.demo()) {
                    session.bladeUp();
                }
                break;
            case "pause":
                if (session.mode().scored()) {
                    paused = true;
                    sentPausedFrame = false;
                    session.bladeUp();
                }
                break;
            case "resume":
                paused = false;
                break;
            case "menu":
                paused = false;
                session = newAttractSession();
                break;
            case "resize":
                aspect = clamp(Json.num(cmd, "aspect", aspect), 0.6, 3.2);
                session.setWidth(worldWidth());
                break;
            case "resetData":
                save.reset();
                save.saveQuietly();
                sendHello();
                break;
            case "end":
                // Ends the current game right away (used by the UI's "give up" and by screenshot mode).
                if (session.mode().scored()) {
                    session.endNow();
                    paused = false;
                }
                break;
            case "quit":
                running = false;
                break;
            default:
                log("Unknown command: " + name);
        }
    }

    private void tick() {
        if (paused) {
            if (!sentPausedFrame) {
                emitState();
                sentPausedFrame = true;
            }
            return;
        }
        session.update(TICK_SECONDS);
        if (session.over()) {
            finishGame();
            emitState();
            session = newAttractSession();
            sendHello(); // refreshed high scores and achievements for the menus
        } else {
            emitState();
        }
    }

    /** Records the result, then attaches the summary to the final frame. */
    private void finishGame() {
        GameMode mode = session.mode();
        int rank = 0;
        if (!session.demo()) {
            HighScoreTable table = save.table(mode.id());
            rank = table.submit(new HighScoreTable.Entry(playerName, session.score(),
                    session.stats().maxLevel, session.stats().bestCombo, LocalDate.now().toString()));
            save.recordGame(session.stats());
            save.saveQuietly();
        }
        int best = save.table(mode.id()).best();
        session.addEvent(new GameEvent.GameOver(mode.id(), mode.endReason(), session.score(), rank,
                best, session.stats(), session.unlockedThisGame()));
    }

    private void emitState() {
        frame.reset();
        session.writeState(frame, paused, (System.nanoTime() - startNanos) / 1e6);
        send(frame.toString());
    }

    private void sendHello() {
        JsonWriter w = new JsonWriter();
        w.beginObject().field("type", "hello").field("version", VERSION)
                .field("java", System.getProperty("java.version"))
                .field("player", playerName);

        w.key("shapes").beginArray();
        for (ShapeType t : ShapeType.values()) {
            w.beginObject().field("code", t.name()).field("name", t.displayName())
                    .field("points", t.basePoints()).field("radius", t.radius(), 0)
                    .field("minLevel", t.minLevel()).field("desc", t.description()).endObject();
        }
        w.endArray();
        w.field("bombRadius", Bomb.RADIUS, 0).field("orbRadius", PowerOrb.RADIUS, 0);

        w.key("powerups").beginArray();
        for (PowerUpType p : PowerUpType.values()) {
            w.beginObject().field("code", p.name()).field("name", p.displayName())
                    .field("duration", p.duration(), 1).field("desc", p.description()).endObject();
        }
        w.endArray();

        w.key("modes").beginArray();
        for (GameMode m : GameMode.playable()) {
            w.beginObject().field("id", m.id()).field("name", m.displayName())
                    .field("desc", m.description()).field("lives", m.startingLives())
                    .field("time", m.timeLimit(), 0).field("best", save.table(m.id()).best())
                    .endObject();
        }
        w.endArray();

        w.key("achievements").beginArray();
        for (Achievement a : Achievement.values()) {
            w.beginObject().field("id", a.name()).field("name", a.displayName())
                    .field("desc", a.description()).field("unlocked", save.isUnlocked(a)).endObject();
        }
        w.endArray();

        w.key("highScores").beginObject();
        for (var e : save.tables().entrySet()) {
            w.key(e.getKey());
            e.getValue().write(w);
        }
        w.endObject();

        w.key("lifetime");
        save.writeLifetime(w);

        w.key("rules").beginObject()
                .field("levelSeconds", Difficulty.LEVEL_SECONDS, 0)
                .field("multPerLevel", Difficulty.MULTIPLIER_PER_LEVEL)
                .field("goldenMult", Shape.GOLDEN_MULTIPLIER)
                .field("minCombo", Scoring.MIN_COMBO)
                .field("height", GameSession.HEIGHT, 0)
                .endObject();
        w.endObject();
        send(w.toString());
    }

    private GameSession newAttractSession() {
        return new GameSession(GameMode.attract(), worldWidth(), System.nanoTime(), false, null);
    }

    private double worldWidth() {
        return GameSession.HEIGHT * aspect;
    }

    private void send(String json) {
        out.print(json);
        out.print('\n');
        out.flush();
    }

    private static double asDouble(Object o) {
        return o instanceof Number ? ((Number) o).doubleValue() : 0;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    static void log(String message) {
        System.err.println("[engine] " + message);
    }
}
