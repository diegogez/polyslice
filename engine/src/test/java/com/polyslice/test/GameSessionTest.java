package com.polyslice.test;

import com.polyslice.entity.Bomb;
import com.polyslice.entity.Entity;
import com.polyslice.entity.PowerOrb;
import com.polyslice.entity.Shape;
import com.polyslice.entity.ShapeType;
import com.polyslice.game.GameEvent;
import com.polyslice.game.GameSession;
import com.polyslice.game.Spawner;
import com.polyslice.mode.ArcadeMode;
import com.polyslice.mode.GameMode;
import com.polyslice.powerup.PowerUpType;
import com.polyslice.test.TestRunner.Test;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertFalse;
import static com.polyslice.test.TestRunner.assertNear;
import static com.polyslice.test.TestRunner.assertTrue;

/** End-to-end rule tests that drive a real session the same way the UI does. */
public class GameSessionTest {

    private static final double TICK = 1.0 / 60;

    private static GameSession session(String mode) {
        return new GameSession(GameMode.byId(mode), 1600, 1234L, false, null);
    }

    /** Adds an entity and runs a negligible step so it's in the arena before the blade moves. */
    private static <T extends Entity> T place(GameSession s, T e) {
        s.addEntity(e);
        s.update(1e-6);
        return e;
    }

    private static Shape cube(GameSession s, double x, double y) {
        return new Shape(s.nextId(), ShapeType.CUBE, false, true, x, y, 0, 0);
    }

    /** A fast horizontal swipe at height y, then lift the blade. */
    private static void swipe(GameSession s, double fromX, double toX, double y) {
        s.bladeMove(fromX, y, 0);
        s.bladeMove(toX, y, 40);
        s.update(TICK);
        s.bladeUp();
        s.update(TICK);
    }

    private static long count(GameSession s, Class<? extends GameEvent> type) {
        return s.pendingEvents().stream().filter(type::isInstance).count();
    }

    @Test
    public void fastSwipeSlicesAndScores() {
        GameSession s = session("CLASSIC");
        Shape c = place(s, cube(s, 500, 500));
        swipe(s, 400, 600, 500);
        assertFalse(c.alive(), "cube was cut");
        assertEquals(10, s.score(), "10 points at level 1");
        assertEquals(1, s.stats().sliced, "stat recorded");
    }

    @Test
    public void slowBladeDoesNotCut() {
        GameSession s = session("CLASSIC");
        Shape c = place(s, cube(s, 500, 500));
        s.bladeMove(495, 500, 0);
        s.bladeMove(505, 500, 100); // 10 units in 100ms = 100 u/s, below the cut threshold
        s.update(TICK);
        assertTrue(c.alive(), "resting the cursor on a shape does nothing");
        assertEquals(0, s.score(), "no points");
    }

    @Test
    public void levelMultiplierRaisesPoints() {
        GameSession s = session("CLASSIC");
        s.difficulty().advance(80); // level 5 -> 2x
        place(s, cube(s, 500, 500));
        swipe(s, 400, 600, 500);
        assertEquals(20, s.score(), "cube is worth 20 at level 5");
    }

    @Test
    public void threeInOneSwipeIsACombo() {
        GameSession s = session("CLASSIC");
        place(s, cube(s, 300, 500));
        place(s, cube(s, 500, 500));
        place(s, cube(s, 700, 500));
        s.bladeMove(200, 500, 0);
        s.bladeMove(800, 500, 60);
        s.update(TICK);
        s.bladeUp();
        s.update(TICK);
        assertEquals(3, s.stats().bestCombo, "best combo");
        assertEquals(30 + 30, s.score(), "3 cubes + 30 combo bonus");
        assertEquals(1L, count(s, GameEvent.Combo.class), "combo event emitted");
    }

    @Test
    public void bombCostsALifeInClassic() {
        GameSession s = session("CLASSIC");
        place(s, new Bomb(s.nextId(), 500, 500, 0, 0));
        swipe(s, 400, 600, 500);
        assertEquals(2, s.lives(), "lost one of three lives");
        assertEquals(1, s.stats().bombsHit, "bomb counted");
    }

    @Test
    public void shieldBlocksTheBomb() {
        GameSession s = session("CLASSIC");
        s.powerUps().activate(PowerUpType.SHIELD);
        place(s, new Bomb(s.nextId(), 500, 500, 0, 0));
        swipe(s, 400, 600, 500);
        assertEquals(3, s.lives(), "no life lost");
        assertFalse(s.powerUps().isActive(PowerUpType.SHIELD), "shield used up");
    }

    @Test
    public void megaBladeDoesNotWidenBombHitbox() {
        GameSession s = session("CLASSIC");
        s.powerUps().activate(PowerUpType.MEGA_BLADE);
        Shape c = place(s, cube(s, 500, 300));
        Bomb b = place(s, new Bomb(s.nextId(), 500, 700, 0, 0));
        swipe(s, 400, 600, 400); // 100 below the cube, 300 below the bomb
        assertFalse(c.alive(), "mega blade reaches the cube");
        assertTrue(b.alive(), "but not the bomb");
    }

