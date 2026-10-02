package com.polyslice.test;

import com.polyslice.game.ComboTracker;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertNear;

public class ComboTrackerTest {

    @Test
    public void quickSlicesInOneStrokeFormACombo() {
        ComboTracker c = new ComboTracker();
        c.onSlice(1.00, 100, 100);
        c.onSlice(1.10, 200, 100);
        assertEquals(3, c.onSlice(1.20, 300, 100), "running count");
        assertEquals(0, c.poll(1.30, true), "still within the window");
        assertEquals(3, c.poll(1.20 + ComboTracker.WINDOW + 0.01, true), "window elapsed");
        assertNear(200, c.finishedX(), 1e-9, "popup at the average position");
        assertEquals(0, c.current(), "reset after finishing");
    }

    @Test
    public void liftingTheBladeEndsTheCombo() {
        ComboTracker c = new ComboTracker();
        c.onSlice(0, 0, 0);
        c.onSlice(0.05, 0, 0);
        assertEquals(2, c.poll(0.06, false), "stroke ended");
    }

    @Test
    public void resetDropsTheComboWithoutPayout() {
        ComboTracker c = new ComboTracker();
        c.onSlice(0, 0, 0);
        c.onSlice(0.05, 0, 0);
        c.onSlice(0.1, 0, 0);
        c.reset();
        assertEquals(0, c.poll(5, false), "nothing to pay out");
    }
}
