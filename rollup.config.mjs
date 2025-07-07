import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import path from "node:path";
import url from "node:url";
import json from '@rollup/plugin-json';
import { glob } from 'glob';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

const isWatching = !!process.env.ROLLUP_WATCH;
const flexPlugin = "at.mrcode.ytmd.plugin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper to copy canvas modules and their native dependencies using fs-extra
 */
async function copyCanvasModules() {
    const moduleNames = [
        'skia-canvas',
        'socket.io-client',
        'socket.io-parser',
        'engine.io-client',
        'engine.io-parser',
        '@socket.io/component-emitter',
        'ws',
        'xmlhttprequest-ssl',
        'debug',
        'ms',
        'simple-get',
        'decompress-response',
        'once',
        'wrappy',
        'mimic-response',
        'simple-concat',
        'glob',
        'minimatch',
        'path-scurry',
        'lru-cache',
        'brace-expansion',
        'balanced-match',
        'minipass',
        'yallist',
        'string-split-by',
        'parenthesis',
        // Additional dependencies for minimatch/glob
        '@isaacs/brace-expansion',
        '@isaacs/balanced-match',
        'foreground-child',
        'jackspeak',
        'package-json-from-dist',
        // Additional dependencies for canvas/skia
        '@mapbox/node-pre-gyp',
        'path-browserify',
        'cargo-cp-artifact'
    ];
    const nodeModulesDir = path.resolve(__dirname, flexPlugin, 'backend', 'node_modules');
    if (!fs.existsSync(nodeModulesDir)) {
        try {
            await fs.mkdirp(nodeModulesDir);
        } catch (err) {
            console.warn(`Warning: Could not create node_modules directory: ${err.message}`);
        }
    }
    console.log(`Starting to copy ${moduleNames.length} modules...`);
    for (const moduleName of moduleNames) {
        const srcDir = path.resolve(__dirname, 'node_modules', moduleName);
        const destDir = path.resolve(nodeModulesDir, moduleName);
        console.log(`Processing module: ${moduleName}`);
        if (await fs.pathExists(srcDir)) {
            try {
                await fs.remove(destDir);
                await fs.copy(srcDir, destDir, { recursive: true });
                console.log(`✓ Copied ${moduleName} module successfully`);
            } catch (err) {
                console.warn(`Warning: Error copying ${moduleName}: ${err.message}`);
                console.warn('This is normal if the plugin is running and has already loaded the module.');
            }
        } else {
            console.warn(`⚠ Warning: Could not find module ${moduleName} at ${srcDir}`);
        }
    }
    // Also copy the canvasRenderer.js file explicitly to the backend directory otherwise it will not be found :(
    const canvasRendererSrc = path.resolve(__dirname, 'src', 'canvasRenderer.js');
    const canvasRendererDest = path.resolve(__dirname, flexPlugin, 'backend', 'canvasRenderer.js');
    if (await fs.pathExists(canvasRendererSrc)) {
        try {
            await fs.copy(canvasRendererSrc, canvasRendererDest);
            console.log(`Copied canvasRenderer.js to ${canvasRendererDest}`);
        } catch (err) {
            console.warn(`Warning: Error copying canvasRenderer.js: ${err.message}`);
        }
    } else {
        console.warn(`Warning: Could not find canvasRenderer.js at ${canvasRendererSrc}`);
    }

    // Copy keyHandler files to backend directory
    const keyHandlerFiles = ['keyHandler.js', 'keyHandlerInit.js', 'keyHandlerUpdate.js', 'keyHandlerInteraction.js'];
    for (const fileName of keyHandlerFiles) {
        const srcFile = path.resolve(__dirname, 'src', fileName);
        const destFile = path.resolve(__dirname, flexPlugin, 'backend', fileName);
        if (await fs.pathExists(srcFile)) {
            try {
                await fs.copy(srcFile, destFile);
                console.log(`Copied ${fileName} to backend directory`);
            } catch (err) {
                console.warn(`Warning: Error copying ${fileName}: ${err.message}`);
            }
        } else {
            console.warn(`Warning: Could not find ${fileName} at ${srcFile}`);
        }
    }
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: "src/plugin.js",
    output: {
        file: `${flexPlugin}/backend/plugin.cjs`,
        format: "cjs",
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
        },
    },
    plugins: [
        json(),
        {
            name: "watch-externals",
            buildStart: function () {
                this.addWatchFile(`${flexPlugin}/manifest.json`);
                const vueFiles = glob.sync(`${flexPlugin}/ui/*.vue`);
                vueFiles.forEach((file) => {
                    this.addWatchFile(file);
                });
            },
        },
        nodeResolve({
            browser: false,
            exportConditions: ["node"],
            preferBuiltins: true
        }),
        commonjs(),
        !isWatching && terser(),
        {
            name: "emit-module-package-file",
            generateBundle() {
                this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
            }
        },
        {
            name: 'copy-node-modules',
            async buildEnd() {
                try {
                    await copyCanvasModules(); // Copy required modules to backend folder to support native modules and socket.io
                    console.log("✓ All required modules copied successfully");
                } catch (error) {
                    console.warn(`Module copy error: ${error.message}`);
                }
            }
        }
    ],
    external: [
        // External dependencies that should not be bundled
        'skia-canvas',
        'socket.io-client',
        'socket.io-parser',
        'engine.io-client',
        'engine.io-parser', 
        '@socket.io/component-emitter',
        'ws',
        'xmlhttprequest-ssl',
        'debug',
        'ms',
        'simple-get',
        'decompress-response',
        'once',
        'wrappy',
        'mimic-response',
        'simple-concat',
        'glob',
        'minimatch',
        'path-scurry',
        'lru-cache',
        'brace-expansion',
        'balanced-match',
        'minipass',
        'yallist',
        'string-split-by',
        'parenthesis',
        // Additional dependencies for minimatch/glob
        '@isaacs/brace-expansion',
        '@isaacs/balanced-match',
        'foreground-child',
        'jackspeak',
        'package-json-from-dist',
        // Additional dependencies for canvas/skia
        '@mapbox/node-pre-gyp',
        'path-browserify',
        'cargo-cp-artifact',
        // Node native modules or anything that ends with .node
        id => id.endsWith('.node')
    ]
};

export default config;
