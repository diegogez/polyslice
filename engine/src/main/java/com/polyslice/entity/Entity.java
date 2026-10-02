package com.polyslice.entity;

import com.polyslice.game.GameSession;

/**
 * Anything that flies across the arena and can be hit by the blade.
 *
 * <p>Subclasses decide what slicing (and missing) them means. The session only knows about
 * {@code Entity}, so new object kinds can be added without touching the collision code.
 */
public abstract class Entity {

    private final int id;
    private final double radius;
    protected double x;
    protected double y;
    protected double vx;
    protected double vy;
    private double prevX;
    private double prevY;
    private boolean alive = true;
    private double age;

    protected Entity(int id, double radius, double x, double y, double vx, double vy) {
        this.id = id;
        this.radius = radius;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.prevX = x;
        this.prevY = y;
    }

    /** Short code the renderer uses to pick a model, e.g. {@code "CUBE"} or {@code "PU_FREEZE"}. */
    public abstract String code();

    /** Called once when the blade cuts this entity. (dirX, dirY) is the unit blade direction. */
    public abstract void onSliced(GameSession session, double dirX, double dirY);

    /** Called once when this entity falls off the bottom of the arena without being sliced. */
    public void onMissed(GameSession session) {
    }

    /** Bit flags sent to the renderer (bit 0 = golden). */
    public int flags() {
        return 0;
    }

    /** Hazards (bombs) get a tighter hitbox and ignore the Mega Blade bonus. */
    public boolean hazardous() {
        return false;
    }

    /** Whether a Nova power-up should auto-slice this entity. */
    public boolean novaTarget() {
        return false;
    }

    /** Integrates one physics step under constant gravity. */
    public void step(double dt, double gravity) {
        prevX = x;
        prevY = y;
        x += vx * dt;
        y += vy * dt - 0.5 * gravity * dt * dt;
        vy -= gravity * dt;
        age += dt;
    }

    public void kill() {
        alive = false;
    }

    public int id() { return id; }
    public double radius() { return radius; }
    public double x() { return x; }
    public double y() { return y; }
    /** Position before the latest physics step (what the player was looking at). */
    public double prevX() { return prevX; }
    public double prevY() { return prevY; }
    public double vx() { return vx; }
    public double vy() { return vy; }
    public double age() { return age; }
    public boolean alive() { return alive; }
}
