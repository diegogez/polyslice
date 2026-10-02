package com.polyslice.game;

import com.polyslice.entity.Bomb;
import com.polyslice.entity.Entity;
import com.polyslice.entity.PowerOrb;
import com.polyslice.entity.Shape;
import com.polyslice.entity.ShapeType;
import com.polyslice.powerup.PowerUpType;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Decides what to throw and when. Wave size, timing, bomb odds and which shapes are allowed
 * all come from {@link Difficulty}; the spawner adds variety with a few launch patterns.
 */
public final class Spawner {

    /** Bombs never appear in the first few seconds of a game. */
    public static final double BOMB_GRACE_SECONDS = 6.0;
    public static final double ORB_COOLDOWN = 6.5;
    public static final double FRENZY_INTERVAL = 0.14;

    private enum Pattern { SCATTER, STAGGER, FOUNTAIN, CROSSFIRE }

    private enum Kind { SHAPE, BOMB }

    /** A launch scheduled a short time in the future (for staggered patterns). */
    private static final class Pending {
        double delay;
        final Runnable launch;

        Pending(double delay, Runnable launch) {
            this.delay = delay;
            this.launch = launch;
        }
    }

    private final List<Pending> queue = new ArrayList<>();
    private double waveTimer = 0.9;
    private double frenzyTimer;
    private double orbCooldown = 3.0;
    private double elapsed;

    public void update(GameSession s, double dt) {
        elapsed += dt;
        orbCooldown -= dt;

        for (Iterator<Pending> it = queue.iterator(); it.hasNext(); ) {
            Pending p = it.next();
            p.delay -= dt;
            if (p.delay <= 0) {
                it.remove();
                p.launch.run();
            }
        }

        if (s.powerUps().isActive(PowerUpType.FRENZY)) {
            frenzyTimer -= dt;
            if (frenzyTimer <= 0) {
                launchFromSide(s, s.rng().nextBoolean(), randomShapeType(s), false);
                frenzyTimer = FRENZY_INTERVAL;
            }
        }

        waveTimer -= dt;
        if (waveTimer <= 0) {
            spawnWave(s);
            Difficulty d = s.difficulty();
            waveTimer = d.spawnInterval() * s.mode().spawnRateFactor() * range(s.rng(), 0.85, 1.15);
        }
    }

    private void spawnWave(GameSession s) {
        Random rng = s.rng();
        Difficulty d = s.difficulty();
        int min = d.minWaveSize();
        int max = Math.max(min, d.maxWaveSize());
        int count = min + rng.nextInt(max - min + 1);
        Pattern pattern = choosePattern(rng, d.level());

        boolean bombsAllowed = s.mode().bombsEnabled()
                && !s.powerUps().isActive(PowerUpType.FRENZY)
                && d.clock() >= BOMB_GRACE_SECONDS;

        int bombs = 0;
        for (int i = 0; i < count; i++) {
            // Never make a wave that is all bombs.
            boolean bomb = bombsAllowed && rng.nextDouble() < d.bombChance() && bombs < count - 1;
            if (bomb) {
                bombs++;
            }
            Kind kind = bomb ? Kind.BOMB : Kind.SHAPE;
            double delay;
            double[] lane;
            switch (pattern) {
                case STAGGER:
                    delay = i * 0.16;
                    lane = laneFor(s, (i % 2 == 0) ? 0.2 + 0.1 * (i / 2) : 0.8 - 0.1 * (i / 2), 0.5);
                    break;
                case FOUNTAIN:
                    delay = i * 0.05;
                    lane = new double[] {0.5 + range(rng, -0.04, 0.04),
                            count == 1 ? 0.5 : 0.18 + 0.64 * i / (count - 1)};
                    break;
                case CROSSFIRE:
                    delay = (i / 2) * 0.22;
                    lane = (i % 2 == 0)
                            ? new double[] {range(rng, 0.08, 0.2), range(rng, 0.62, 0.85)}
                            : new double[] {range(rng, 0.8, 0.92), range(rng, 0.15, 0.38)};
                    break;
                case SCATTER:
                default:
                    delay = range(rng, 0, 0.12);
                    lane = new double[] {range(rng, 0.12, 0.88), range(rng, 0.18, 0.82)};
                    break;
            }
            final double[] l = lane;
            schedule(delay, () -> launchFromBottom(s, kind, l[0], l[1]));
        }

        boolean orbOnScreen = s.entities().stream().anyMatch(e -> e instanceof PowerOrb);
        double orbChance = d.powerUpChance() * s.mode().powerUpRate();
        if (orbChance > 0 && orbCooldown <= 0 && !orbOnScreen && rng.nextDouble() < orbChance) {
            PowerUpType type = choosePowerUp(s);
            if (type != null) {
                orbCooldown = ORB_COOLDOWN;
                schedule(0.25, () -> launchOrb(s, type));
            }
        }
    }

