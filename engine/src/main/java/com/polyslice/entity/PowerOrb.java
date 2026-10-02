package com.polyslice.entity;

import com.polyslice.game.GameSession;
import com.polyslice.powerup.PowerUpType;

/** A glowing orb that grants a power-up when sliced. Missing it costs nothing. */
public final class PowerOrb extends Entity {

    public static final double RADIUS = 50;

    private final PowerUpType type;

    public PowerOrb(int id, PowerUpType type, double x, double y, double vx, double vy) {
        super(id, RADIUS, x, y, vx, vy);
        this.type = type;
    }

    public PowerUpType type() { return type; }

    @Override
    public String code() {
        return "PU_" + type.name();
    }

    @Override
    public void onSliced(GameSession session, double dirX, double dirY) {
        session.collectPowerUp(this);
    }
}
