package com.polyslice.game;

/**
 * Groups slices that happen in quick succession during one stroke into a combo.
 *
 * <p>A combo ends when the stroke ends or when {@link #WINDOW} seconds pass without another
 * slice. Finishing returns the combo size so the session can award a bonus.
 */
public final class ComboTracker {

    public static final double WINDOW = 0.42;

    private int count;
    private double lastTime;
    private double sumX;
    private double sumY;
    private double finishedX;
    private double finishedY;

    /** Records a slice at real time {@code now}. Returns the running combo size. */
    public int onSlice(double now, double x, double y) {
        count++;
        lastTime = now;
        sumX += x;
        sumY += y;
        return count;
    }

    /**
     * Checks whether the current combo has finished.
     *
     * @return the finished combo size, or 0 if the combo is still going (or there is none)
     */
    public int poll(double now, boolean strokeActive) {
        if (count == 0) {
            return 0;
        }
        if (!strokeActive || now - lastTime > WINDOW) {
            int finished = count;
            finishedX = sumX / count;
            finishedY = sumY / count;
            reset();
            return finished;
        }
        return 0;
    }

    /** Drops the current combo without paying it out (e.g. after hitting a bomb). */
    public void reset() {
        count = 0;
        sumX = 0;
        sumY = 0;
    }

    public int current() {
        return count;
    }

    /** Average position of the most recently finished combo, for placing its popup. */
    public double finishedX() { return finishedX; }
    public double finishedY() { return finishedY; }
}
