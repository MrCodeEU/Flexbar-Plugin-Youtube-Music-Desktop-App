// YouTube Music FlexBar Plugin - Main Entry Point
const { plugin } = require('@eniac/flexdesigner');
const logger = require('./loggerWrapper.js');
const keyManager = require('./keyManager.js');
const YouTubeMusicApi = require('./ytMusicApi.js');
const YouTubeMusicAuth = require('./ytMusicAuth.js');
const YouTubeMusicRealtime = require('./ytMusicRealtime.js');
const renderer = require('./canvasRenderer.js');
const { escapeXml } = require('./utils.js');

// Initialize API and auth
const ytMusicApi = new YouTubeMusicApi();
const ytMusicAuth = new YouTubeMusicAuth(ytMusicApi);
const ytMusicRealtime = new YouTubeMusicRealtime(ytMusicApi);

// Global state for tracking playback
let currentPlaybackState = {
    isPlaying: false,
    currentTrack: null,
    progress: 0,
    duration: 0,
    likeStatus: null,
    lastUpdate: null,
    realTimeConnected: false
};

// Define notification levels (higher number = higher priority)
const NOTIFICATION_LEVELS = {
    OFF: 0,
    ERROR: 1,
    WARNING: 2,
    INFO: 3
};

// Notification level configuration
let currentNotificationLevelName = 'ERROR'; // Default to ERROR only

// Function to get the numeric value of the current notification level
function getCurrentNumericNotificationLevel() {
    const levelName = currentNotificationLevelName.toUpperCase();
    return NOTIFICATION_LEVELS.hasOwnProperty(levelName) ? NOTIFICATION_LEVELS[levelName] : NOTIFICATION_LEVELS.ERROR;
}

// Function to get the current notification level name
function getCurrentNotificationLevelName() {
    return currentNotificationLevelName;
}

// Function to update notification level from config
async function updateNotificationLevelFromConfig() {
    try {
        const config = await plugin.getConfig();
        const oldLevel = currentNotificationLevelName;
        
        if (config && typeof config.notificationLevel === 'string' && NOTIFICATION_LEVELS.hasOwnProperty(config.notificationLevel.toUpperCase())) {
            currentNotificationLevelName = config.notificationLevel.toUpperCase();
        } else {
            // Default to ERROR if no valid notificationLevel in config
            currentNotificationLevelName = 'ERROR';
        }
        
        if (oldLevel !== currentNotificationLevelName) {
            logger.info(`Notification level updated from ${oldLevel} to ${currentNotificationLevelName}`);
        }
    } catch (error) {
        logger.error('Failed to update notification level from config:', error.message);
        currentNotificationLevelName = 'ERROR';
    }
}

// Helper function to show notifications on Flexbar devices (with level checking)
function showNotification(serialNumber, message, level = 'error', icon = 'warning') {
    // Check if this notification level should be shown
    const levelName = level.toUpperCase();
    const levelValue = NOTIFICATION_LEVELS.hasOwnProperty(levelName) ? NOTIFICATION_LEVELS[levelName] : NOTIFICATION_LEVELS.ERROR;
    const currentLevel = getCurrentNumericNotificationLevel();
    
    logger.debug(`Notification request: level=${levelName}(${levelValue}), current=${getCurrentNotificationLevelName()}(${currentLevel}), message="${message}"`);
    
    if (levelValue > currentLevel) {
        logger.debug(`Notification suppressed: ${levelName} level ${levelValue} is below current threshold ${currentLevel}`);
        return; // Don't show notification if level is below configured threshold
    }

    try {
        if (serialNumber) {
            // Show on specific device
            plugin.showFlexbarSnackbarMessage(serialNumber, message, level, icon, 3000);
        } else {
            // Show in FlexDesigner if no specific device
            plugin.showSnackbarMessage(level, message, 3000);
        }
    } catch (error) {
        logger.error('Failed to show notification:', error.message);
    }
}

// Helper function to show error notifications (backwards compatibility)
function showErrorNotification(serialNumber, message, level = 'error', icon = 'warning') {
    showNotification(serialNumber, message, level, icon);
}

