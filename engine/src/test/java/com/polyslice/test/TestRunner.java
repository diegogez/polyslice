package com.polyslice.test;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * A tiny JUnit-style test runner, so the engine tests need nothing beyond the JDK.
 * Any public no-arg method annotated with {@link Test} in a listed class is run.
 */
public final class TestRunner {

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    public @interface Test {
    }

    private static final List<Class<?>> SUITES = List.of(
            GeometryTest.class,
            JsonTest.class,
            DifficultyTest.class,
            ScoringTest.class,
            PowerUpManagerTest.class,
            ComboTrackerTest.class,
            HighScoreTableTest.class,
            SaveDataTest.class,
            GameSessionTest.class);

    public static void main(String[] args) throws Exception {
        int passed = 0;
        int failed = 0;
        for (Class<?> suite : SUITES) {
            Method[] methods = suite.getDeclaredMethods();
            Arrays.sort(methods, Comparator.comparing(Method::getName));
            System.out.println("\n" + suite.getSimpleName());
            for (Method m : methods) {
                if (!m.isAnnotationPresent(Test.class)) {
                    continue;
                }
                Object instance = suite.getDeclaredConstructor().newInstance();
                try {
                    m.invoke(instance);
                    passed++;
                    System.out.println("  ✔ " + m.getName());
                } catch (InvocationTargetException e) {
                    failed++;
                    Throwable cause = e.getCause();
                    System.out.println("  ✖ " + m.getName() + "  ->  " + cause);
                    StackTraceElement[] trace = cause.getStackTrace();
                    for (int i = 0; i < Math.min(3, trace.length); i++) {
                        System.out.println("        at " + trace[i]);
                    }
                }
            }
        }
        System.out.printf("%n%d passed, %d failed%n", passed, failed);
        if (failed > 0) {
            System.exit(1);
        }
    }

    // ---- Assertions -----------------------------------------------------------------------

    public static void assertTrue(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    public static void assertFalse(boolean condition, String message) {
        assertTrue(!condition, message);
    }

    public static void assertEquals(Object expected, Object actual, String message) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError(message + " (expected " + expected + ", got " + actual + ")");
        }
    }

    public static void assertNear(double expected, double actual, double tolerance, String message) {
        if (Math.abs(expected - actual) > tolerance) {
            throw new AssertionError(message + " (expected " + expected + " +/- " + tolerance
                    + ", got " + actual + ")");
        }
    }

    private TestRunner() {
    }
}
