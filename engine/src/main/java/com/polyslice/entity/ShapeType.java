package com.polyslice.entity;

/**
 * Every sliceable shape in the game. Rarer, smaller or more complex shapes are worth more.
 *
 * <p>{@code minLevel} keeps advanced shapes out of the early game, and {@code weightGrowth}
 * makes them more common as the level rises, so the average value of a wave grows with the
 * difficulty.
 */
public enum ShapeType {
    //          display name     base  radius minLvl weight growth  description
    CUBE(       "Cube",           10,   58,    1,    40,    0.00, "The classic. Slice it clean."),
    PYRAMID(    "Pyramid",        15,   58,    1,    26,    0.05, "Four faces, one cut."),
    PRISM(      "Hex Prism",      20,   56,    2,    18,    0.12, "Six sides of trouble."),
    OCTAHEDRON( "Octahedron",     25,   56,    3,    14,    0.15, "A diamond in the rough."),
    TORUS(      "Ring",           35,   54,    4,    10,    0.18, "Cut through the hole for style."),
    FRACTAL(    "Fractal Cube",   40,   74,    3,     5,    0.15, "Shatters into four Shards when sliced."),
    DODECAHEDRON("Dodecahedron",  50,   50,    5,     6,    0.20, "Twelve faces, twelve chances to miss."),
    GEM(        "Gem",            75,   40,    6,     4,    0.22, "Small, fast, and very valuable."),
    SHARD(      "Shard",          15,   34,   99,     0,    0.00, "Bonus pieces from a Fractal Cube. Free to miss.");

    private final String displayName;
    private final int basePoints;
    private final double radius;
    private final int minLevel;
    private final double baseWeight;
    private final double weightGrowth;
    private final String description;

    ShapeType(String displayName, int basePoints, double radius, int minLevel,
              double baseWeight, double weightGrowth, String description) {
        this.displayName = displayName;
        this.basePoints = basePoints;
        this.radius = radius;
        this.minLevel = minLevel;
        this.baseWeight = baseWeight;
        this.weightGrowth = weightGrowth;
        this.description = description;
    }

    public String displayName() { return displayName; }
    public int basePoints() { return basePoints; }
    public double radius() { return radius; }
    public int minLevel() { return minLevel; }
    public String description() { return description; }

    /** Relative spawn weight at a given level; 0 means "cannot spawn yet". */
    public double weightAt(int level) {
        if (level < minLevel || baseWeight <= 0) {
            return 0;
        }
        return baseWeight * (1 + weightGrowth * (level - minLevel));
    }

    /** Whether letting this shape fall costs a life in modes with lives. */
    public boolean penalizesMiss() {
        return this != SHARD;
    }
}
