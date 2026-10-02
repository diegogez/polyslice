package com.polyslice.persist;

import com.polyslice.game.GameStats;
import com.polyslice.json.Json;
import com.polyslice.json.JsonWriter;
import com.polyslice.mode.GameMode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Everything that survives between launches: high scores, achievements and lifetime totals.
 * Stored as JSON and written atomically (temp file + rename) so a crash can't corrupt it.
 */
public final class SaveData {

    private final Path file;
    private final Map<String, HighScoreTable> highScores = new LinkedHashMap<>();
    private final Set<Achievement> unlocked = EnumSet.noneOf(Achievement.class);

    private int gamesPlayed;
    private long shapesSliced;
    private int bombsHit;
    private int bestCombo;
    private double secondsPlayed;

    public SaveData(Path file) {
        this.file = file;
        for (GameMode m : GameMode.playable()) {
            highScores.put(m.id(), new HighScoreTable());
        }
    }

    /** Loads the save file if it exists. A broken file is backed up and replaced. */
    public static SaveData load(Path file) {
        SaveData data = new SaveData(file);
        if (file == null || !Files.exists(file)) {
            return data;
        }
        try {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            data.read(Json.parseObject(text));
        } catch (IOException | RuntimeException e) {
            System.err.println("[engine] Could not read save file, starting fresh: " + e.getMessage());
            try {
                Files.move(file, file.resolveSibling(file.getFileName() + ".broken"),
                        StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // Nothing else to try; the next save will overwrite it.
            }
            return new SaveData(file);
        }
        return data;
    }

    @SuppressWarnings("unchecked")
    private void read(Map<String, Object> root) {
        Object scores = root.get("highScores");
        if (scores instanceof Map) {
            for (var entry : ((Map<String, Object>) scores).entrySet()) {
                HighScoreTable table = highScores.get(entry.getKey());
                if (table == null || !(entry.getValue() instanceof List)) {
                    continue;
                }
                for (Object o : (List<Object>) entry.getValue()) {
                    if (o instanceof Map) {
                        Map<String, Object> m = (Map<String, Object>) o;
                        table.load(new HighScoreTable.Entry(
                                Json.str(m, "name", "Player"),
                                (int) Json.num(m, "score", 0),
                                (int) Json.num(m, "level", 1),
                                (int) Json.num(m, "combo", 0),
                                Json.str(m, "date", "")));
                    }
                }
            }
        }
        Object ach = root.get("achievements");
        if (ach instanceof List) {
            for (Object o : (List<Object>) ach) {
                if (o instanceof String) {
                    try {
                        unlocked.add(Achievement.valueOf((String) o));
                    } catch (IllegalArgumentException ignored) {
                        // Achievement removed in a newer version; skip it.
                    }
                }
            }
        }
        Object life = root.get("lifetime");
        if (life instanceof Map) {
            Map<String, Object> m = (Map<String, Object>) life;
            gamesPlayed = (int) Json.num(m, "games", 0);
            shapesSliced = (long) Json.num(m, "sliced", 0);
            bombsHit = (int) Json.num(m, "bombs", 0);
            bestCombo = (int) Json.num(m, "bestCombo", 0);
            secondsPlayed = Json.num(m, "seconds", 0);
        }
    }

    public void save() throws IOException {
        if (file == null) {
            return;
        }
        JsonWriter w = new JsonWriter();
        w.beginObject().field("version", 1);
        w.key("highScores").beginObject();
        for (var entry : highScores.entrySet()) {
            w.key(entry.getKey());
            entry.getValue().write(w);
        }
        w.endObject();
        w.key("achievements").beginArray();
        for (Achievement a : unlocked) {
            w.value(a.name());
        }
        w.endArray();
        w.key("lifetime");
        writeLifetime(w);
        w.endObject();

        Files.createDirectories(file.toAbsolutePath().getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, w.toString(), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicFailed) {
            // Some Windows setups (antivirus, file indexing) briefly lock the target; a plain
            // replace is still far better than losing the save.
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Saves, logging instead of throwing. A failed save shouldn't crash the game. */
    public void saveQuietly() {
        try {
            save();
        } catch (IOException e) {
            System.err.println("[engine] Could not save: " + e.getMessage());
        }
    }

    /** Folds a finished game into the lifetime totals. */
    public void recordGame(GameStats stats) {
        gamesPlayed++;
        shapesSliced += stats.sliced;
        bombsHit += stats.bombsHit;
        bestCombo = Math.max(bestCombo, stats.bestCombo);
        secondsPlayed += stats.seconds;
    }

    public void reset() {
        highScores.values().forEach(HighScoreTable::clear);
        unlocked.clear();
        gamesPlayed = 0;
        shapesSliced = 0;
        bombsHit = 0;
        bestCombo = 0;
        secondsPlayed = 0;
    }

    public HighScoreTable table(String modeId) {
        return highScores.computeIfAbsent(modeId, k -> new HighScoreTable());
    }

    public Map<String, HighScoreTable> tables() {
        return highScores;
    }

    public boolean isUnlocked(Achievement a) {
        return unlocked.contains(a);
    }

    public void unlock(Achievement a) {
        unlocked.add(a);
    }

    public void writeLifetime(JsonWriter w) {
        w.beginObject().field("games", gamesPlayed).field("sliced", shapesSliced)
                .field("bombs", bombsHit).field("bestCombo", bestCombo)
                .field("seconds", secondsPlayed, 1).endObject();
    }
}