// Helper function to show authentication error notifications
function showAuthError(serialNumber, action = 'action') {
    const message = `Auth required for ${action}`;
    showNotification(serialNumber, message, 'warning', 'warning');
}

// Plugin event handlers
function _handleDeviceStatus(devices) {
    logger.info('Device status changed:', devices);
    const connectedSerialNumbers = devices.map(device => String(device.serialNumber));

    // Clean up keys for disconnected devices
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [serialNumber, keyUid] = keyId.split('-');
        if (!connectedSerialNumbers.includes(serialNumber)) {
            logger.info(`Device ${serialNumber} disconnected, cleaning up key ${keyUid}`);
            keyManager.cleanupKey(serialNumber, keyUid);
        }
    });

    // Disconnect real-time updates if no devices connected
    if (connectedSerialNumbers.length === 0 && ytMusicRealtime.getConnectionStatus().isConnected) {
        logger.info('No devices connected, disconnecting from real-time updates');
        ytMusicRealtime.disconnect();
        currentPlaybackState.realTimeConnected = false;
    }
}

function _handlePluginAlive(payload) {
    logger.info('Processing plugin.alive:', payload);

    // initialize or update authentication
    logger.info('Initializing YouTube Music authentication from config...');
    plugin.getConfig().then(config => {
        if (config && config.isAuthenticated && config.token && config.appId) {
            logger.info('Found saved authentication data, setting token...');
            ytMusicApi.setToken(config.token, config.appId);
            ytMusicApi.isAuthenticated = true;
            ytMusicAuth.isAuthenticated = true;
            logger.info('Authentication initialized from saved config');
        } else {
            logger.info('No valid authentication data found in config');
        }
    }).catch(error => {
        logger.error('Error initializing authentication:', error.message);
    });

    const serialNumber = String(payload.serialNumber);
    const incomingKeys = payload.keys || [];
    const incomingKeyUids = new Set(incomingKeys.map(k => k.uid).filter(uid => uid !== undefined && uid !== null));

    logger.debug(`Handler received ${incomingKeys.length} keys for device ${serialNumber}. UIDs: ${Array.from(incomingKeyUids)}`);

    // Clean up stale keys
    const keysToCleanup = [];
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [sn, keyUid] = keyId.split('-');
        if (sn === serialNumber && !incomingKeyUids.has(keyUid)) {
            keysToCleanup.push({ serialNumber: sn, keyUid });
        }
    });

    if (keysToCleanup.length > 0) {
        logger.info(`Cleaning up ${keysToCleanup.length} stale keys for device ${serialNumber}:`, keysToCleanup.map(k => k.keyUid));
        keysToCleanup.forEach(({ serialNumber: sn, keyUid }) => {
            keyManager.cleanupKey(sn, keyUid);
        });
    }

    // Process incoming keys
    let hasNowPlayingKeys = false;

    // Test to maybe initialize keys
    logger.debug('Incoming keys:', incomingKeys);
    const initPromises = [];

    for (const key of incomingKeys) {
        if (!key.uid) {
            logger.error('Received key with invalid UID, skipping:', key);
            continue;
        }

        const keyId = `${serialNumber}-${key.uid}`;
        const isActive = keyManager.activeKeys[keyId];

        if (key.cid === 'at.mrcode.ytmd.nowplaying') {
            hasNowPlayingKeys = true;
        }

        if (!isActive) {
            switch (key.cid) {
                case 'at.mrcode.ytmd.nowplaying':
                    initPromises.push(initializeNowPlayingKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.like':
                    initPromises.push(initializeLikeKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.playpause':
                    initPromises.push(initializePlayPauseKey(serialNumber, key));
                    break;
            }
        } else {
            logger.debug(`Key ${keyId} confirmed active.`);
        }
    }

    // Connect to real-time updates if we have now playing keys and authentication
    if (hasNowPlayingKeys && ytMusicAuth.getAuthenticationStatus() && !currentPlaybackState.realTimeConnected) {
        logger.info('Now playing keys detected, connecting to real-time updates');
        connectToRealTimeUpdates().then(() => {
            logger.info('Connected to real-time updates for device:', serialNumber);        }).catch(error => {
            logger.error('Failed to connect to real-time updates:', error.message);
            showNotification(serialNumber, `Failed to connect to real-time updates: ${error.message}`, 'error', 'warning');
        });
    }

    Promise.all(initPromises).then(() => {
        logger.info(`All keys initialized for device ${serialNumber}.`);
        updateAllActiveKeys();    }).catch(error => {
        logger.error(`Error initializing keys for device ${serialNumber}:`, error.message);
        showNotification(serialNumber, `Error initializing keys for device ${serialNumber}: ${error.message}`, 'error', 'warning');
    });

    logger.debug(`Finished processing keys for device ${serialNumber}.`);
}

function _handlePluginData(payload) {
    logger.info('Received plugin.data:', payload);

    const serialNumber = String(payload.serialNumber);
    const data = payload.data;
    const key = data?.key;

    if (!key || !key.uid) {
        logger.error("Received plugin.data with invalid key object.", data);
        return;
    }

    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Received interaction for inactive key ${keyId}. Re-registering.`);
        keyManager.activeKeys[keyId] = true;
    }

    if (!keyManager.keyData[keyUid]) {
        logger.warn(`Data for key ${keyUid} was missing, using received data.`);
        keyManager.keyData[keyUid] = key;
    }

    logger.info(`Handling interaction for key ${key.cid} (${keyId})`);

    // Handle different key types
    switch (key.cid) {
        case 'at.mrcode.ytmd.nowplaying':
            handleNowPlayingInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.like':
            handleLikeInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.playpause':
            handlePlayPauseInteraction(serialNumber, key, data);
            break;
        default:
            logger.warn(`Unhandled key interaction for CID: ${key.cid}`);
            break;
    }
}

// Real-time connection management
async function connectToRealTimeUpdates() {
    try {
        if (currentPlaybackState.realTimeConnected) {
            logger.debug('Real-time updates already connected');
            return;
        }

        await ytMusicRealtime.connect();
        currentPlaybackState.realTimeConnected = true;

        // Register for state updates
        ytMusicRealtime.onStateUpdate((formattedState, rawState) => {
            handleRealTimeStateUpdate(formattedState, rawState);
        });

        logger.info('Successfully connected to YouTube Music real-time updates');    } catch (error) {
        logger.error('Failed to connect to real-time updates:', error.message);
        currentPlaybackState.realTimeConnected = false;
        // Show notification to user about connection failure
        showNotification(null, `Failed to connect to real-time updates: ${error.message}`, 'error', 'warning');
    }
}

// Handle real-time state updates
function handleRealTimeStateUpdate(formattedState, rawState) {
    logger.debug('Handling real-time state update');

    // Update global state
    currentPlaybackState = {
        ...currentPlaybackState,
        isPlaying: formattedState.isPlaying,
        currentTrack: formattedState,
        progress: formattedState.progress,
        duration: formattedState.duration,
        likeStatus: formattedState.likeStatus,
        lastUpdate: Date.now()
    };

    // Update all active keys
    updateAllActiveKeys();
}

// Update all active keys with current state
function updateAllActiveKeys() {
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [serialNumber, keyUid] = keyId.split('-');
        const key = keyManager.keyData[keyUid];

        if (!key) return;

        switch (key.cid) {
            case 'at.mrcode.ytmd.nowplaying':
                updateNowPlayingKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.like':
                updateLikeKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.playpause':
                updatePlayPauseKeyDisplay(serialNumber, key);
                break;
        }
    });
}

// Key initialization functions
async function initializeNowPlayingKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing now playing key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            updateInterval: key.data?.updateInterval || 5000,
            showArtist: key.data?.showArtist !== undefined ? key.data.showArtist : true,
            showProgress: key.data?.showProgress !== undefined ? key.data.showProgress : true,
            showTimeInfo: key.data?.showTimeInfo !== undefined ? key.data.showTimeInfo : true,
            showPlayPause: key.data?.showPlayPause !== undefined ? key.data.showPlayPause : true,
            titleFontSize: key.data?.titleFontSize || 18,
            artistFontSize: key.data?.artistFontSize || 14,
            timeFontSize: key.data?.timeFontSize || 10,
            progressBarColor: key.data?.progressBarColor || '#FF0000',
            currentTrack: currentPlaybackState.currentTrack || null,
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Create initial loading display
    try {
        const loadingImage = await renderer.createYouTubeMusicButtonDataUrl(
            key.style?.width || 480,
            'Connecting...',
            'YouTube Music',
            false,
            null,
            0,
            0,
            { progressBarColor: key.data?.progressBarColor || '#FF0000' },
            true, true, true, 24, 18, false, 14
        );
        keyManager.simpleDraw(serialNumber, key, loadingImage);    } catch (error) {
        logger.error(`Failed loading image for ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Error');
        showErrorNotification(serialNumber, 'Key init failed', 'error', 'warning');
    }
    
    // Immediately fetch current state if authenticated
    if (ytMusicAuth.getAuthenticationStatus()) {
        try {
            logger.debug('Fetching current state during now playing key initialization');
            const state = await ytMusicApi.getCurrentState();
            const trackData = ytMusicApi.formatTrackState(state);

            if (trackData && trackData.title) {
                // Update global state
                currentPlaybackState.currentTrack = trackData;
                currentPlaybackState.isPlaying = trackData.isPlaying || false;
                currentPlaybackState.progress = trackData.progress || 0;
                currentPlaybackState.duration = trackData.duration || 0;
                currentPlaybackState.likeStatus = trackData.likeStatus;
                currentPlaybackState.lastUpdate = Date.now();

                logger.info(`Found current track during initialization: ${trackData.title} by ${trackData.artist}`);
            }        } catch (error) {
            logger.warn('Failed to fetch current state during initialization:', error.message);
            if (error.message.includes('Not authenticated')) {
                showAuthError(serialNumber, 'music control');
            } else {
                showErrorNotification(serialNumber, 'Fetch state failed', 'warning', 'warning');
            }
        }
    }

    // Update display with current state (or default if no track)
    await updateNowPlayingKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeLikeKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing like key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            likedColor: key.data?.likedColor || '#FF0000',
            unlikedColor: key.data?.unlikedColor || '#FFFFFF',
            likeBgColor: key.data?.likeBgColor || '#424242',
            currentTrackId: null,
            isLiked: null
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateLikeKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializePlayPauseKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing play/pause key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            playColor: key.data?.playColor || '#00FF00',
            pauseColor: key.data?.pauseColor || '#FF6600',
            bgColor: key.data?.bgColor || '#424242',
            isPlaying: false
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updatePlayPauseKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

// Key update functions
async function updateNowPlayingKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;

    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive now playing key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for now playing key ${key.uid} during display update`);
            return;
        }

        // check if real-time updates are connected
        if (!currentPlaybackState.realTimeConnected && ytMusicAuth.getAuthenticationStatus()) {
            logger.info('Real-time updates not connected, attempting to connect');
            await connectToRealTimeUpdates();
        }

        // Use current playback state or fetch if needed
        let trackData = currentPlaybackState.currentTrack;

        // Always try to fetch current state if we don't have track data or if we're authenticated
        if ((!trackData || !trackData.title) && ytMusicAuth.getAuthenticationStatus()) {
            try {
                logger.debug('Fetching current state for now playing display');
                const state = await ytMusicApi.getCurrentState();
                trackData = ytMusicApi.formatTrackState(state);

                // Update global state with fetched data
                if (trackData && trackData.title) {
                    currentPlaybackState.currentTrack = trackData;
                    currentPlaybackState.isPlaying = trackData.isPlaying || false;
                    currentPlaybackState.progress = trackData.progress || 0;
                    currentPlaybackState.duration = trackData.duration || 0;
                    currentPlaybackState.likeStatus = trackData.likeStatus;
                    currentPlaybackState.lastUpdate = Date.now();
                }            } catch (error) {
                logger.warn('Failed to fetch current state for now playing display:', error.message);
                if (error.message.includes('Not authenticated')) {
                    showAuthError(serialNumber, 'now playing');
                } else {
                    showErrorNotification(serialNumber, 'Update failed', 'warning', 'warning');
                }
            }
        }

        // const isActive = !!(trackData && trackData.title);
        const title = trackData?.title || 'Nothing Playing';
        const artist = trackData?.artist || '';
        const isPlaying = trackData?.isPlaying || false;
        const progress = trackData?.progress || 0;
        const duration = trackData?.duration || 0;
        const albumArt = trackData?.thumbnails?.length > 0 ? trackData.thumbnails[0].url : null;

        const buttonDataUrl = await renderer.createYouTubeMusicButtonDataUrl(
            key.style?.width || 480,
            title,
            artist,
            isPlaying,
            albumArt,
            progress,
            duration,
            { progressBarColor: currentKeyData.data.progressBarColor },
            currentKeyData.data.showProgress,
            currentKeyData.data.showTitle !== false,
            currentKeyData.data.showPlayPause,
            currentKeyData.data.titleFontSize,
            currentKeyData.data.artistFontSize,
            currentKeyData.data.showTimeInfo,
            currentKeyData.data.timeFontSize
        );

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);    } catch (error) {
        logger.error(`Error updating now playing key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Update Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'now playing');
        } else {
            showErrorNotification(serialNumber, 'Display update failed', 'error', 'warning');
        }
    }
}

