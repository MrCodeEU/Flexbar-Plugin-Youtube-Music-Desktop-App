import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { terser } from '@rollup/plugin-terser';
import nodeExternals from 'rollup-plugin-node-externals';
import natives from 'rollup-plugin-natives';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import url from 'url';
import os from 'os';
import glob from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect platform
const platform = os.platform();
console.log(`Building for platform: ${platform}`);

// Plugin configuration
const flexPlugin = 'at.mrcode.ytmd';
const isWatching = process.env.ROLLUP_WATCH === 'true';

/**
 * @type {import('rollup').RollupOptions}
 */
export default {
    input: 'src/plugin.js',
    output: {
        file: path.resolve(__dirname, flexPlugin, 'backend', 'plugin.cjs'),
        format: 'cjs',
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
        }
    },
    plugins: [
        json(),
        natives({
            // Copy native binaries for cross-platform support
            copyTo: path.resolve(__dirname, flexPlugin, 'backend', 'lib'),
            destDir: './lib',
            dlopen: false,
            // Handle both mac/darwin (Intel & Apple Silicon), Windows, and Linux platforms
            map: (modulePath) => path.basename(modulePath)
        }),
        nodeExternals({
            // Exclude FlexDesigner SDK from bundling
            deps: false,
            devDeps: false,
            peerDeps: false,
            optDeps: false,
            builtins: false,
            builtinsPrefix: 'ignore'
        }),
        {
            name: 'copy-dependencies',
            buildEnd() {
                // Main modules to copy
                const moduleNames = [
                    'skia-canvas',
                    'socket.io-client',
                    'engine.io-client',
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
                    'parenthesis'
                ];

                // Create the destination node_modules directory
                const destNodeModulesDir = path.resolve(__dirname, flexPlugin, 'backend', 'node_modules');
                if (!fs.existsSync(destNodeModulesDir)) {
                    fs.mkdirSync(destNodeModulesDir, { recursive: true });
                }

                console.log(`Starting to copy ${moduleNames.length} modules...`);

                // Copy each module
                moduleNames.forEach(moduleName => {
                    const srcDir = path.resolve(__dirname, 'node_modules', moduleName);
                    const destDir = path.resolve(destNodeModulesDir, moduleName);

                    console.log(`Processing module: ${moduleName}`);
                    console.log(`  Source: ${srcDir}`);
                    console.log(`  Destination: ${destDir}`);

                    try {
                        if (fs.existsSync(srcDir)) {
                            // Remove existing destination if it exists
                            if (fs.existsSync(destDir)) {
                                console.log(`  Removing existing directory: ${destDir}`);
                                fs.rmSync(destDir, { recursive: true, force: true });
                            }

                            // Copy the entire module directory
                            console.log(`  Copying module...`);
                            copyFolderRecursiveSync(srcDir, destNodeModulesDir);
                            console.log(`✓ Copied ${moduleName} module successfully`);
                        } else {
                            console.warn(`⚠ Warning: Could not find module ${moduleName} at ${srcDir}`);
                        }
                    } catch (error) {
                        console.error(`✗ Error copying module ${moduleName}:`, error.message);
                    }
                });

                // Special handling for skia-canvas native binary
                const destV8Dir = path.resolve(destNodeModulesDir, 'skia-canvas', 'lib', 'v8');
                if (!fs.existsSync(destV8Dir)) {
                    fs.mkdirSync(destV8Dir, { recursive: true });
                }

                const srcNativeFile = path.resolve(__dirname, 'node_modules', 'skia-canvas', 'lib', 'v8', 'index.node');
                const destNativeFile = path.resolve(destV8Dir, 'index.node');

                try {
                    if (fs.existsSync(srcNativeFile)) {
                        fs.copyFileSync(srcNativeFile, destNativeFile);
                        console.log(`✓ Copied skia-canvas native binary`);
                    } else {
                        console.warn(`⚠ Warning: Could not find skia-canvas native binary at ${srcNativeFile}`);
                    }
                } catch (error) {
                    console.error('✗ Error copying skia-canvas native binary:', error.message);
                }

                console.log('Dependency copying completed.');
            }
        },
        {
            name: 'watch-plugin-files',
            buildStart() {
                // Watch plugin files for changes in development
                this.addWatchFile(`${flexPlugin}/manifest.json`);
                const vueFiles = glob.sync(`${flexPlugin}/ui/*.vue`);
                vueFiles.forEach((file) => {
                    this.addWatchFile(file);
                });
            }
        },
        nodeResolve({
            preferBuiltins: true,
            exportConditions: ['node']
        }),
        commonjs(),
        !isWatching && terser(),
        {
            name: 'emit-package-json',
            generateBundle() {
                this.emitFile({
                    fileName: "package.json",
                    source: `{ "type": "commonjs" }`,
                    type: "asset"
                });
            }
        }
    ].filter(Boolean), // Remove falsy plugins (like terser when watching)
    external: [
        '@eniac/flexdesigner',
        'skia-canvas',
        'canvas',
        /\.node$/
    ]
};

// Helper function to copy directories recursively
function copyFolderRecursiveSync(source, destinationParent) {
    // Check if source exists
    if (!fs.existsSync(source)) {
        console.error(`Source directory not found: ${source}`);
        return;
    }

    // Get the name of the directory
    const folderName = path.basename(source);
    const destFolderPath = path.join(destinationParent, folderName);

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destFolderPath)) {
        fs.mkdirSync(destFolderPath, { recursive: true });
    }

    // Read all files in the source directory
    let items;
    try {
        items = fs.readdirSync(source);
    } catch (error) {
        console.error(`Error reading directory ${source}:`, error);
        return;
    }

    items.forEach(item => {
        const sourcePath = path.join(source, item);
        const destPath = path.join(destFolderPath, item);

        try {
            // Check if it's a file or directory
            const stat = fs.statSync(sourcePath);

            if (stat.isFile()) {
                // Copy the file
                fs.copyFileSync(sourcePath, destPath);
            } else if (stat.isDirectory()) {
                // Recursively copy the directory
                copyFolderRecursiveSync(sourcePath, destFolderPath);
            }
        } catch (error) {
            console.error(`Error copying ${sourcePath}:`, error);
        }
    });
}