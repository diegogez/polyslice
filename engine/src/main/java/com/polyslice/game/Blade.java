package com.polyslice.game;

import java.util.ArrayList;
import java.util.List;

/**
 * Turns the stream of pointer samples from the UI into blade segments.
 *
 * <p>Each sample carries the UI's own timestamp, so blade speed is measured from when the
 * pointer actually moved, not from when the message arrived.
 */
public final class Blade {

    /** Segments slower than this (world units per second) don't cut. Resting the cursor on a shape does nothing. */
    public static final double MIN_SLICE_SPEED = 380.0;

    /** One straight piece of the blade path. */
    public record Segment(double x1, double y1, double x2, double y2, double speed) {
        public double dirX() {
            double len = Math.hypot(x2 - x1, y2 - y1);
            return len < 1e-9 ? 1 : (x2 - x1) / len;
        }

        public double dirY() {
            double len = Math.hypot(x2 - x1, y2 - y1);
            return len < 1e-9 ? 0 : (y2 - y1) / len;
        }

        public boolean cuts() {
            return speed >= MIN_SLICE_SPEED;
        }
    }

    private final List<Segment> pending = new ArrayList<>();
    private boolean hasLast;
    private double lastX;
    private double lastY;
    private double lastT;
    private boolean strokeActive;

    /** Adds a pointer sample at time {@code tMillis}. The first sample of a stroke only sets the anchor. */
    public void move(double x, double y, double tMillis) {
        if (hasLast) {
            double dist = Math.hypot(x - lastX, y - lastY);
            double dt = (tMillis - lastT) / 1000.0;
            double speed;
            if (dt > 1e-6) {
                speed = dist / dt;
            } else {
                speed = dist > 0 ? Double.MAX_VALUE : 0;
            }
            // A long gap between samples means the pointer stalled; start a fresh segment chain.
            if (dt < 0.25 && dist > 0) {
                pending.add(new Segment(lastX, lastY, x, y, speed));
            }
        }
        hasLast = true;
        strokeActive = true;
        lastX = x;
        lastY = y;
        lastT = tMillis;
    }

    /** The pointer was released (or left the window): the stroke is over. */
    public void lift() {
        hasLast = false;
        strokeActive = false;
    }

    /** Returns and clears the segments recorded since the last call. */
    public List<Segment> drain() {
        if (pending.isEmpty()) {
            return List.of();
        }
        List<Segment> out = new ArrayList<>(pending);
        pending.clear();
        return out;
    }

    public boolean strokeActive() {
        return strokeActive;
    }
}
