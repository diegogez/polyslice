package com.polyslice.game;

import com.polyslice.ai.AutoPilot;
import com.polyslice.entity.Bomb;
import com.polyslice.entity.Entity;
import com.polyslice.entity.PowerOrb;
import com.polyslice.entity.Shape;
import com.polyslice.entity.ShapeType;
import com.polyslice.json.JsonWriter;
import com.polyslice.math.Geometry;
import com.polyslice.mode.GameMode;
import com.polyslice.persist.Achievement;
import com.polyslice.persist.AchievementTracker;
import com.polyslice.powerup.PowerUpManager;
import com.polyslice.powerup.PowerUpType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * One game from first launch to game over: the arena, its entities and every rule that ties
 * them together. The session is advanced in fixed steps by {@link #update(double)} and is
 * fully deterministic for a given seed and input sequence, which keeps it testable.
 *
 * <p>World coordinates: x runs from 0 to {@link #width()}, y from 0 (bottom) to
 * {@link #HEIGHT} (top), gravity pulls toward -y.
 */
public final class GameSession {

    public static final double HEIGHT = 1000.0;
    /** Slight leniency so slices that look like hits count as hits. */
    public static final double HIT_LENIENCY = 1.08;
    public static final double HAZARD_LENIENCY = 0.88;

    private final GameMode mode;
    private final boolean demo;
    private final Random rng;
    private final List<Entity> entities = new ArrayList<>();
    private final List<Entity> incoming = new ArrayList<>();
    private final Difficulty difficulty = new Difficulty();
    private final Spawner spawner = new Spawner();
    private final PowerUpManager powerUps = new PowerUpManager();
    private final ComboTracker combo = new ComboTracker();
    private final Blade blade = new Blade();
    private final GameStats stats = new GameStats();
    private final List<GameEvent> events = new ArrayList<>();
    private final List<Achievement> unlockedThisGame = new ArrayList<>();
    private final AchievementTracker achievements;
    private AutoPilot pilot;

    private double width;
    private int nextId = 1;
    private int score;
    private int lives;
    private double timeLeft;
    private double realTime;
    private double simTime;
    private boolean over;

    public GameSession(GameMode mode, double width, long seed, boolean demo,
                       AchievementTracker achievements) {
        this.mode = mode;
        this.width = width;
        this.demo = demo;
        this.rng = new Random(seed);
        this.achievements = (demo || !mode.scored()) ? null : achievements;
        this.lives = mode.startingLives();
        this.timeLeft = mode.timeLimit();
        if (demo) {
            this.pilot = new AutoPilot(new Random(seed ^ 0x5DEECE66DL));
        }
    }

    // ---- Simulation -----------------------------------------------------------------------

    /** Advances the game by {@code dt} seconds of real time. */
    public void update(double dt) {
        if (over) {
            return;
        }
        realTime += dt;
        for (PowerUpType expired : powerUps.update(dt)) {
            events.add(new GameEvent.PowerUpEnded(expired.name()));
        }

        double sdt = dt * powerUps.timeScale();
        simTime += sdt;
        if (mode.scored()) {
            stats.seconds += dt;
        }

        if (difficulty.advance(sdt * mode.difficultyRate())) {
            stats.maxLevel = Math.max(stats.maxLevel, difficulty.level());
            if (mode.scored()) {
                events.add(new GameEvent.LevelUp(difficulty.level(), difficulty.pointMultiplier()));
            }
        }

        if (pilot != null) {
            pilot.update(this, dt);
        }

        double g = difficulty.gravity();
        for (Entity e : entities) {
            e.step(sdt, g);
        }

        processBlade();
        spawner.update(this, sdt);
        flushIncoming();
        cull();

        int finished = combo.poll(realTime, blade.strokeActive());
        if (finished > 0) {
            finishCombo(finished);
        }

        if (mode.timeLimit() > 0) {
            timeLeft = Math.max(0, timeLeft - sdt);
        }

        if (achievements != null) {
            for (Achievement a : achievements.check(this)) {
                unlockedThisGame.add(a);
                events.add(new GameEvent.Unlocked(a));
            }
        }

        if (mode.isOver(this)) {
            over = true;
            powerUps.clear();
        }
    }

    private void processBlade() {
        List<Blade.Segment> segments = blade.drain();
        if (segments.isEmpty()) {
            return;
        }
        double bonus = powerUps.bladeBonus();
        for (Blade.Segment seg : segments) {
            if (!seg.cuts()) {
                continue;
            }
            for (Entity e : entities) {
                if (!e.alive()) {
                    continue;
                }
                double hitRadius = e.hazardous()
                        ? e.radius() * HAZARD_LENIENCY
                        : e.radius() * HIT_LENIENCY + bonus;
                // Test both the current and previous position: the player aimed at what was on
                // screen, which can be up to a tick behind the simulation.
                if (Geometry.segmentHitsCircle(seg.x1(), seg.y1(), seg.x2(), seg.y2(),
                        e.x(), e.y(), hitRadius)
                        || Geometry.segmentHitsCircle(seg.x1(), seg.y1(), seg.x2(), seg.y2(),
                        e.prevX(), e.prevY(), hitRadius)) {
                    e.kill();
                    e.onSliced(this, seg.dirX(), seg.dirY());
                }
            }
        }
    }

    private void flushIncoming() {
        if (!incoming.isEmpty()) {
            entities.addAll(incoming);
            incoming.clear();
        }
    }

    /** Removes dead entities and anything that left the arena. */
    private void cull() {
        for (Iterator<Entity> it = entities.iterator(); it.hasNext(); ) {
            Entity e = it.next();
            if (!e.alive()) {
                it.remove();
            } else if (e.y() < -e.radius() * 2.2 && e.vy() < 0) {
                e.kill();
                it.remove();
                e.onMissed(this);
            } else if (e.x() < -e.radius() * 3 || e.x() > width + e.radius() * 3) {
                e.kill();
                it.remove();
            }
        }
    }

    // ---- Rules invoked by entities and modes -----------------------------------------------

    /** Scores a sliced shape and extends the current combo. */
    public void awardSlice(Shape shape, double dirX, double dirY) {
        int running = mode.scored() ? combo.onSlice(realTime, shape.x(), shape.y()) : 0;
        int points = 0;
        if (mode.scored()) {
            points = Scoring.slicePoints(shape.type(), shape.golden(),
                    difficulty.pointMultiplier(), powerUps.scoreMultiplier());
            score += points;
            stats.recordSlice(shape.type(), shape.golden());
        }
        events.add(new GameEvent.Slice(shape.id(), shape.code(), shape.x(), shape.y(),
                dirX, dirY, points, shape.golden(), running));
    }

    private void finishCombo(int count) {
        stats.bestCombo = Math.max(stats.bestCombo, count);
        int bonus = Scoring.comboBonus(count, difficulty.pointMultiplier(), powerUps.scoreMultiplier());
        if (bonus > 0) {
            stats.combos++;
            score += bonus;
            events.add(new GameEvent.Combo(count, bonus, combo.finishedX(), combo.finishedY()));
        }
    }

    /** A Fractal Cube breaks into four Shards that burst outward. */
    public void spawnShards(Shape parent) {
        double base = rng.nextDouble() * Math.PI / 2;
        for (int i = 0; i < 4; i++) {
            double a = base + i * Math.PI / 2;
            double speed = 330 * difficulty.speedFactor();
            double vx = Math.cos(a) * speed + parent.vx() * 0.4;
            double vy = Math.sin(a) * speed + 260;
            incoming.add(new Shape(nextId(), ShapeType.SHARD, parent.golden(), false,
                    parent.x(), parent.y(), vx, vy));
        }
    }

    public void detonate(Bomb bomb) {
        combo.reset();
        boolean blocked = powerUps.consumeShield();
        String penalty;
        if (blocked) {
            penalty = "BLOCKED";
            events.add(new GameEvent.ShieldBlocked());
        } else {
            stats.bombsHit++;
            penalty = mode.applyBombPenalty(this);
        }
        events.add(new GameEvent.Bomb(bomb.id(), bomb.x(), bomb.y(), blocked, penalty));
    }

    /** A shape fell off the bottom. Only some shapes, in some modes, cost a life. */
    public void recordMiss(Shape shape, boolean penalizable) {
        if (!mode.scored()) {
            return;
        }
        if (penalizable) {
            stats.missed++;
        }
        boolean costsLife = penalizable && mode.missesCostLives();
        boolean blocked = false;
        if (costsLife) {
            blocked = powerUps.consumeShield();
            if (blocked) {
                events.add(new GameEvent.ShieldBlocked());
            } else {
                loseLife();
            }
        }
        events.add(new GameEvent.Miss(shape.id(), shape.code(), shape.x(),
                costsLife && !blocked, blocked));
    }

    public void collectPowerUp(PowerOrb orb) {
        PowerUpType type = orb.type();
        stats.powerUps++;
        events.add(new GameEvent.PowerUp(orb.id(), type.name(), type.displayName(),
                orb.x(), orb.y(), type.duration()));
        switch (type) {
            case HEART:
                mode.onExtraLife(this);
                break;
            case NOVA:
                nova();
                break;
            default:
                powerUps.activate(type);
                break;
        }
        stats.maxActivePowerUps = Math.max(stats.maxActivePowerUps, powerUps.activeCount());
    }

    /** Slices every shape currently on screen. */
    private void nova() {
        int count = 0;
        for (Entity e : entities) {
            if (e.alive() && e.novaTarget() && e.y() > 0) {
                double a = rng.nextDouble() * Math.PI * 2;
                e.kill();
                e.onSliced(this, Math.cos(a), Math.sin(a));
                count++;
            }
        }
        stats.bestNova = Math.max(stats.bestNova, count);
        events.add(new GameEvent.Nova(count));
    }

    public void loseLife() {
        if (lives <= 0) {
            return;
        }
        lives--;
        stats.livesLost++;
        events.add(new GameEvent.Lives(lives, -1));
    }

    public void addLife() {
        if (lives < mode.maxLives()) {
            lives++;
            events.add(new GameEvent.Lives(lives, 1));
        }
    }

    public void addTime(double seconds) {
        if (mode.timeLimit() <= 0) {
            return;
        }
        timeLeft = Math.max(0, timeLeft + seconds);
        events.add(new GameEvent.TimeChange(seconds));
    }

    // ---- Input ----------------------------------------------------------------------------

    public void bladeMove(double x, double y, double tMillis) {
        blade.move(x, y, tMillis);
    }

    public void bladeUp() {
        blade.lift();
    }

    // ---- Plumbing -------------------------------------------------------------------------

    public int nextId() {
        return nextId++;
    }

    /** Adds an entity at the end of the current step (safe to call during iteration). */
    public void addEntity(Entity e) {
        incoming.add(e);
    }

    public void addEvent(GameEvent e) {
        events.add(e);
    }

    public void setWidth(double width) {
        this.width = width;
    }

    public Entity findEntity(int id) {
        for (Entity e : entities) {
            if (e.id() == id) {
                return e;
            }
        }
        return null;
    }

    /** Ends the game immediately, as if time ran out. */
    public void endNow() {
        over = true;
        powerUps.clear();
    }

    /**
     * Serializes this frame and clears the pending events.
     *
     * @param clockMillis engine wall clock, so the UI can time-stamp frames without jitter
     */
    public void writeState(JsonWriter w, boolean paused, double clockMillis) {
        w.beginObject()
                .field("type", "state")
                .field("clk", clockMillis, 1)
                .field("mode", mode.id())
                .field("demo", demo)
                .field("paused", paused)
                .field("over", over)
                .field("score", score)
                .field("lives", lives)
                .field("maxLives", mode.maxLives())
                .field("level", difficulty.level())
                .field("mult", difficulty.pointMultiplier())
                .field("progress", difficulty.levelProgress(), 3)
                .field("intensity", difficulty.intensity(), 3)
                .field("time", timeLeft, 2)
                .field("timeLimit", mode.timeLimit(), 0)
                .field("ts", powerUps.timeScale())
                .field("g", difficulty.gravity(), 1)
                .field("combo", combo.current())
                .field("w", width, 1);

        w.key("pu").beginArray();
        for (Map.Entry<PowerUpType, Double> p : powerUps.active().entrySet()) {
            w.beginArray().value(p.getKey().name()).value(p.getValue(), 2)
                    .value(p.getKey().duration(), 1).endArray();
        }
        w.endArray();

        w.key("e").beginArray();
        for (Entity e : entities) {
            if (!e.alive()) {
                continue;
            }
            w.beginArray().value(e.id()).value(e.code())
                    .value(e.x(), 1).value(e.y(), 1).value(e.vx(), 1).value(e.vy(), 1)
                    .value(e.flags()).endArray();
        }
        w.endArray();

        if (pilot != null) {
            w.key("bot").beginArray().value(pilot.x(), 1).value(pilot.y(), 1)
                    .value(pilot.down()).endArray();
        }

        w.key("ev").beginArray();
        for (GameEvent ev : events) {
            ev.write(w);
        }
        w.endArray();
        w.endObject();
        events.clear();
    }

    // ---- Accessors ------------------------------------------------------------------------

    public GameMode mode() { return mode; }
    public boolean demo() { return demo; }
    public Random rng() { return rng; }
    public double width() { return width; }
    public Difficulty difficulty() { return difficulty; }
    public PowerUpManager powerUps() { return powerUps; }
    public GameStats stats() { return stats; }
    public int score() { return score; }
    public int lives() { return lives; }
    public double timeLeft() { return timeLeft; }
    public double realTime() { return realTime; }
    public double simTime() { return simTime; }
    public boolean over() { return over; }
    public int currentCombo() { return combo.current(); }
    public List<Achievement> unlockedThisGame() { return unlockedThisGame; }
    public List<Entity> entities() { return Collections.unmodifiableList(entities); }
    public List<GameEvent> pendingEvents() { return Collections.unmodifiableList(events); }
}
