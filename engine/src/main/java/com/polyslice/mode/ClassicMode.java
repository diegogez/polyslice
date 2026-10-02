package com.polyslice.mode;

import com.polyslice.game.GameSession;

/** Three lives, no clock. Dropping a shape or hitting a bomb costs a life. */
public final class ClassicMode extends GameMode {

    @Override
    public String id() {
        return "CLASSIC";
    }

    @Override
    public String displayName() {
        return "Classic";
    }

    @Override
    public String description() {
        return "3 lives. Don't drop shapes, don't touch bombs. It never stops getting faster.";
    }

    @Override
    public int startingLives() {
        return 3;
    }

    @Override
    public String applyBombPenalty(GameSession session) {
        session.loseLife();
        return "-1 LIFE";
    }

    @Override
    public void onExtraLife(GameSession session) {
        session.addLife();
    }
}
