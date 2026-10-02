package com.polyslice.test;

import com.polyslice.math.Geometry;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertFalse;
import static com.polyslice.test.TestRunner.assertNear;
import static com.polyslice.test.TestRunner.assertTrue;

public class GeometryTest {

    @Test
    public void segmentThroughCenterHits() {
        assertTrue(Geometry.segmentHitsCircle(-100, 0, 100, 0, 0, 0, 10), "straight through the middle");
    }

    @Test
    public void segmentThatStopsShortMisses() {
        assertFalse(Geometry.segmentHitsCircle(-100, 0, -50, 0, 0, 0, 10), "ends before the circle");
    }

    @Test
    public void grazingSegmentHitsAtExactRadius() {
        assertTrue(Geometry.segmentHitsCircle(-100, 10, 100, 10, 0, 0, 10), "tangent counts as a hit");
        assertFalse(Geometry.segmentHitsCircle(-100, 10.5, 100, 10.5, 0, 0, 10), "just outside misses");
    }

    @Test
    public void zeroLengthSegmentIsPointDistance() {
        assertNear(25.0, Geometry.distSqPointToSegment(3, 4, 0, 0, 0, 0), 1e-9, "3-4-5 triangle");
    }

    @Test
    public void closestPointIsClampedToSegmentEnds() {
        // Point is beyond the B end: distance should be to B, not to the infinite line.
        assertNear(100.0, Geometry.distSqPointToSegment(20, 0, 0, 0, 10, 0), 1e-9, "clamped to endpoint");
    }
}