    @Test
    public void droppingShapesEndsClassic() {
        GameSession s = session("CLASSIC");
        for (int i = 0; i < 3; i++) {
            s.addEntity(new Shape(s.nextId(), ShapeType.CUBE, false, true, 500, -500, 0, -100));
            s.update(TICK);
        }
        assertEquals(0, s.lives(), "three misses");
        assertTrue(s.over(), "game over");
        assertEquals(3, s.stats().missed, "missed count");
    }

    @Test
    public void shardsAreFreeToMiss() {
        GameSession s = session("CLASSIC");
        s.addEntity(new Shape(s.nextId(), ShapeType.SHARD, false, true, 500, -500, 0, -100));
        s.update(TICK);
        assertEquals(3, s.lives(), "no life lost for a shard");
    }

    @Test
    public void fractalCubeSplitsIntoFourShards() {
        GameSession s = session("CLASSIC");
        place(s, new Shape(s.nextId(), ShapeType.FRACTAL, false, true, 500, 500, 0, 0));
        s.bladeMove(400, 500, 0);
        s.bladeMove(600, 500, 40);
        s.update(TICK);
        long shards = s.entities().stream()
                .filter(e -> e instanceof Shape && ((Shape) e).type() == ShapeType.SHARD).count();
        assertEquals(4L, shards, "four shards");
    }

    @Test
    public void novaSlicesShapesButNotBombs() {
        GameSession s = session("CLASSIC");
        place(s, cube(s, 200, 500));
        place(s, cube(s, 1200, 800));
        Bomb bomb = place(s, new Bomb(s.nextId(), 900, 300, 0, 0));
        place(s, new PowerOrb(s.nextId(), PowerUpType.NOVA, 700, 500, 0, 0));
        swipe(s, 650, 750, 500);
        assertEquals(2, s.stats().sliced, "both cubes cut");
        assertTrue(bomb.alive(), "bomb untouched");
        assertEquals(3, s.lives(), "no penalty");
    }

    @Test
    public void freezeSlowsTheWorld() {
        GameSession normal = session("ZEN");
        GameSession frozen = session("ZEN");
        frozen.powerUps().activate(PowerUpType.FREEZE);
        Shape a = place(normal, new Shape(normal.nextId(), ShapeType.CUBE, false, true, 0, 500, 600, 0));
        Shape b = place(frozen, new Shape(frozen.nextId(), ShapeType.CUBE, false, true, 0, 500, 600, 0));
        for (int i = 0; i < 30; i++) {
            normal.update(TICK);
            frozen.update(TICK);
        }
        assertNear(a.x() * 0.4, b.x(), 1.0, "frozen shape moved 40% as far");
    }

    @Test
    public void arcadeBombCostsTimeNotLives() {
        GameSession s = session("ARCADE");
        double before = s.timeLeft();
        place(s, new Bomb(s.nextId(), 500, 500, 0, 0));
        swipe(s, 400, 600, 500);
        assertNear(before - ArcadeMode.BOMB_TIME_PENALTY, s.timeLeft(), 0.1, "5 seconds lost");
    }

    @Test
    public void zenNeverSpawnsBombs() {
        GameSession s = session("ZEN");
        boolean sawBomb = false;
        int maxOnScreen = 0;
        while (!s.over()) {
            s.update(TICK);
            maxOnScreen = Math.max(maxOnScreen, s.entities().size());
            sawBomb |= s.entities().stream().anyMatch(Entity::hazardous);
        }
        assertFalse(sawBomb, "no bombs in zen");
        assertTrue(maxOnScreen >= 4, "but plenty of shapes");
        assertTrue(s.difficulty().level() >= 7, "difficulty ramped during the round");
    }

    @Test
    public void bombsAppearOnlyAfterTheGracePeriod() {
        // Arcade has no lives, so an idle player doesn't end the game before bombs show up.
        GameSession s = session("ARCADE");
        boolean sawBomb = false;
        while (!s.over() && !sawBomb) {
            s.update(TICK);
            sawBomb = s.entities().stream().anyMatch(Entity::hazardous);
        }
        assertTrue(sawBomb, "bombs appear during an arcade round");
        assertTrue(s.difficulty().clock() >= Spawner.BOMB_GRACE_SECONDS, "but never in the first few seconds");
    }

    @Test
    public void attractModeNeverScores() {
        GameSession s = new GameSession(GameMode.attract(), 1600, 7L, false, null);
        place(s, cube(s, 500, 500));
        swipe(s, 400, 600, 500);
        assertEquals(0, s.score(), "menu slicing is just for fun");
        assertFalse(s.over(), "attract mode never ends");
    }

    @Test
    public void demoBotScoresOnItsOwn() {
        GameSession s = new GameSession(GameMode.byId("CLASSIC"), 1600, 99L, true, null);
        for (int i = 0; i < 60 * 30 && !s.over(); i++) {
            s.update(TICK);
        }
        assertTrue(s.stats().sliced > 15, "bot sliced " + s.stats().sliced + " shapes in 30s");
    }
}