async function updateLikeKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;

    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive like key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for like key ${key.uid} during display update`);
            return;
        }

        // Update with current track's like status
        const likeStatus = currentPlaybackState.likeStatus;
        currentKeyData.data.isLiked = likeStatus;
        currentKeyData.data.currentTrackId = currentPlaybackState.currentTrack?.videoId;

        const buttonDataUrl = await renderer.createYouTubeMusicButtonDataUrl(
            key.style?.width || 120,
            '',
            '',
            false,
            null,
            0,
            0,
            {},
            false, false, false, 18, 14, false, 10,
            {
                renderType: 'like',
                isLiked: likeStatus,
                likedColor: currentKeyData.data.likedColor,
                unlikedColor: currentKeyData.data.unlikedColor,
                likeBgColor: currentKeyData.data.likeBgColor
            }
        );

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);    } catch (error) {
        logger.error(`Error updating like key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Like Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'like control');
        } else {
            showErrorNotification(serialNumber, 'Like update failed', 'error', 'warning');
        }
    }
}

async function updatePlayPauseKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;

    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive play/pause key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for play/pause key ${key.uid} during display update`);
            return;
        }

        const isPlaying = currentPlaybackState.isPlaying;
        currentKeyData.data.isPlaying = isPlaying;

        const buttonDataUrl = await renderer.createYouTubeMusicButtonDataUrl(
            key.style?.width || 120,
            '',
            '',
            isPlaying,
            null,
            0,
            0,
            {},
            false, false, false, 18, 14, false, 10,
            {
                renderType: 'playpause',
                playColor: currentKeyData.data.playColor,
                pauseColor: currentKeyData.data.pauseColor,
                bgColor: currentKeyData.data.bgColor
            }
        );

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);    } catch (error) {
        logger.error(`Error updating play/pause key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'P/P Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'play/pause');
        } else {
            showErrorNotification(serialNumber, 'Play/pause update failed', 'error', 'warning');
        }
    }
}

