package com.polyslice.persist;

import com.polyslice.json.JsonWriter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** The top scores for one game mode, best first. */
public final class HighScoreTable {

    public static final int CAPACITY = 10;

    public record Entry(String name, int score, int level, int bestCombo, String date) {
    }

    private static final Comparator<Entry> ORDER =
            Comparator.comparingInt(Entry::score).reversed();

    private final List<Entry> entries = new ArrayList<>();

    /**
     * Inserts a score if it makes the table.
     *
     * @return its 1-based rank, or 0 if it didn't make the top {@value #CAPACITY}
     */
    public int submit(Entry entry) {
        if (entry.score() <= 0) {
            return 0;
        }
        int index = 0;
        // Ties go below existing entries: whoever got there first keeps the spot.
        while (index < entries.size() && entries.get(index).score() >= entry.score()) {
            index++;
        }
        if (index >= CAPACITY) {
            return 0;
        }
        entries.add(index, entry);
        while (entries.size() > CAPACITY) {
            entries.remove(entries.size() - 1);
        }
        return index + 1;
    }

    /** Adds a loaded entry without the ranking rules (used when reading the save file). */
    void load(Entry entry) {
        entries.add(entry);
        entries.sort(ORDER);
        while (entries.size() > CAPACITY) {
            entries.remove(entries.size() - 1);
        }
    }

    public int best() {
        return entries.isEmpty() ? 0 : entries.get(0).score();
    }

    public List<Entry> entries() {
        return Collections.unmodifiableList(entries);
    }

    public void clear() {
        entries.clear();
    }

    public void write(JsonWriter w) {
        w.beginArray();
        for (Entry e : entries) {
            w.beginObject().field("name", e.name()).field("score", e.score())
                    .field("level", e.level()).field("combo", e.bestCombo())
                    .field("date", e.date()).endObject();
        }
        w.endArray();
    }
}
