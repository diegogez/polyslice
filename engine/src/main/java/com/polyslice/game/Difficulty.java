package com.polyslice.game;

import static com.polyslice.math.Geometry.lerp;

/**
 * The difficulty curve. Everything is a function of a single "difficulty clock" that the
 * game mode advances (Arcade runs it faster than Classic).
 *
 * <p>The level goes up every {@link #LEVEL_SECONDS} seconds and directly sets the point
 * multiplier. The intensity value rises smoothly from 0 toward 1 and drives spawn rate, wave
 * size, bomb odds and launch speed, so the game keeps getting harder without a hard cap.
 */
public final class Difficulty {

    public static final double LEVEL_SECONDS = 20.0;
    public static final double BASE_GRAVITY = 900.0;
    /** Seconds of difficulty clock to reach ~63% of max intensity. */
    public static final double INTENSITY_TAU = 100.0;
    public static final double MULTIPLIER_PER_LEVEL = 0.25;

    private double clock;

    /** Advances the clock. Returns true if this step crossed into a new level. */
    public boolean advance(double seconds) {
        int before = level();
        clock += Math.max(0, seconds);
        return level() > before;
    }

    public double clock() {
        return clock;
    }

    public int level() {
        return 1 + (int) (clock / LEVEL_SECONDS);
    }

    /** Fraction of the way to the next level, from 0 to 1. */
    public double levelProgress() {
        return (clock % LEVEL_SECONDS) / LEVEL_SECONDS;
    }

    /** Smoothly rises from 0 to 1 over the course of a game. */
    public double intensity() {
        return 1.0 - Math.exp(-clock / INTENSITY_TAU);
    }

    /** Points multiplier for the current level: 1.0x, 1.25x, 1.5x, ... */
    public double pointMultiplier() {
        return 1.0 + MULTIPLIER_PER_LEVEL * (level() - 1);
    }

    /** Seconds between waves. */
    public double spawnInterval() {
        return lerp(1.55, 0.42, intensity());
    }

    public int minWaveSize() {
        return 1 + (int) (intensity() * 2.2);
    }

    public int maxWaveSize() {
        return 2 + (int) (intensity() * 4.6);
    }

    /** Probability that any given launched object is a bomb. */
    public double bombChance() {
        return lerp(0.07, 0.24, intensity());
    }

    /** Multiplier on launch speed. Gravity scales with its square so arc heights stay on screen. */
    public double speedFactor() {
        return lerp(1.0, 1.42, intensity());
    }

    public double gravity() {
        double s = speedFactor();
        return BASE_GRAVITY * s * s;
    }

    /** Chance per wave that a power-up orb joins it. */
    public double powerUpChance() {
        return lerp(0.08, 0.13, intensity());
    }

    /** Chance that a shape spawns golden (5x points). */
    public double goldenChance() {
        return lerp(0.02, 0.05, intensity());
    }
}
