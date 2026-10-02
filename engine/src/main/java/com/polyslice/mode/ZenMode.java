package com.polyslice.mode;

import com.polyslice.game.GameSession;
import com.polyslice.powerup.PowerUpType;

/** 90 seconds, no bombs, no lives. Just you and a lot of shapes. */
public final class ZenMode extends GameMode {

    @Override
    public String id() {
        return "ZEN";
    }

    @Override
    public String displayName() {
        return "Zen";
    }

    @Override
    public String description() {
        return "90 seconds. No bombs, no lives. Chase the highest combo you can.";
    }

    @Override
    public double timeLimit() {
        return 90;
    }

    @Override
    public double difficultyRate() {
        return 1.6;
    }

    @Override
    public boolean bombsEnabled() {
        return false;
    }

    @Override
    public boolean allowsPowerUp(PowerUpType type) {
        // Nothing to shield against without bombs or lives.
        return type != PowerUpType.SHIELD;
    }

    @Override
    public String applyBombPenalty(GameSession session) {
        return "";
    }
}