    private static double[] laneFor(GameSession s, double startFrac, double endFrac) {
        double j = range(s.rng(), -0.03, 0.03);
        return new double[] {startFrac + j, endFrac + range(s.rng(), -0.15, 0.15)};
    }

    private Pattern choosePattern(Random rng, int level) {
        if (level < 2) {
            return Pattern.SCATTER;
        }
        double r = rng.nextDouble();
        if (r < 0.55) return Pattern.SCATTER;
        if (r < 0.75) return Pattern.STAGGER;
        if (r < 0.88) return Pattern.FOUNTAIN;
        return Pattern.CROSSFIRE;
    }

    private void schedule(double delay, Runnable launch) {
        if (delay <= 0) {
            launch.run();
        } else {
            queue.add(new Pending(delay, launch));
        }
    }

    /** Launch from below the arena so the object peaks somewhere in the upper half of the screen. */
    private void launchFromBottom(GameSession s, Kind kind, double startFrac, double endFrac) {
        Random rng = s.rng();
        double w = s.width();
        double h = GameSession.HEIGHT;
        double g = s.difficulty().gravity();
        double x0 = startFrac * w;
        double radius = kind == Kind.BOMB ? Bomb.RADIUS : 58;
        double y0 = -radius;
        double apex = range(rng, 0.56, 0.93) * h;
        double vy = Math.sqrt(2 * g * (apex - y0));
        double flight = 2 * vy / g;
        double vx = (endFrac * w - x0) / flight;

        Entity e;
        if (kind == Kind.BOMB) {
            e = new Bomb(s.nextId(), x0, y0, vx, vy);
        } else {
            ShapeType type = randomShapeType(s);
            boolean golden = rng.nextDouble() < s.difficulty().goldenChance();
            e = new Shape(s.nextId(), type, golden, true, x0, -type.radius(), vx, vy);
        }
        s.addEntity(e);
    }

    /** Frenzy shapes fly in from the left or right edge. They never cost a life. */
    private void launchFromSide(GameSession s, boolean fromLeft, ShapeType type, boolean golden) {
        Random rng = s.rng();
        double sf = s.difficulty().speedFactor();
        double x0 = fromLeft ? -type.radius() : s.width() + type.radius();
        double y0 = range(rng, 0.12, 0.45) * GameSession.HEIGHT;
        double vx = range(rng, 480, 720) * sf * (fromLeft ? 1 : -1);
        double vy = range(rng, 380, 680) * sf;
        s.addEntity(new Shape(s.nextId(), type, golden, false, x0, y0, vx, vy));
    }

    private void launchOrb(GameSession s, PowerUpType type) {
        Random rng = s.rng();
        double w = s.width();
        double g = s.difficulty().gravity();
        double x0 = range(rng, 0.25, 0.75) * w;
        double y0 = -PowerOrb.RADIUS;
        double apex = range(rng, 0.5, 0.78) * GameSession.HEIGHT;
        double vy = Math.sqrt(2 * g * (apex - y0));
        double vx = (range(rng, 0.3, 0.7) * w - x0) / (2 * vy / g);
        s.addEntity(new PowerOrb(s.nextId(), type, x0, y0, vx, vy));
    }

    /** Weighted pick from the shapes unlocked at the current level. */
    static ShapeType randomShapeType(GameSession s) {
        int level = s.difficulty().level();
        double total = 0;
        for (ShapeType t : ShapeType.values()) {
            total += t.weightAt(level);
        }
        double r = s.rng().nextDouble() * total;
        for (ShapeType t : ShapeType.values()) {
            r -= t.weightAt(level);
            if (r <= 0 && t.weightAt(level) > 0) {
                return t;
            }
        }
        return ShapeType.CUBE;
    }

    private PowerUpType choosePowerUp(GameSession s) {
        List<PowerUpType> options = new ArrayList<>();
        double total = 0;
        for (PowerUpType t : PowerUpType.values()) {
            if (!s.mode().allowsPowerUp(t)) continue;
            if (t == PowerUpType.HEART && s.mode().startingLives() > 0 && s.lives() >= s.mode().maxLives()) continue;
            if (t == PowerUpType.NOVA && s.difficulty().level() < 2) continue;
            if (t.isTimed() && s.powerUps().isActive(t)) continue;
            options.add(t);
            total += t.weight();
        }
        double r = s.rng().nextDouble() * total;
        for (PowerUpType t : options) {
            r -= t.weight();
            if (r <= 0) {
                return t;
            }
        }
        return options.isEmpty() ? null : options.get(options.size() - 1);
    }

    static double range(Random rng, double lo, double hi) {
        return lo + rng.nextDouble() * (hi - lo);
    }
}