// Interaction handlers
async function handleNowPlayingInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling now playing interaction for key ${keyId}`);

    // For now, just toggle play/pause on click
    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.playPause();
        logger.info('Play/pause toggled via now playing key');
        showErrorNotification(serialNumber, 'Play/pause toggled', 'info', 'play');

        // Update display after short delay
        setTimeout(() => {
            updateNowPlayingKeyDisplay(serialNumber, key);
        }, 500);
    } catch (error) {
        logger.error(`Error handling now playing interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'play/pause');
        } else {
            showErrorNotification(serialNumber, `Play/pause failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleLikeInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling like interaction for key ${keyId}`);    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.toggleLike();
        logger.info('Like status toggled');
        showErrorNotification(serialNumber, 'Like toggled', 'info', 'ok');

        // Update display after short delay
        setTimeout(() => {
            updateLikeKeyDisplay(serialNumber, key);
        }, 500);
    } catch (error) {
        logger.error(`Error handling like interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'like');
        } else {
            showErrorNotification(serialNumber, `Like failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handlePlayPauseInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling play/pause interaction for key ${keyId}`);    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.playPause();
        logger.info('Play/pause toggled');
        showErrorNotification(serialNumber, 'Play/pause toggled', 'info', 'play');

        // Update display after short delay
        setTimeout(() => {
            updatePlayPauseKeyDisplay(serialNumber, key);
        }, 500);
    } catch (error) {
        logger.error(`Error handling play/pause interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'play/pause');
        } else {
            showErrorNotification(serialNumber, `Play/pause failed: ${error.message}`, 'error', 'warning');
        }
    }
}

