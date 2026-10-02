package com.polyslice.persist;

import com.polyslice.game.GameSession;

import java.util.ArrayList;
import java.util.List;

/** Checks locked achievements each tick and saves new unlocks right away. */
public final class AchievementTracker {

    private final SaveData save;

    public AchievementTracker(SaveData save) {
        this.save = save;
    }

    /** Returns the achievements unlocked by this check (usually none). */
    public List<Achievement> check(GameSession session) {
        List<Achievement> fresh = null;
        for (Achievement a : Achievement.values()) {
            if (!save.isUnlocked(a) && a.isMet(session)) {
                save.unlock(a);
                if (fresh == null) {
                    fresh = new ArrayList<>();
                }
                fresh.add(a);
            }
        }
        if (fresh == null) {
            return List.of();
        }
        save.saveQuietly();
        return fresh;
    }
}
