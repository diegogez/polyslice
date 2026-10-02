package com.polyslice.ai;

import com.polyslice.entity.Entity;
import com.polyslice.entity.PowerOrb;
import com.polyslice.entity.Shape;
import com.polyslice.game.GameSession;
import com.polyslice.math.Geometry;

import java.util.Random;

/**
 * A simple bot that plays Demo mode. It goes after the most valuable nearby target, swipes
 * through it with some overshoot, and lifts the blade and repositions whenever its path would
 * cross a bomb. Its input goes through exactly the same blade API a human uses.
 */
public final class AutoPilot {

    private static final double SPEED = 3300.0;
    private static final double BOMB_MARGIN = 48.0;
    private static final double REACTION_AGE = 0.28;

    private final Random rng;
    private double x = 800;
    private double y = 300;
    private boolean down;
    private int targetId = -1;
    private double overshoot = 80;
    private double wobble;
    private double clockMs;

    public AutoPilot(Random rng) {
        this.rng = rng;
    }

    public void update(GameSession s, double dt) {
        clockMs += dt * 1000.0;

        Entity target = targetId >= 0 ? s.findEntity(targetId) : null;
        if (target == null || !target.alive()) {
            target = pickTarget(s);
            targetId = target == null ? -1 : target.id();
            overshoot = 50 + rng.nextDouble() * 70;
            wobble = (rng.nextDouble() - 0.5) * 30;
        }

        if (target == null) {
            if (down) {
                s.bladeUp();
                down = false;
            }
            // Drift slowly toward the middle while waiting; too slow to cut anything.
            x += (s.width() / 2 - x) * Math.min(1, dt * 1.5);
            y += (GameSession.HEIGHT * 0.45 - y) * Math.min(1, dt * 1.5);
            return;
        }

        // Aim a little ahead of the target and past it, so the blade cuts straight through.
        double lead = 0.06;
        double tx = target.x() + target.vx() * lead;
        double ty = target.y() + target.vy() * lead;
        double dx = tx - x;
        double dy = ty - y;
        double dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
            dist = 1e-6;
        }
        double ux = dx / dist;
        double uy = dy / dist;
        double aimX = tx + ux * overshoot - uy * wobble;
        double aimY = ty + uy * overshoot + ux * wobble;

        double ax = aimX - x;
        double ay = aimY - y;
        double aimDist = Math.hypot(ax, ay);
        double step = SPEED * dt;
        boolean arrives = aimDist <= step;
        double nx = arrives ? aimX : x + ax / aimDist * step;
        double ny = arrives ? aimY : y + ay / aimDist * step;

        if (pathHitsBomb(s, x, y, nx, ny)) {
            hopAround(s, target);
            return;
        }

        x = nx;
        y = ny;
        s.bladeMove(x, y, clockMs);
        down = true;

        if (arrives) {
            targetId = -1;
            // Occasionally lift between targets, like a person would.
            if (rng.nextDouble() < 0.25) {
                s.bladeUp();
                down = false;
            }
        }
    }

    private Entity pickTarget(GameSession s) {
        Entity best = null;
        double bestScore = 0;
        for (Entity e : s.entities()) {
            if (!e.alive() || e.hazardous() || e.age() < REACTION_AGE) {
                continue;
            }
            if (e.y() < GameSession.HEIGHT * 0.1 || e.y() > GameSession.HEIGHT * 0.97
                    || e.x() < 0 || e.x() > s.width()) {
                continue;
            }
            double value;
            if (e instanceof Shape) {
                Shape sh = (Shape) e;
                value = sh.type().basePoints() * (sh.golden() ? 5 : 1);
            } else if (e instanceof PowerOrb) {
                value = 70;
            } else {
                value = 10;
            }
            // Prefer things about to fall out of reach.
            if (e.vy() < 0 && e.y() < GameSession.HEIGHT * 0.35) {
                value *= 1.8;
            }
            double score = value / (Math.hypot(e.x() - x, e.y() - y) + 220);
            if (score > bestScore) {
                bestScore = score;
                best = e;
            }
        }
        return best;
    }

    private boolean pathHitsBomb(GameSession s, double x1, double y1, double x2, double y2) {
        for (Entity e : s.entities()) {
            if (e.alive() && e.hazardous()
                    && Geometry.segmentHitsCircle(x1, y1, x2, y2, e.x(), e.y(), e.radius() + BOMB_MARGIN)) {
                return true;
            }
        }
        return false;
    }

    /** Lift the blade and re-enter from a direction with no bombs in the way. */
    private void hopAround(GameSession s, Entity target) {
        if (down) {
            s.bladeUp();
            down = false;
        }
        double start = rng.nextDouble() * Math.PI * 2;
        for (int i = 0; i < 12; i++) {
            double a = start + i * Math.PI / 6;
            double px = target.x() + Math.cos(a) * 170;
            double py = target.y() + Math.sin(a) * 170;
            if (!pathHitsBomb(s, px, py, target.x(), target.y())
                    && !pathHitsBomb(s, px, py, px, py)) {
                x = px;
                y = py;
                return;
            }
        }
        // Boxed in by bombs: give up on this target.
        targetId = -1;
    }

    public double x() { return x; }
    public double y() { return y; }
    public boolean down() { return down; }
}
