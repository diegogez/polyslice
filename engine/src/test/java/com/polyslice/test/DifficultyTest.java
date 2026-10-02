package com.polyslice.test;

import com.polyslice.entity.ShapeType;
import com.polyslice.game.Difficulty;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertFalse;
import static com.polyslice.test.TestRunner.assertNear;
import static com.polyslice.test.TestRunner.assertTrue;

public class DifficultyTest {

    @Test
    public void startsAtLevelOneWithNoMultiplier() {
        Difficulty d = new Difficulty();
        assertEquals(1, d.level(), "level");
        assertNear(1.0, d.pointMultiplier(), 1e-9, "multiplier");
        assertNear(0.0, d.intensity(), 1e-9, "intensity");
    }

    @Test
    public void levelsUpEveryTwentySeconds() {
        Difficulty d = new Difficulty();
        assertFalse(d.advance(19.9), "not yet");
        assertTrue(d.advance(0.2), "crossed 20s");
        assertEquals(2, d.level(), "level 2");
        assertNear(1.25, d.pointMultiplier(), 1e-9, "x1.25 at level 2");
        d.advance(60);
        assertEquals(5, d.level(), "level 5 at 80s");
        assertNear(2.0, d.pointMultiplier(), 1e-9, "x2 at level 5");
    }

    @Test
    public void everyKnobGetsHarderOverTime() {
        Difficulty d = new Difficulty();
        double interval = d.spawnInterval();
        double bombs = d.bombChance();
        double speed = d.speedFactor();
        int maxWave = d.maxWaveSize();
        for (int i = 0; i < 30; i++) {
            d.advance(10);
            assertTrue(d.spawnInterval() <= interval, "spawn interval never grows");
            assertTrue(d.bombChance() >= bombs, "bomb chance never shrinks");
            assertTrue(d.speedFactor() >= speed, "speed never drops");
            assertTrue(d.maxWaveSize() >= maxWave, "waves never shrink");
            interval = d.spawnInterval();
            bombs = d.bombChance();
            speed = d.speedFactor();
            maxWave = d.maxWaveSize();
        }
        assertTrue(d.spawnInterval() < 0.6, "late game is fast");
        assertTrue(d.intensity() < 1.0, "intensity is asymptotic");
    }

    @Test
    public void gravityScalesWithSpeedSquaredSoArcsStayOnScreen() {
        Difficulty d = new Difficulty();
        d.advance(200);
        double s = d.speedFactor();
        assertNear(Difficulty.BASE_GRAVITY * s * s, d.gravity(), 1e-6, "g = g0 * s^2");
    }

    @Test
    public void advancedShapesUnlockByLevel() {
        assertEquals(0.0, ShapeType.GEM.weightAt(1), "no gems at level 1");
        assertTrue(ShapeType.GEM.weightAt(6) > 0, "gems from level 6");
        assertTrue(ShapeType.GEM.weightAt(10) > ShapeType.GEM.weightAt(6), "and more common later");
        assertEquals(0.0, ShapeType.SHARD.weightAt(50), "shards never spawn on their own");
    }
}