// Plugin event listeners
plugin.on('ui.message', async (payload) => {
    logger.info('Received message from UI:', payload);

    try {        switch (payload.data) {            case 'ytmusic-auth':
                const result = await ytMusicAuth.startAuthenticationFlow();
                if (result.success) {
                    showNotification(null, result.message || 'Authentication successful!', 'info', 'check-circle');
                } else {
                    showNotification(null, result.error || 'Authentication failed', 'error', 'warning');
                }
                return result;

            case 'ytmusic-disconnect':
                await ytMusicAuth.clearAuthentication();
                ytMusicRealtime.disconnect();
                currentPlaybackState.realTimeConnected = false;
                showNotification(null, 'Disconnected from YouTube Music', 'info', 'check-circle');
                return { success: true, message: 'Disconnected from YouTube Music' };            case 'ytmusic-test':
                if (!ytMusicAuth.getAuthenticationStatus()) {
                    showNotification(null, 'Not authenticated with YouTube Music', 'warning', 'warning');
                    return { success: false, error: 'Not authenticated' };
                }
                const testResult = await ytMusicAuth.testAuthentication();
                if (testResult.success) {
                    showNotification(null, 'Authentication test successful!', 'info', 'check-circle');
                } else {
                    showNotification(null, `Authentication test failed: ${testResult.error}`, 'error', 'warning');
                }
                return testResult;

            case 'ytmusic-check-server':
                try {
                    const serverRunning = await ytMusicApi.checkServerStatus();
                    if (serverRunning) {
                        showNotification(null, 'YouTube Music Desktop App companion server is running', 'info', 'check-circle');
                        return { success: true, message: 'YouTube Music Desktop App companion server is running' };
                    } else {
                        showNotification(null, 'YouTube Music Desktop App companion server is not running', 'warning', 'warning');
                        return { success: false, error: 'YouTube Music Desktop App companion server is not running' };
                    }
                } catch (error) {
                    showNotification(null, `Server check failed: ${error.message}`, 'error', 'warning');
                    return { success: false, error: `Server check failed: ${error.message}` };
                }            case 'update-log-level':
                logger.updateLogLevelFromConfig();
                await updateNotificationLevelFromConfig();
                return { success: true };

            case 'update-notification-level':
                await updateNotificationLevelFromConfig();
                return { success: true };case 'ytmusic-test-realtime':
                try {
                    if (!ytMusicAuth.getAuthenticationStatus()) {
                        showNotification(null, 'Not authenticated with YouTube Music', 'warning', 'warning');
                        return { success: false, error: 'Not authenticated' };
                    }

                    // Get realtime connection status
                    const connectionStatus = ytMusicRealtime.getConnectionStatus();

                    // Try to get current state data
                    let currentState = null;
                    if (connectionStatus.isConnected && connectionStatus.lastState) {
                        currentState = connectionStatus.lastState;
                        showNotification(null, 'Real-time connection test successful!', 'info', 'check-circle');
                    } else if (connectionStatus.isConnected) {
                        // If connected but no state yet, try to fetch current state
                        try {
                            const stateResult = await ytMusicApi.getCurrentState();
                            if (stateResult.success) {
                                currentState = stateResult.data;
                                showNotification(null, 'Real-time connection test successful!', 'info', 'check-circle');
                            }
                        } catch (stateError) {
                            logger.debug('Could not fetch current state:', stateError.message);
                            showNotification(null, 'Real-time connected but no state available', 'warning', 'warning');
                        }
                    } else {
                        showNotification(null, 'Real-time connection not active', 'warning', 'warning');
                    }

                    return {
                        success: true,
                        data: {
                            connectionStatus: connectionStatus,
                            currentState: currentState,
                            timestamp: Date.now()
                        }
                    };                } catch (error) {
                    logger.error('Real-time test failed:', error.message);
                    showNotification(null, `Real-time test failed: ${error.message}`, 'error', 'warning');
                    return {
                        success: false,
                        error: `Real-time test failed: ${error.message}`,
                        data: {
                            connectionStatus: ytMusicRealtime.getConnectionStatus(),
                            currentState: null,
                            timestamp: Date.now()
                        }
                    };
                }            case 'ytmusic-connect-realtime':
                try {
                    if (!ytMusicAuth.getAuthenticationStatus()) {
                        showNotification(null, 'Not authenticated with YouTube Music', 'warning', 'warning');
                        return { success: false, error: 'Not authenticated' };
                    }

                    // Check if already connected
                    const connectionStatus = ytMusicRealtime.getConnectionStatus();
                    if (connectionStatus.isConnected) {
                        logger.info('Real-time updates already connected');
                        showNotification(null, 'Already connected to real-time updates', 'info', 'info-circle');
                        return { success: true, message: 'Already connected to real-time updates' };
                    }

                    // Connect to real-time updates
                    await connectToRealTimeUpdates();

                    if (currentPlaybackState.realTimeConnected) {
                        logger.info('Successfully connected to real-time updates via UI request');
                        showNotification(null, 'Connected to real-time updates', 'info', 'check-circle');
                        return { success: true, message: 'Connected to real-time updates' };
                    } else {
                        showNotification(null, 'Failed to establish real-time connection', 'error', 'warning');
                        return { success: false, error: 'Failed to establish real-time connection' };
                    }
                } catch (error) {
                    logger.error('Real-time connection failed:', error.message);
                    showNotification(null, `Real-time connection failed: ${error.message}`, 'error', 'warning');
                    return {
                        success: false,
                        error: `Real-time connection failed: ${error.message}`
                    };
                }            case 'get-state':
                if (!ytMusicAuth.getAuthenticationStatus()) {
                    showNotification(null, 'Not authenticated with YouTube Music', 'warning', 'warning');
                    return { success: false, error: 'Not authenticated' };
                }
                
                try {
                    const state = await ytMusicApi.getCurrentState();
                    return { success: true, data: state };
                } catch (error) {
                    showNotification(null, `Failed to get state: ${error.message}`, 'error', 'warning');
                    return { success: false, error: error.message };
                }

            default:
                showNotification(null, 'Unknown command', 'warning', 'warning');
                return { success: false, error: 'Unknown command' };
        }
    } catch (error) {
        logger.error('Error handling UI message:', error.message);
        showNotification(null, `Command failed: ${error.message}`, 'error', 'warning');
        return { success: false, error: error.message };
    }
});

