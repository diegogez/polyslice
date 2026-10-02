package com.polyslice.entity;

import com.polyslice.game.GameSession;

/** Never slice these. What happens on contact is up to the active game mode. */
public final class Bomb extends Entity {

    public static final double RADIUS = 54;

    public Bomb(int id, double x, double y, double vx, double vy) {
        super(id, RADIUS, x, y, vx, vy);
    }

    @Override
    public String code() {
        return "BOMB";
    }

    @Override
    public boolean hazardous() {
        return true;
    }

    @Override
    public void onSliced(GameSession session, double dirX, double dirY) {
        session.detonate(this);
    }
}
