package com.polyslice.powerup;

/**
 * Special orbs that change the rules for a few seconds.
 * A duration of 0 means the effect is instant.
 */
public enum PowerUpType {
    FREEZE("Freeze", 6.0, 3.0, "Time slows to a crawl for 6 seconds."),
    FRENZY("Frenzy", 5.0, 2.0, "Shapes flood in from the sides. No bombs."),
    DOUBLE("Double Points", 8.0, 3.0, "Every point counts twice for 8 seconds."),
    MEGA_BLADE("Mega Blade", 7.0, 2.6, "A huge blade that's almost impossible to miss with."),
    SHIELD("Shield", 15.0, 2.0, "Blocks the next bomb or missed shape."),
    HEART("Extra Life", 0.0, 1.2, "+1 life (or +5 seconds in timed modes)."),
    NOVA("Nova", 0.0, 1.1, "Instantly slices every shape on screen.");

    private final String displayName;
    private final double duration;
    private final double weight;
    private final String description;

    PowerUpType(String displayName, double duration, double weight, String description) {
        this.displayName = displayName;
        this.duration = duration;
        this.weight = weight;
        this.description = description;
    }

    public String displayName() { return displayName; }
    public double duration() { return duration; }
    public double weight() { return weight; }
    public String description() { return description; }

    public boolean isTimed() {
        return duration > 0;
    }
}