plugin.on('device.status', _handleDeviceStatus);
plugin.on('plugin.alive', _handlePluginAlive);
plugin.on('plugin.data', _handlePluginData);

// Plugin lifecycle
plugin.start();

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
});

plugin.on('ready', async () => {
    logger.info('YouTube Music Plugin ready');
    await logger.updateLogLevelFromConfig();
    await updateNotificationLevelFromConfig();
    
    try {
        logger.info('Attempting to initialize YouTube Music authentication...');
        const authInitialized = await ytMusicAuth.initializeAuthentication();

        if (authInitialized) {
            logger.info('YouTube Music authentication initialized successfully');
            showNotification(null, 'YouTube Music authentication initialized successfully', 'info', 'check-circle');
        } else {
            logger.warn('YouTube Music authentication not available. User needs to authenticate manually.');
            showNotification(null, 'YouTube Music authentication required. Please authenticate in settings.', 'warning', 'warning');
        }
    } catch (error) {
        logger.error('Error during YouTube Music authentication initialization:', error);
        showNotification(null, 'Failed to initialize YouTube Music authentication', 'error', 'warning');
    }
});

// Cleanup on exit
process.on('SIGINT', () => {
    logger.info('Plugin shutting down...');
    ytMusicRealtime.disconnect();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Plugin terminating...');
    ytMusicRealtime.disconnect();
    process.exit(0);
});