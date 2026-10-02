package com.polyslice.powerup;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Tracks timed power-ups and exposes their combined effect on the game rules.
 *
 * <p>Timers run on real time, not game time, so Freeze can't stretch its own duration.
 */
public final class PowerUpManager {

    public static final double FREEZE_TIME_SCALE = 0.4;
    public static final double DOUBLE_MULTIPLIER = 2.0;
    public static final double MEGA_BLADE_BONUS = 46.0;

    private final Map<PowerUpType, Double> remaining = new EnumMap<>(PowerUpType.class);

    /** Starts (or refreshes) a timed power-up. Instant power-ups are handled by the session. */
    public void activate(PowerUpType type) {
        if (!type.isTimed()) {
            return;
        }
        remaining.merge(type, type.duration(), Math::max);
    }

    /**
     * Advances every timer by {@code realDt} seconds.
     *
     * @return the power-ups that expired during this step
     */
    public List<PowerUpType> update(double realDt) {
        List<PowerUpType> expired = new ArrayList<>(0);
        var it = remaining.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            double left = entry.getValue() - realDt;
            if (left <= 0) {
                expired.add(entry.getKey());
                it.remove();
            } else {
                entry.setValue(left);
            }
        }
        return expired;
    }

    /** Uses up an active shield. Returns true if one was available. */
    public boolean consumeShield() {
        return remaining.remove(PowerUpType.SHIELD) != null;
    }

    public boolean isActive(PowerUpType type) {
        return remaining.containsKey(type);
    }

    public double remaining(PowerUpType type) {
        return remaining.getOrDefault(type, 0.0);
    }

    public int activeCount() {
        return remaining.size();
    }

    public Map<PowerUpType, Double> active() {
        return remaining;
    }

    public void clear() {
        remaining.clear();
    }

    public double timeScale() {
        return isActive(PowerUpType.FREEZE) ? FREEZE_TIME_SCALE : 1.0;
    }

    public double scoreMultiplier() {
        return isActive(PowerUpType.DOUBLE) ? DOUBLE_MULTIPLIER : 1.0;
    }

    public double bladeBonus() {
        return isActive(PowerUpType.MEGA_BLADE) ? MEGA_BLADE_BONUS : 0.0;
    }
}
