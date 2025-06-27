import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import path from "node:path";
import url from "node:url";
import json from '@rollup/plugin-json';
import { glob } from 'glob';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const isWatching = !!process.env.ROLLUP_WATCH;
const flexPlugin = "at.mrcode.ytmd.plugin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper to copy canvas modules and their native dependencies
 */
function copyCanvasModules() {
    const moduleNames = ['skia-canvas'];
    
    for (const moduleName of moduleNames) {
        const srcDir = path.resolve(__dirname, 'node_modules', moduleName);
        const destDir = path.resolve(__dirname, flexPlugin, 'backend', 'node_modules', moduleName);
        
        if (!fs.existsSync(path.resolve(__dirname, flexPlugin, 'backend', 'node_modules'))) {
            try {
                fs.mkdirSync(path.resolve(__dirname, flexPlugin, 'backend', 'node_modules'), { recursive: true });
            } catch (err) {
                console.warn(`Warning: Could not create node_modules directory: ${err.message}`);
            }
        }
    
        if (fs.existsSync(srcDir)) {
            try {
                copyFolderRecursiveSync(srcDir, path.resolve(__dirname, flexPlugin, 'backend', 'node_modules'));
                console.log(`Copied ${moduleName} module to ${destDir}`);
            } catch (err) {
                console.warn(`Warning: Error copying ${moduleName}: ${err.message}`);
                console.warn('This is normal if the plugin is running and has already loaded the module.');
            }
        } else {
            console.warn(`Warning: Could not find module ${moduleName} at ${srcDir}`);
        }
    }
    
    // Also copy the canvasRenderer.js file explicitly to the backend directory otherwise it will not be found :(
    const canvasRendererSrc = path.resolve(__dirname, 'src', 'canvasRenderer.js');
    const canvasRendererDest = path.resolve(__dirname, flexPlugin, 'backend', 'canvasRenderer.js');
    
    if (fs.existsSync(canvasRendererSrc)) {
        try {
            fs.copyFileSync(canvasRendererSrc, canvasRendererDest);
            console.log(`Copied canvasRenderer.js to ${canvasRendererDest}`);
        } catch (err) {
            console.warn(`Warning: Error copying canvasRenderer.js: ${err.message}`);
        }
    } else {
        console.warn(`Warning: Could not find canvasRenderer.js at ${canvasRendererSrc}`);
    }
}

/**
 * Copy a folder recursively
 */
function copyFolderRecursiveSync(source, destination) {
    const folderName = path.basename(source);
    const destFolderPath = path.join(destination, folderName);
    
    try {
        if (!fs.existsSync(destFolderPath)) {
            fs.mkdirSync(destFolderPath, { recursive: true });
        }
        
        const items = fs.readdirSync(source);
        items.forEach(item => {
            const sourcePath = path.join(source, item);
            const destPath = path.join(destFolderPath, item);
            try {
                const stat = fs.statSync(sourcePath);
                if (stat.isFile()) {
                    try {
                        fs.copyFileSync(sourcePath, destPath);
                    } catch (err) {
                        // Skip if file is in use (common with .node files when plugin is running)
                        if (err.code !== 'EBUSY' && err.code !== 'EPERM') {
                            console.warn(`Warning: Could not copy file ${sourcePath}: ${err.message}`);
                        }
                    }
                }
                else if (stat.isDirectory()) {
                    copyFolderRecursiveSync(sourcePath, destFolderPath);
                }
            } catch (err) {
                console.warn(`Warning: Error processing ${sourcePath}: ${err.message}`);
            }
        });
    } catch (err) {
        console.warn(`Warning: Error in copyFolderRecursiveSync: ${err.message}`);
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
            name: 'copy-canvas-modules',
            buildEnd() {
                try {
                    copyCanvasModules(); // Copy canvas modules to backend folder to support native modules
                    console.log("✓ Canvas modules copied successfully");
                } catch (error) {
                    console.warn(`Canvas module copy error: ${error.message}`);
                }
            }
        }
    ],
    external: [
        // External dependencies that should not be bundled
        'skia-canvas', // Copy manually with our plugin
        // Node native modules or anything that ends with .node
        id => id.endsWith('.node')
    ]
};

export default config;
