package com.polyslice.test;

import com.polyslice.persist.Achievement;
import com.polyslice.persist.HighScoreTable;
import com.polyslice.persist.SaveData;
import com.polyslice.test.TestRunner.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertFalse;
import static com.polyslice.test.TestRunner.assertTrue;

public class SaveDataTest {

    @Test
    public void roundTripsThroughDisk() throws Exception {
        Path dir = Files.createTempDirectory("polyslice-test");
        Path file = dir.resolve("save.json");
        SaveData save = new SaveData(file);
        save.table("CLASSIC").submit(new HighScoreTable.Entry("Ada", 1234, 6, 7, "2026-10-02"));
        save.unlock(Achievement.MIDAS_TOUCH);
        save.save();

        SaveData loaded = SaveData.load(file);
        assertEquals(1234, loaded.table("CLASSIC").best(), "high score persisted");
        assertEquals("Ada", loaded.table("CLASSIC").entries().get(0).name(), "name persisted");
        assertTrue(loaded.isUnlocked(Achievement.MIDAS_TOUCH), "achievement persisted");
        assertFalse(loaded.isUnlocked(Achievement.INFERNO), "others still locked");
    }

    @Test
    public void corruptFileStartsFreshAndIsBackedUp() throws Exception {
        Path dir = Files.createTempDirectory("polyslice-test");
        Path file = dir.resolve("save.json");
        Files.writeString(file, "{ this is not json", StandardCharsets.UTF_8);
        SaveData loaded = SaveData.load(file);
        assertEquals(0, loaded.table("CLASSIC").best(), "fresh data");
        assertTrue(Files.exists(dir.resolve("save.json.broken")), "bad file kept for inspection");
    }
}
