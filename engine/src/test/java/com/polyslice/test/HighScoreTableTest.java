package com.polyslice.test;

import com.polyslice.persist.HighScoreTable;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertEquals;

public class HighScoreTableTest {

    private static HighScoreTable.Entry entry(String name, int score) {
        return new HighScoreTable.Entry(name, score, 1, 0, "2026-01-01");
    }

    @Test
    public void ranksBestFirst() {
        HighScoreTable t = new HighScoreTable();
        assertEquals(1, t.submit(entry("a", 100)), "first entry");
        assertEquals(1, t.submit(entry("b", 300)), "new best");
        assertEquals(2, t.submit(entry("c", 200)), "in between");
        assertEquals(300, t.best(), "best score");
        assertEquals("b", t.entries().get(0).name(), "order");
    }

    @Test
    public void tiesKeepTheEarlierEntryAhead() {
        HighScoreTable t = new HighScoreTable();
        t.submit(entry("first", 100));
        assertEquals(2, t.submit(entry("second", 100)), "tie goes below");
    }

    @Test
    public void keepsOnlyTheTopTen() {
        HighScoreTable t = new HighScoreTable();
        for (int i = 1; i <= 10; i++) {
            t.submit(entry("p" + i, i * 10));
        }
        assertEquals(0, t.submit(entry("low", 5)), "doesn't make the cut");
        assertEquals(1, t.submit(entry("high", 1000)), "new champion");
        assertEquals(HighScoreTable.CAPACITY, t.entries().size(), "still ten");
        assertEquals(20, t.entries().get(9).score(), "lowest was pushed out");
    }

    @Test
    public void zeroScoresAreNotRecorded() {
        assertEquals(0, new HighScoreTable().submit(entry("idle", 0)), "no zero scores");
    }
}
