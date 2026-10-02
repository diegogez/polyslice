// Starts the Java engine as a child process and speaks its line-delimited JSON protocol.

const { spawn, execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const JAR_NAME = 'polyslice-engine.jar';

class EngineProcess extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.appRoot      project root (dev) or app.asar path (packaged)
   * @param {string} opts.resources    process.resourcesPath
   * @param {boolean} opts.packaged    app.isPackaged
   * @param {string} opts.dataDir      where the engine keeps its save file
   */
  constructor({ appRoot, resources, packaged, dataDir }) {
    super();
    this.appRoot = appRoot;
    this.resources = resources;
    this.packaged = packaged;
    this.dataDir = dataDir;
    this.child = null;
    this.buffer = '';
    this.stopping = false;
  }

  /** Bundled runtime first, then JAVA_HOME, then the system's default JDK, then PATH. */
  findJava() {
    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    const candidates = [];
    if (this.packaged) {
      candidates.push(path.join(this.resources, 'jre', 'bin', exe));
    } else {
      candidates.push(path.join(this.appRoot, 'build', 'jre', 'bin', exe));
    }
    if (process.env.JAVA_HOME) {
      candidates.push(path.join(process.env.JAVA_HOME, 'bin', exe));
    }
    if (process.platform === 'darwin') {
      try {
        const home = execFileSync('/usr/libexec/java_home', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (home) candidates.push(path.join(home, 'bin', exe));
      } catch {
        // No JDK registered with macOS; keep looking.
      }
      candidates.push('/opt/homebrew/opt/openjdk/bin/java', '/usr/local/opt/openjdk/bin/java');
    }
    const found = candidates.find((c) => fs.existsSync(c));
    return found || exe;
  }

  findJar() {
    return this.packaged
      ? path.join(this.resources, 'engine', JAR_NAME)
      : path.join(this.appRoot, 'engine', 'build', JAR_NAME);
  }

  start() {
    this.stop();
    this.stopping = false;
    const java = this.findJava();
    const jar = this.findJar();

    if (!fs.existsSync(jar)) {
      this.emit('status', {
        state: 'error',
        message: `Engine jar not found at ${jar}. Run "npm run build:engine" first.`,
      });
      return;
    }

    const args = [
      '-XX:+UseSerialGC', // tiny heap, short pauses: ideal for a 60 Hz loop
      '-Xms32m',
      '-Xmx256m',
      '-Djava.awt.headless=true',
      '-Dfile.encoding=UTF-8',
      '-jar', jar,
      '--data-dir', this.dataDir,
    ];

    let child;
    try {
      // windowsHide: without it, Windows pops up a console window for java.exe.
      child = spawn(java, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      this.emit('status', { state: 'error', message: `Could not start Java: ${err.message}` });
      return;
    }
    this.child = child;
    this.buffer = '';
    this.emit('status', { state: 'starting', java, jar });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let nl;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        if (line) this.emit('message', line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      for (const line of text.split('\n')) {
        if (line.trim()) {
          console.log(line);
          if (line.includes('ready')) this.emit('status', { state: 'running', java, banner: line.trim() });
        }
      }
    });

    child.on('error', (err) => {
      const hint = err.code === 'ENOENT'
        ? 'Java was not found. Install a JDK 17+ (e.g. "brew install openjdk") or build the bundled runtime with "npm run build:jre".'
        : err.message;
      this.emit('status', { state: 'error', message: hint });
    });

    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      if (!this.stopping) {
        this.emit('status', {
          state: 'error',
          message: `The Java engine stopped unexpectedly (code ${code ?? signal}).`,
        });
      }
    });

    child.stdin.on('error', () => {
      // Writing to a dead process; the exit handler reports it.
    });
  }

  send(command) {
    if (!this.child || !this.child.stdin.writable) return false;
    this.child.stdin.write(`${typeof command === 'string' ? command : JSON.stringify(command)}\n`);
    return true;
  }

  stop() {
    if (!this.child) return;
    this.stopping = true;
    const child = this.child;
    this.child = null;
    try {
      child.stdin.write('{"cmd":"quit"}\n');
      child.stdin.end();
    } catch {
      // Already gone.
    }
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 800).unref();
  }
}

module.exports = { EngineProcess };
