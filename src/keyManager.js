// YouTube Music Plugin Key Manager
const { plugin } = require('@eniac/flexdesigner');
const logger = require('./loggerWrapper.js');

// --- State Management ---
// Stores configuration and state for each key, keyed by key.uid
const keyData = {};

// Stores interval IDs for periodic updates, keyed by `${serialNumber}-${keyUid}`
const keyIntervals = {};

// Tracks currently active/connected keys, keyed by `${serialNumber}-${keyUid}`
const activeKeys = {};

// Tracks last update time for throttling
let lastUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 2000; // Minimum ms between updates

// --- Helper Functions ---

/**
 * Checks if a device is considered connected based on activeKeys
 */
function isDeviceConnected(serialNumber) {
    try {
        if (typeof serialNumber !== 'string' && typeof serialNumber !== 'number') {
            logger.error(`Invalid serialNumber in isDeviceConnected check: ${typeof serialNumber}`);
            return false;
        }
        
        serialNumber = String(serialNumber); // Ensure string
        
        // Check if any active key entry starts with this serial number
        const isConnected = Object.keys(activeKeys).some(keyId => keyId.startsWith(`${serialNumber}-`));
        logger.debug(`Device connection check - serialNumber: ${serialNumber}, connected: ${isConnected}`);
        return isConnected;
    } catch (error) {
        logger.error(`Error checking device connection: ${error.message}`);
        return false;
    }
}

/**
 * Safely cleans up resources (intervals, active status) for a specific key
 */
function cleanupKey(serialNumber, keyUid) {
    try {
        if (!serialNumber || !keyUid) {
            logger.warn(`Attempted cleanupKey with invalid serialNumber or keyUid: SN=${serialNumber}, UID=${keyUid}`);
            return;
        }

        const keyId = `${serialNumber}-${keyUid}`;
        
        // Remove from active keys
        if (activeKeys[keyId]) {
            delete activeKeys[keyId];
            logger.debug(`Removed key ${keyId} from activeKeys.`);
        } else {
            logger.debug(`Key ${keyId} was not in activeKeys during cleanup.`);
        }

        // Clear any intervals
        if (keyIntervals[keyId]) {
            clearInterval(keyIntervals[keyId]);
            delete keyIntervals[keyId];
            logger.debug(`Cleared interval for key ${keyId}.`);
        }

        logger.info(`Cleaned up resources for key ${keyUid} on device ${serialNumber}`);
    } catch (error) {
        logger.error(`Error during cleanup of key ${keyUid}: ${error.message}`);
    }
}

/**
 * Throttled update check
 */
function throttledUpdateCheck() {
    const now = Date.now();
    
    // Skip update if it's too soon since the last one
    if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        logger.debug('Skipping update due to throttling');
        return false;
    }
    
    // Update the last update time
    lastUpdateTime = now;
    return true;
}

// --- Drawing Functions ---

/**
 * Fallback to draw text-only when images fail or are not provided
 */
