// End-to-end smoke test: `npm run test:e2e`
//
// Launches the real app, starts a Zen game, and slices shapes with genuine OS-level mouse drags
// (webContents.sendInputEvent). Then it checks that the Java engine scored them, that pause works,
// and that the results screen appears. This exercises the whole pipeline:
// Chromium input -> renderer -> IPC -> Java engine -> state frames -> renderer.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSelfTest(win, app) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ✔' : '  ✖'} ${name}${detail ? `  (${detail})` : ''}`);
  };

  console.log('\nPolySlice end-to-end test');
  try {
    let phase = '';
    for (let i = 0; i < 100 && phase !== 'menu'; i++) {
      await wait(100);
      phase = await js('window.app && window.app.phase');
    }
    check('engine handshake reaches the menu', phase === 'menu', `phase=${phase}`);

    await js("window.app.action('start', { mode: 'ZEN' })");
    await wait(400);
    check('game starts', (await js('window.app.phase')) === 'playing');

    // Swipe through shapes for a while using real mouse input.
    const deadline = Date.now() + 9000;
    let swipes = 0;
    while (Date.now() < deadline) {
      const target = await js(`(() => {
        const a = window.app;
        for (const v of a.view.views.values()) {
          if (v.group.userData.kind !== 'shape') continue;
          const p = a.stage.toScreen(v.group.position.x, v.group.position.y);
          if (p.y > 80 && p.y < innerHeight - 60 && p.x > 140 && p.x < innerWidth - 140) return p;
        }
        return null;
      })()`);
      if (!target) {
        await wait(60);
        continue;
      }
      const y = Math.round(target.y);
      const x0 = Math.round(target.x - 130);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: x0, y });
      win.webContents.sendInputEvent({ type: 'mouseDown', x: x0, y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await wait(8);
        win.webContents.sendInputEvent({ type: 'mouseMove', x: x0 + i * 33, y, modifiers: ['leftButtonDown'] });
      }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: x0 + 264, y, button: 'left', clickCount: 1 });
      swipes++;
      await wait(90);
    }
    const score = await js('window.app.hud.score');
    check('mouse swipes slice shapes and the engine scores them', score > 0, `${swipes} swipes, score ${score}`);

    // Pause with the keyboard, make sure the world stops, then resume.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait(300);
    const paused = await js("window.app.phase === 'paused' && window.app.view.ts === 0");
    check('Esc pauses the game and freezes the world', paused);
    await js("window.app.action('resume')");
    await wait(200);
    check('resume continues play', (await js('window.app.phase')) === 'playing');

    await js("window.app.action('end')");
    await wait(1500);
    const over = await js(`({
      phase: window.app.phase,
      visible: document.getElementById('screen-over').classList.contains('active'),
      score: Number(document.getElementById('over-score').dataset.target),
    })`);
    check('results screen shows the final score', over.phase === 'over' && over.visible && over.score === score,
      `final ${over.score}`);

    await js("window.app.action('menu')");
    await wait(300);
    const best = await js("window.app.hello.modes.find((m) => m.id === 'ZEN').best");
    check('high score was saved by the engine', best >= score, `best ${best}`);

    const firstCut = await js("window.app.hello.achievements.find((a) => a.id === 'FIRST_CUT').unlocked");
    check('achievement "First Cut" unlocked and persisted', firstCut === true);

    await js("window.app.action('scores'); window.app.action('score-tab', { mode: 'ZEN' })");
    await wait(300);
    const rows = await js("document.querySelectorAll('#scores-body tbody tr').length");
    check('high score table lists the run', rows >= 1, `${rows} row(s)`);

    await js("window.app.action('guide')");
    await wait(500);
    const thumbs = await js("document.querySelectorAll('#guide-body .shape-card img').length");
    check('shape guide renders 3D thumbnails', thumbs >= 9, `${thumbs} thumbnails`);
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed\n`);
  app.exit(failed ? 1 : 0);
}

module.exports = { runSelfTest };
