package com.polyslice.test;

import com.polyslice.entity.ShapeType;
import com.polyslice.game.Scoring;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertEquals;

public class ScoringTest {

    @Test
    public void basePointsAtLevelOne() {
        assertEquals(10, Scoring.slicePoints(ShapeType.CUBE, false, 1.0, 1.0), "cube");
        assertEquals(75, Scoring.slicePoints(ShapeType.GEM, false, 1.0, 1.0), "gem");
    }

    @Test
    public void multipliersStack() {
        // golden (5x) * level 5 (2x) * double points (2x) = 20x
        assertEquals(200, Scoring.slicePoints(ShapeType.CUBE, true, 2.0, 2.0), "all multipliers");
        assertEquals(19, Scoring.slicePoints(ShapeType.PYRAMID, false, 1.25, 1.0), "rounds 18.75 up");
    }

    @Test
    public void comboBonusNeedsThreeAndGrowsQuadratically() {
        assertEquals(0, Scoring.comboBonus(2, 1.0, 1.0), "2 is not a combo");
        assertEquals(30, Scoring.comboBonus(3, 1.0, 1.0), "3-combo");
        assertEquals(150, Scoring.comboBonus(6, 1.0, 1.0), "6-combo");
        assertEquals(300, Scoring.comboBonus(6, 1.0, 2.0), "doubled");
    }
}
