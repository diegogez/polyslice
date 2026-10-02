package com.polyslice.test;

import com.polyslice.powerup.PowerUpManager;
import com.polyslice.powerup.PowerUpType;
import com.polyslice.test.TestRunner.Test;

import java.util.List;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertFalse;
import static com.polyslice.test.TestRunner.assertNear;
import static com.polyslice.test.TestRunner.assertTrue;

public class PowerUpManagerTest {

    @Test
    public void effectsApplyWhileActive() {
        PowerUpManager m = new PowerUpManager();
        assertNear(1.0, m.timeScale(), 1e-9, "normal speed");
        m.activate(PowerUpType.FREEZE);
        m.activate(PowerUpType.DOUBLE);
        m.activate(PowerUpType.MEGA_BLADE);
        assertNear(PowerUpManager.FREEZE_TIME_SCALE, m.timeScale(), 1e-9, "frozen");
        assertNear(2.0, m.scoreMultiplier(), 1e-9, "double points");
        assertTrue(m.bladeBonus() > 0, "bigger blade");
        assertEquals(3, m.activeCount(), "three active");
    }

    @Test
    public void timersExpireAndReport() {
        PowerUpManager m = new PowerUpManager();
        m.activate(PowerUpType.FREEZE); // 6s
        assertTrue(m.update(5.9).isEmpty(), "still running");
        List<PowerUpType> expired = m.update(0.2);
        assertEquals(List.of(PowerUpType.FREEZE), expired, "freeze expired");
        assertFalse(m.isActive(PowerUpType.FREEZE), "gone");
    }

    @Test
    public void reactivatingRefreshesInsteadOfStacking() {
        PowerUpManager m = new PowerUpManager();
        m.activate(PowerUpType.DOUBLE);
        m.update(5);
        m.activate(PowerUpType.DOUBLE);
        assertNear(PowerUpType.DOUBLE.duration(), m.remaining(PowerUpType.DOUBLE), 1e-9, "refreshed to full");
    }

    @Test
    public void shieldIsConsumedOnce() {
        PowerUpManager m = new PowerUpManager();
        assertFalse(m.consumeShield(), "no shield yet");
        m.activate(PowerUpType.SHIELD);
        assertTrue(m.consumeShield(), "blocks one hit");
        assertFalse(m.consumeShield(), "only one");
    }

    @Test
    public void instantPowerUpsAreNotTracked() {
        PowerUpManager m = new PowerUpManager();
        m.activate(PowerUpType.NOVA);
        m.activate(PowerUpType.HEART);
        assertEquals(0, m.activeCount(), "instant effects have no timer");
    }
}
