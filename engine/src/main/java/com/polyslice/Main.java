package com.polyslice;

import com.polyslice.engine.EngineServer;
import com.polyslice.persist.SaveData;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Entry point for the PolySlice game engine.
 *
 * <p>Electron starts this process and talks to it over stdin/stdout. It can also be run by
 * hand ({@code java -jar polyslice-engine.jar}) and driven by typing JSON commands.
 *
 * <pre>
 *   --data-dir &lt;path&gt;   where to keep the save file (default: ~/.polyslice)
 * </pre>
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        Path dataDir = Paths.get(System.getProperty("user.home"), ".polyslice");
        for (int i = 0; i < args.length; i++) {
            if ("--data-dir".equals(args[i]) && i + 1 < args.length) {
                dataDir = Paths.get(args[++i]);
            }
        }
        SaveData save = SaveData.load(dataDir.resolve("polyslice-save.json"));
        new EngineServer(save).run();
        System.exit(0);
    }
}
