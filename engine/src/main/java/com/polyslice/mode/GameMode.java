package com.polyslice.mode;

import com.polyslice.game.GameSession;
import com.polyslice.powerup.PowerUpType;

import java.util.List;

/**
 * Strategy object that defines one way to play. The session asks the mode how to react to
 * misses, bombs and extra lives, and when the game is over. Adding a new mode means adding
 * one subclass.
 */
public abstract class GameMode {

    public abstract String id();

    public abstract String displayName();

    public abstract String description();

    /** Lives at the start of the game; 0 means this mode doesn't use lives. */
    public int startingLives() {
        return 0;
    }

    public int maxLives() {
        return 5;
    }

    /** Length of the game in seconds; 0 means untimed. */
    public double timeLimit() {
        return 0;
    }

    /** How fast the difficulty clock runs relative to game time. */
    public double difficultyRate() {
        return 1.0;
    }

    /** Multiplier on how often waves are launched. */
    public double spawnRateFactor() {
        return 1.0;
    }

    public boolean bombsEnabled() {
        return true;
    }

    /** Multiplier on power-up spawn chance; 0 disables power-ups. */
    public double powerUpRate() {
        return 1.0;
    }

    public boolean allowsPowerUp(PowerUpType type) {
        return true;
    }

    /** False for the menu's background mode: no score, no records. */
    public boolean scored() {
        return true;
    }

    public boolean missesCostLives() {
        return startingLives() > 0;
    }

    /** Applies the bomb penalty and returns a short label for the UI, such as "-1 LIFE". */
    public abstract String applyBombPenalty(GameSession session);

    /** What the Extra Life power-up does in this mode. */
    public void onExtraLife(GameSession session) {
        session.addTime(5);
    }

    public boolean isOver(GameSession session) {
        if (timeLimit() > 0) {
            return session.timeLeft() <= 0;
        }
        if (startingLives() > 0) {
            return session.lives() <= 0;
        }
        return false;
    }

    /** Headline for the results screen. */
    public String endReason() {
        return timeLimit() > 0 ? "TIME'S UP" : "GAME OVER";
    }

    // ---- Registry -------------------------------------------------------------------------

    private static final List<GameMode> PLAYABLE =
            List.of(new ClassicMode(), new ArcadeMode(), new ZenMode());

    public static List<GameMode> playable() {
        return PLAYABLE;
    }

    public static GameMode attract() {
        return new AttractMode();
    }

    /** Looks up a playable mode by id, falling back to Classic. */
    public static GameMode byId(String id) {
        for (GameMode m : PLAYABLE) {
            if (m.id().equalsIgnoreCase(id)) {
                return m;
            }
        }
        return PLAYABLE.get(0);
    }
}
