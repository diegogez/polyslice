package com.polyslice.json;

/**
 * A fluent, allocation-light JSON builder used for every message the engine sends.
 *
 * <p>Commas are inserted automatically: the writer remembers whether the current object/array
 * already has an element. Doubles are written with a fixed number of decimals so frames stay
 * small and never contain exponents, NaN or Infinity.
 */
public final class JsonWriter {

    private static final int MAX_DEPTH = 32;

    private final StringBuilder sb = new StringBuilder(4096);
    private final boolean[] hasElement = new boolean[MAX_DEPTH];
    private int depth;
    private boolean afterKey;

    public JsonWriter beginObject() {
        beforeValue();
        sb.append('{');
        push();
        return this;
    }

    public JsonWriter endObject() {
        depth--;
        sb.append('}');
        return this;
    }

    public JsonWriter beginArray() {
        beforeValue();
        sb.append('[');
        push();
        return this;
    }

    public JsonWriter endArray() {
        depth--;
        sb.append(']');
        return this;
    }

    public JsonWriter key(String name) {
        if (hasElement[depth]) {
            sb.append(',');
        }
        hasElement[depth] = true;
        appendString(name);
        sb.append(':');
        afterKey = true;
        return this;
    }

    public JsonWriter value(String s) {
        beforeValue();
        if (s == null) {
            sb.append("null");
        } else {
            appendString(s);
        }
        return this;
    }

    public JsonWriter value(long n) {
        beforeValue();
        sb.append(n);
        return this;
    }

    public JsonWriter value(boolean b) {
        beforeValue();
        sb.append(b);
        return this;
    }

    /** Writes a double rounded to {@code decimals} places (0-4). */
    public JsonWriter value(double d, int decimals) {
        beforeValue();
        appendFixed(sb, d, decimals);
        return this;
    }

    /** Writes a double with two decimals. */
    public JsonWriter value(double d) {
        return value(d, 2);
    }

    // Shorthand for "key": value pairs.
    public JsonWriter field(String k, String v) { return key(k).value(v); }
    public JsonWriter field(String k, long v) { return key(k).value(v); }
    public JsonWriter field(String k, boolean v) { return key(k).value(v); }
    public JsonWriter field(String k, double v) { return key(k).value(v); }
    public JsonWriter field(String k, double v, int decimals) { return key(k).value(v, decimals); }

    @Override
    public String toString() {
        return sb.toString();
    }

    /** Clears the buffer so the writer can be reused for the next frame. */
    public void reset() {
        sb.setLength(0);
        depth = 0;
        hasElement[0] = false;
        afterKey = false;
    }

    private void push() {
        depth++;
        if (depth >= MAX_DEPTH) {
            throw new IllegalStateException("JSON nested too deeply");
        }
        hasElement[depth] = false;
    }

    private void beforeValue() {
        if (afterKey) {
            afterKey = false;
            return;
        }
        if (hasElement[depth]) {
            sb.append(',');
        }
        hasElement[depth] = true;
    }

    private void appendString(String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    static void appendFixed(StringBuilder out, double d, int decimals) {
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            out.append('0');
            return;
        }
        long scale = 1;
        for (int i = 0; i < decimals; i++) {
            scale *= 10;
        }
        long scaled = Math.round(d * scale);
        if (scaled < 0) {
            out.append('-');
            scaled = -scaled;
        }
        out.append(scaled / scale);
        if (decimals > 0) {
            long frac = scaled % scale;
            if (frac != 0) {
                out.append('.');
                String digits = Long.toString(frac);
                for (int i = digits.length(); i < decimals; i++) {
                    out.append('0');
                }
                // Trim trailing zeros to keep frames compact.
                int end = digits.length();
                while (end > 1 && digits.charAt(end - 1) == '0') {
                    end--;
                }
                out.append(digits, 0, end);
            }
        }
    }
}