function textOnlyDraw(serialNumber, key, text = null) {
    try {
        if (!serialNumber || !key) {
            logger.error(`Invalid args in textOnlyDraw: SN=${serialNumber}, key type=${typeof key}`);
            return;
        }

        serialNumber = String(serialNumber);
        const keyId = `${serialNumber}-${key.uid}`;
        
        logger.debug(`Text-only draw attempt for key ${keyId}`);
        
        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping text draw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }

        if (!activeKeys[keyId]) {
            logger.debug(`Skipping text draw for inactive/invalid key: ${keyId}`);
            return;
        }

        // Create a safe, minimal copy of the key for drawing
        const safeKey = {
            uid: key.uid,
            title: text || key.title || 'YouTube Music',
            style: { ...(key.style || {}) }
        };

        // Configure for text-only display
        safeKey.style.showImage = false;
        safeKey.style.showTitle = true;

        plugin.draw(serialNumber, safeKey);
        logger.debug(`Executed text-only draw for key ${keyId}`);
    } catch (error) {
        logger.error(`Text-only draw failed for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
        
        if (error.message.includes('not alive') || error.message.includes('not connected')) {
            cleanupKey(serialNumber, key.uid);
        }
    }
}

/**
 * Reliable drawing function: handles base64 image data or falls back to text
 */
function simpleDraw(serialNumber, key, imageData = null) {
    try {
        if (!serialNumber || !key) {
            logger.error(`Invalid args in simpleDraw: SN=${serialNumber}, key type=${typeof key}`);
            return;
        }

        serialNumber = String(serialNumber);
        const keyId = `${serialNumber}-${key.uid}`;
        
        logger.debug(`Drawing attempt for key ${keyId}, Image: ${!!imageData}`);

        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping draw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }

        if (!activeKeys[keyId]) {
            logger.debug(`Skipping draw for inactive/invalid key: ${keyId}`);
            return;
        }

        // Create a minimal safe key copy
        const safeKey = {
            uid: key.uid,
            title: key.title || 'YouTube Music',
            style: { ...(key.style || {}) },
            width: key.width || key.style?.width
        };

        // Handle image vs text drawing
        if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image/png;base64,')) {
            try {
                logger.debug(`Drawing image for key ${keyId}, data length: ${imageData.length}`);
                
                // Make style explicit for image drawing
                safeKey.style.showImage = true;
                safeKey.style.showTitle = false;
                
                plugin.draw(serialNumber, safeKey, 'base64', imageData);
            } catch (imageError) {
                logger.error(`Base64 draw failed for ${keyId}: ${imageError.message}. Falling back to text.`);
                textOnlyDraw(serialNumber, key);
            }
        } else {
            if (imageData) {
                logger.warn(`Invalid or missing image data for key ${keyId}, using text-only mode. Type: ${typeof imageData}, StartsWith: ${typeof imageData === 'string' ? imageData.startsWith('data:image') : 'N/A'}`);
            } else {
                logger.debug(`No image data provided for key ${keyId}, using text-only mode.`);
            }
            textOnlyDraw(serialNumber, key);
        }
    } catch (error) {
        logger.error(`Draw error for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
        logger.error('Full error details:', error);
        logger.error('Draw parameters:', {
            serialNumber: typeof serialNumber + ': ' + serialNumber,
            keyUid: key?.uid,
            hasImageData: !!imageData
        });

        // If the key/device is gone, clean up
        if (error.message.includes('not alive') ||
            error.message.includes('not connected') ||
            error.message.includes('device not connected') ||
            error.message.includes('first argument must be')) {
            cleanupKey(serialNumber, key?.uid);
        }
    }
}

/**
 * Draw a key using only its title property (no image)
 */
function simpleTextDraw(serialNumber, key) {
    try {
        if (!serialNumber || !key || !key.uid) {
            logger.error(`Invalid args in simpleTextDraw: SN=${serialNumber}, key type=${typeof key}, UID=${key?.uid}`);
            return;
        }

        serialNumber = String(serialNumber);
        const keyId = `${serialNumber}-${key.uid}`;
        
        logger.debug(`simpleTextDraw attempt for key ${keyId}`);

        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping simpleTextDraw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }

        if (!activeKeys[keyId]) {
            logger.debug(`Skipping simpleTextDraw for inactive key: ${keyId}`);
            return;
        }

        // Create a minimal safe key copy, ensuring title is shown
        const safeKey = {
            uid: key.uid,
            title: key.title || 'YouTube Music',
            style: { ...(key.style || {}), showTitle: true, showImage: false }
        };

        plugin.draw(serialNumber, safeKey);
        logger.debug(`Executed simpleTextDraw for key ${keyId}`);
    } catch (error) {
        logger.error(`simpleTextDraw error for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
        
        if (error.message.includes('not alive') ||
            error.message.includes('not connected') ||
            error.message.includes('Unknown command type')) {
            cleanupKey(serialNumber, key?.uid);
        }
    }
}

// --- Exports ---
module.exports = {
    // State (use with caution or create accessors)
    keyData,
    keyIntervals,
    activeKeys,
    
    // Functions
    isDeviceConnected,
    cleanupKey,
    throttledUpdateCheck,
    textOnlyDraw,
    simpleDraw,
    simpleTextDraw
};