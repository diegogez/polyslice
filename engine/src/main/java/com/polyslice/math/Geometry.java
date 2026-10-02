package com.polyslice.math;

/** Pure geometry helpers used for blade collision. */
public final class Geometry {

    private Geometry() {
    }

    /**
     * Squared distance from point (px, py) to the segment (ax, ay)-(bx, by).
     * Works for zero-length segments (it becomes point-to-point distance).
     */
    public static double distSqPointToSegment(double px, double py,
                                              double ax, double ay, double bx, double by) {
        double abx = bx - ax;
        double aby = by - ay;
        double lenSq = abx * abx + aby * aby;
        double t = 0;
        if (lenSq > 1e-12) {
            t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
            t = clamp(t, 0, 1);
        }
        double cx = ax + abx * t - px;
        double cy = ay + aby * t - py;
        return cx * cx + cy * cy;
    }

    /** True when the segment passes within {@code radius} of the circle's center. */
    public static boolean segmentHitsCircle(double ax, double ay, double bx, double by,
                                            double cx, double cy, double radius) {
        return distSqPointToSegment(cx, cy, ax, ay, bx, by) <= radius * radius;
    }

    public static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    public static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }
}
