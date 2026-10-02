package com.polyslice.mode;

import com.polyslice.game.GameSession;

/** 60 seconds, a fast difficulty ramp, extra power-ups. Bombs cost time instead of lives. */
public final class ArcadeMode extends GameMode {

    public static final double BOMB_TIME_PENALTY = 5.0;

    @Override
    public String id() {
        return "ARCADE";
    }

    @Override
    public String displayName() {
        return "Arcade";
    }

    @Override
    public String description() {
        return "60 seconds, a steep difficulty ramp and extra power-ups. Bombs cost 5 seconds.";
    }

    @Override
    public double timeLimit() {
        return 60;
    }

    @Override
    public double difficultyRate() {
        return 2.5;
    }

    @Override
    public double powerUpRate() {
        return 1.8;
    }

    @Override
    public String applyBombPenalty(GameSession session) {
        session.addTime(-BOMB_TIME_PENALTY);
        return "-5 SEC";
    }
}
