package com.polyslice.game;

import com.polyslice.entity.Shape;
import com.polyslice.entity.ShapeType;

/** The scoring formulas, kept in one place so they're easy to tune and to test. */
public final class Scoring {

    /** Combos start paying out at this many shapes in one swipe. */
    public static final int MIN_COMBO = 3;
    public static final int COMBO_POINTS_PER_SHAPE = 10;

    private Scoring() {
    }

    /** points = base x golden x level multiplier x power-up multiplier */
    public static int slicePoints(ShapeType type, boolean golden, double levelMultiplier,
                                  double powerMultiplier) {
        double pts = type.basePoints()
                * (golden ? Shape.GOLDEN_MULTIPLIER : 1)
                * levelMultiplier
                * powerMultiplier;
        return (int) Math.round(pts);
    }

    /**
     * Bonus for slicing {@code count} shapes in one swipe: 10 x n(n-1)/2. It grows
     * quadratically, so a 6-combo (150) is worth five times a 3-combo (30).
     */
    public static int comboBonus(int count, double levelMultiplier, double powerMultiplier) {
        if (count < MIN_COMBO) {
            return 0;
        }
        double pts = COMBO_POINTS_PER_SHAPE * count * (count - 1) / 2.0
                * levelMultiplier * powerMultiplier;
        return (int) Math.round(pts);
    }
}
