package com.polyslice.mode;

import com.polyslice.game.GameSession;

/** The slow, harmless background game behind the menus. Slicing works, but nothing counts. */
public final class AttractMode extends GameMode {

    @Override
    public String id() {
        return "ATTRACT";
    }

    @Override
    public String displayName() {
        return "Attract";
    }

    @Override
    public String description() {
        return "Menu background.";
    }

    @Override
    public double difficultyRate() {
        return 0;
    }

    @Override
    public double spawnRateFactor() {
        return 1.7;
    }

    @Override
    public boolean bombsEnabled() {
        return false;
    }

    @Override
    public double powerUpRate() {
        return 0;
    }

    @Override
    public boolean scored() {
        return false;
    }

    @Override
    public String applyBombPenalty(GameSession session) {
        return "";
    }
}
