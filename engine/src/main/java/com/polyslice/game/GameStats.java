package com.polyslice.game;

import com.polyslice.entity.ShapeType;
import com.polyslice.json.JsonWriter;

import java.util.EnumMap;
import java.util.Map;

/** Running statistics for one game, shown on the results screen and checked by achievements. */
public final class GameStats {

    public int sliced;
    public int missed;
    public int bombsHit;
    public int bestCombo;
    public int combos;
    public int powerUps;
    public int goldenSliced;
    public int livesLost;
    public int maxLevel = 1;
    public int maxActivePowerUps;
    public int bestNova;
    public double seconds;
    public final Map<ShapeType, Integer> byType = new EnumMap<>(ShapeType.class);

    public void recordSlice(ShapeType type, boolean golden) {
        sliced++;
        byType.merge(type, 1, Integer::sum);
        if (golden) {
            goldenSliced++;
        }
    }

    public int count(ShapeType type) {
        return byType.getOrDefault(type, 0);
    }

    /** Percentage of shapes that were sliced rather than dropped. */
    public double accuracy() {
        int total = sliced + missed;
        return total == 0 ? 100.0 : 100.0 * sliced / total;
    }

    public void write(JsonWriter w) {
        w.beginObject()
                .field("sliced", sliced)
                .field("missed", missed)
                .field("bombs", bombsHit)
                .field("bestCombo", bestCombo)
                .field("combos", combos)
                .field("powerUps", powerUps)
                .field("golden", goldenSliced)
                .field("maxLevel", maxLevel)
                .field("livesLost", livesLost)
                .field("seconds", seconds, 1)
                .field("accuracy", accuracy(), 1);
        w.key("byType").beginObject();
        for (var e : byType.entrySet()) {
            w.field(e.getKey().name(), e.getValue());
        }
        w.endObject();
        w.endObject();
    }
}
