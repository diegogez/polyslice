package com.polyslice.persist;

import com.polyslice.entity.ShapeType;
import com.polyslice.game.GameSession;

import java.util.function.Predicate;

/** Unlockable goals. Each one is a condition evaluated against the live game session. */
public enum Achievement {
    FIRST_CUT("First Cut", "Slice your first shape.",
            s -> s.stats().sliced >= 1),
    HAT_TRICK("Hat Trick", "Land a 3x combo.",
            s -> s.stats().bestCombo >= 3),
    PENTASLICE("Pentaslice", "Land a 5x combo.",
            s -> s.stats().bestCombo >= 5),
    GEOMETRY_STORM("Geometry Storm", "Land an 8x combo.",
            s -> s.stats().bestCombo >= 8),
    HEATING_UP("Heating Up", "Reach level 5.",
            s -> s.difficulty().level() >= 5),
    INFERNO("Inferno", "Reach level 10.",
            s -> s.difficulty().level() >= 10),
    FOUR_DIGITS("Four Digits", "Score 1,000 points in one game.",
            s -> s.score() >= 1_000),
    SHAPE_SHIFTER("Shape Shifter", "Score 10,000 points in one game.",
            s -> s.score() >= 10_000),
    MIDAS_TOUCH("Midas Touch", "Slice a golden shape.",
            s -> s.stats().goldenSliced >= 1),
    GEM_CUTTER("Gem Cutter", "Slice a Gem.",
            s -> s.stats().count(ShapeType.GEM) >= 1),
    FULLY_LOADED("Fully Loaded", "Have 3 power-ups active at once.",
            s -> s.stats().maxActivePowerUps >= 3),
    SUPERNOVA("Supernova", "Hit 6 or more shapes with a single Nova.",
            s -> s.stats().bestNova >= 6),
    CENTURION("Centurion", "Slice 100 shapes in one game.",
            s -> s.stats().sliced >= 100),
    UNTOUCHABLE("Untouchable", "Reach level 4 in Classic without losing a life.",
            s -> "CLASSIC".equals(s.mode().id()) && s.difficulty().level() >= 4
                    && s.stats().livesLost == 0);

    private final String displayName;
    private final String description;
    private final Predicate<GameSession> condition;

    Achievement(String displayName, String description, Predicate<GameSession> condition) {
        this.displayName = displayName;
        this.description = description;
        this.condition = condition;
    }

    public String displayName() { return displayName; }
    public String description() { return description; }

    public boolean isMet(GameSession session) {
        return condition.test(session);
    }
}
