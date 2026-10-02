package com.polyslice.game;

import com.polyslice.json.JsonWriter;
import com.polyslice.persist.Achievement;

import java.util.List;

/**
 * Something that happened during a tick. Events ride along with the state frame so the UI can
 * play effects and sounds in exactly the right order. The UI never decides game rules.
 */
public sealed interface GameEvent {

    void write(JsonWriter w);

    record Slice(int id, String shape, double x, double y, double dirX, double dirY,
                 int points, boolean golden, int combo) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "slice").field("id", id).field("shape", shape)
                    .field("x", x, 1).field("y", y, 1).field("dx", dirX, 3).field("dy", dirY, 3)
                    .field("pts", points).field("golden", golden).field("combo", combo)
                    .endObject();
        }
    }

    record Combo(int count, int bonus, double x, double y) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "combo").field("n", count).field("bonus", bonus)
                    .field("x", x, 1).field("y", y, 1).endObject();
        }
    }

    record Bomb(int id, double x, double y, boolean blocked, String penalty) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "bomb").field("id", id).field("x", x, 1).field("y", y, 1)
                    .field("blocked", blocked).field("penalty", penalty).endObject();
        }
    }

    record Miss(int id, String shape, double x, boolean penalized, boolean blocked) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "miss").field("id", id).field("shape", shape)
                    .field("x", x, 1).field("penalized", penalized).field("blocked", blocked)
                    .endObject();
        }
    }

    record PowerUp(int id, String type, String name, double x, double y, double duration) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "power").field("id", id).field("p", type).field("name", name)
                    .field("x", x, 1).field("y", y, 1).field("dur", duration, 1).endObject();
        }
    }

    record PowerUpEnded(String type) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "powerEnd").field("p", type).endObject();
        }
    }

    record LevelUp(int level, double multiplier) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "level").field("level", level).field("mult", multiplier)
                    .endObject();
        }
    }

    record Lives(int lives, int delta) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "lives").field("lives", lives).field("delta", delta)
                    .endObject();
        }
    }

    record TimeChange(double delta) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "time").field("delta", delta, 1).endObject();
        }
    }

    record ShieldBlocked() implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "shield").endObject();
        }
    }

    record Nova(int count) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "nova").field("n", count).endObject();
        }
    }

    record Unlocked(Achievement achievement) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "achievement").field("id", achievement.name())
                    .field("name", achievement.displayName())
                    .field("desc", achievement.description()).endObject();
        }
    }

    /** Final results. {@code rank} is the high-score position (1-10) or 0. */
    record GameOver(String mode, String reason, int score, int rank, int best, GameStats stats,
                    List<Achievement> newAchievements) implements GameEvent {
        public void write(JsonWriter w) {
            w.beginObject().field("k", "gameOver").field("mode", mode).field("reason", reason)
                    .field("score", score).field("rank", rank).field("best", best);
            w.key("stats");
            stats.write(w);
            w.key("unlocked").beginArray();
            for (Achievement a : newAchievements) {
                w.beginObject().field("id", a.name()).field("name", a.displayName())
                        .field("desc", a.description()).endObject();
            }
            w.endArray();
            w.endObject();
        }
    }
}
