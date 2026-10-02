package com.polyslice.entity;

import com.polyslice.game.GameSession;

/** A point-scoring shape. Golden shapes are rare and worth 5x. */
public final class Shape extends Entity {

    public static final int FLAG_GOLDEN = 1;
    public static final int GOLDEN_MULTIPLIER = 5;

    private final ShapeType type;
    private final boolean golden;
    private final boolean penalizeMiss;

    public Shape(int id, ShapeType type, boolean golden, boolean penalizeMiss,
                 double x, double y, double vx, double vy) {
        super(id, type.radius(), x, y, vx, vy);
        this.type = type;
        this.golden = golden;
        this.penalizeMiss = penalizeMiss && type.penalizesMiss();
    }

    public ShapeType type() { return type; }
    public boolean golden() { return golden; }

    @Override
    public String code() {
        return type.name();
    }

    @Override
    public int flags() {
        return golden ? FLAG_GOLDEN : 0;
    }

    @Override
    public boolean novaTarget() {
        return true;
    }

    @Override
    public void onSliced(GameSession session, double dirX, double dirY) {
        session.awardSlice(this, dirX, dirY);
        if (type == ShapeType.FRACTAL) {
            session.spawnShards(this);
        }
    }

    @Override
    public void onMissed(GameSession session) {
        session.recordMiss(this, penalizeMiss);
    }
}
