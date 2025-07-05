// YouTube Music FlexBar Plugin - Main Entry Point
const { plugin } = require('@eniac/flexdesigner');
const logger = require('./loggerwrapper.js');
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
    volume: 50, // Default volume level (0-100)
    likeStatus: null,
    lastUpdate: null,
    realTimeConnected: false,
    repeatMode: -1 // -1 Unknown, 0 None, 1 All, 2 One
};

// Define notification levels (higher number = higher priority)
const NOTIFICATION_LEVELS = {
    OFF: 0,
    ERROR: 1,
    WARNING: 2,
    INFO: 3
};

//DEBUG TESTING FOR AUDIO
setInterval(async () => {
    // Ensure real-time connection for better state updates
    await ensureRealTimeConnection();
    
    // Optionally refresh state from currentTrack if available  
    updateCurrentPlaybackStateFromTrack(currentPlaybackState.currentTrack);
    logger.info(`[YTMD] Current playback volume: ${currentPlaybackState.volume}, Real-time connected: ${currentPlaybackState.realTimeConnected}`);
}, 100000); // Changed to 100 seconds (100000ms) as requested

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

// Helper to update currentPlaybackState from trackData
function updateCurrentPlaybackStateFromTrack(trackData) {
    if (!trackData) return;
    currentPlaybackState.currentTrack = trackData;
    currentPlaybackState.isPlaying = trackData.isPlaying || false;
    currentPlaybackState.progress = trackData.progress || 0;
    currentPlaybackState.duration = trackData.duration || 0;
    currentPlaybackState.likeStatus = trackData.likeStatus;
    currentPlaybackState.lastUpdate = Date.now();
    currentPlaybackState.repeatMode = trackData.repeatMode || -1;
    currentPlaybackState.volume = trackData.volume || 50;
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
                case 'at.mrcode.ytmd.dislike':
                    initPromises.push(initializeDislikeKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.previous':
                    initPromises.push(initializePreviousKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.next':
                    initPromises.push(initializeNextKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.mutetoggle':
                    initPromises.push(initializeMuteToggleKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.shuffle':
                    initPromises.push(initializeShuffleKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.repeat':
                    initPromises.push(initializeRepeatKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekforward':
                    initPromises.push(initializeSeekForwardKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekbackward':
                    initPromises.push(initializeSeekBackwardKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekslider':
                    initPromises.push(initializeSeekSliderKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.playbyid':
                    initPromises.push(initializePlayByIdKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumeup':
                    initPromises.push(initializeVolumeUpKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumedown':
                    initPromises.push(initializeVolumeDownKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumeslider':
                    initPromises.push(initializeVolumeSliderKey(serialNumber, key));
                    break;
            }
        } else {
            logger.debug(`Key ${keyId} confirmed active.`);
        }
    }

    // Connect to real-time updates if we have now playing keys and authentication
    // This ensures we get real-time state for all keys, not just now playing
    const hasInteractiveKeys = incomingKeys.some(key => 
        key.cid.includes('at.mrcode.ytmd.') && 
        !key.cid.includes('nowplaying') // Connect for all keys, not just now playing
    );
    
    if ((hasNowPlayingKeys || hasInteractiveKeys) && ytMusicAuth.getAuthenticationStatus() && !currentPlaybackState.realTimeConnected) {
        logger.info('YouTube Music keys detected, connecting to real-time updates for live state');
        connectToRealTimeUpdates().then(() => {
            logger.info('Real-time updates connected for device:', serialNumber);
            // Immediate update of all keys with current real-time state
            updateAllActiveKeys();
        }).catch(error => {
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
        case 'at.mrcode.ytmd.dislike':
            handleDislikeInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.playpause':
            handlePlayPauseInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.previous':
            handlePreviousKeyInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.next':
            handleNextKeyInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.mutetoggle':
            handleMuteToggleInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.shuffle':
            handleShuffleInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.repeat':
            handleRepeatInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekforward':
            handleSeekForwardInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekbackward':
            handleSeekBackwardInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekslider':
            handleSeekSliderInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.playbyid':
            handlePlayByIdInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumeup':
            handleVolumeUpInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumedown':
            handleVolumeDownInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumeslider':
            handleVolumeSliderInteraction(serialNumber, key, data);
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

        logger.info('Connecting to YouTube Music real-time updates...');
        await ytMusicRealtime.connect();
        currentPlaybackState.realTimeConnected = true;

        // Register for state updates - this is the primary way we get state updates
        ytMusicRealtime.onStateUpdate((formattedState, rawState) => {
            handleRealTimeStateUpdate(formattedState, rawState);
        });

        logger.info('Successfully connected to YouTube Music real-time updates');
        
        // Try to get initial state if we don't have current track data
        if (!currentPlaybackState.currentTrack && ytMusicAuth.getAuthenticationStatus()) {
            try {
                logger.debug('Fetching initial state after real-time connection');
                const state = await ytMusicApi.getCurrentState();
                const trackData = ytMusicApi.formatTrackState(state);
                if (trackData) {
                    updateCurrentPlaybackStateFromTrack(trackData);
                    updateAllActiveKeys();
                }
            } catch (error) {
                logger.warn('Failed to fetch initial state after real-time connection:', error.message);
            }
        }
    } catch (error) {
        logger.error('Failed to connect to real-time updates:', error.message);
        currentPlaybackState.realTimeConnected = false;
        // Show notification to user about connection failure
        showNotification(null, `Failed to connect to real-time updates: ${error.message}`, 'error', 'warning');
    }
}

// Helper function to ensure real-time connection is active
async function ensureRealTimeConnection() {
    if (!ytMusicAuth.getAuthenticationStatus()) {
        logger.debug('Not authenticated, cannot establish real-time connection');
        return false;
    }

    if (currentPlaybackState.realTimeConnected) {
        // Verify the connection is actually active
        const connectionStatus = ytMusicRealtime.getConnectionStatus();
        if (connectionStatus.isConnected) {
            return true;
        } else {
            logger.warn('Real-time connection marked as connected but socket is not active, reconnecting...');
            currentPlaybackState.realTimeConnected = false;
        }
    }

    try {
        await connectToRealTimeUpdates();
        return currentPlaybackState.realTimeConnected;
    } catch (error) {
        logger.error('Failed to ensure real-time connection:', error.message);
        return false;
    }
}

// Enhanced state fetcher that prioritizes real-time data
async function getCurrentTrackState() {
    // Always prefer real-time data if available
    if (currentPlaybackState.realTimeConnected && currentPlaybackState.currentTrack) {
        logger.debug('Using real-time track state');
        return currentPlaybackState.currentTrack;
    }

    // Fallback to direct API call if no real-time data
    if (ytMusicAuth.getAuthenticationStatus()) {
        try {
            logger.debug('Fetching track state from API (no real-time data available)');
            const state = await ytMusicApi.getCurrentState();
            const trackData = ytMusicApi.formatTrackState(state);
            
            if (trackData) {
                updateCurrentPlaybackStateFromTrack(trackData);
                return trackData;
            }
        } catch (error) {
            logger.warn('Failed to fetch current track state:', error.message);
        }
    }

    return null;
}

// Handle real-time state updates
function handleRealTimeStateUpdate(formattedState, rawState) {
    logger.debug('Handling real-time state update:', {
        title: formattedState?.title,
        isPlaying: formattedState?.isPlaying,
        volume: formattedState?.volume,
        progress: formattedState?.progress
    });

    // Use the helper function to update currentPlaybackState comprehensively
    updateCurrentPlaybackStateFromTrack(formattedState);

    // Update all active keys with the new state
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
            case 'at.mrcode.ytmd.dislike':
                updateDislikeKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.playpause':
                updatePlayPauseKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.previous':
                updatePreviousKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.next':
                updateNextKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.mutetoggle':
                updateMuteToggleKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.shuffle':
                updateShuffleKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.repeat':
                updateRepeatKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekforward':
                updateSeekForwardKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekbackward':
                updateSeekBackwardKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekslider':
                updateSeekSliderKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.playbyid':
                updatePlayByIdKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumeup':
                updateVolumeUpKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumedown':
                updateVolumeDownKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumeslider':
                updateVolumeSliderKeyDisplay(serialNumber, key);
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
                updateCurrentPlaybackStateFromTrack(trackData);

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

async function initializeDislikeKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing like key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            dislikedColor: key.data?.dislikedColor || '#FF0000',
            unlikedColor: key.data?.unlikedColor || '#FFFFFF',
            dislikeBgColor: key.data?.dislikeBgColor || '#424242',
            currentTrackId: null,
            isLiked: null
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateDislikeKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
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

async function initializePreviousKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing previous key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            bgColor: key.data?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updatePreviousKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeNextKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing next key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            bgColor: key.data?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateNextKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeMuteToggleKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing mute toggle key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            states: key.data?.states || ['unmuted', 'muted'],
            currentState: 0, // 0 = unmuted, 1 = muted
            bgColor: key.style?.multiStyle?.[0]?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateMuteToggleKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeShuffleKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing shuffle key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            states: key.data?.states || ['shuffle', 'notshuffle'],
            currentState: 0, // 0 = shuffle off, 1 = shuffle on
            bgColor: key.style?.multiStyle?.[0]?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateShuffleKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeRepeatKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing repeat key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            states: key.data?.states || ['no_repeat', 'repeat_all', 'repeat_one'],
            currentState: 0, // 0 = no repeat, 1 = repeat all, 2 = repeat one
            bgColor: key.style?.multiStyle?.[0]?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateRepeatKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeSeekForwardKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing seek forward key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            seconds: key.data?.seconds || 10,
            bgColor: key.style?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateSeekForwardKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeSeekBackwardKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing seek backward key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            seconds: key.data?.seconds || 10,
            bgColor: key.style?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateSeekBackwardKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeSeekSliderKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing seek slider key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            duration: key.data?.duration || 600,
            currentPosition: 0,
            bgColor: key.style?.bgColor || '#424242',
            sliderColor: key.style?.slider?.color || '#FF0000'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateSeekSliderKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializePlayByIdKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing play by ID key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            videoID: key.data?.videoID || '',
            playlistID: key.data?.playlistID || '',
            bgColor: key.style?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updatePlayByIdKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeVolumeUpKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing volume up key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            bgColor: key.data?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateVolumeUpKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeVolumeDownKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing volume down key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            bgColor: key.data?.bgColor || '#424242'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateVolumeDownKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
}

async function initializeVolumeSliderKey(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    const keyUid = key.uid;

    logger.info('Initializing volume slider key:', keyId);

    // Store key data
    keyManager.keyData[keyUid] = {
        ...key,
        data: {
            currentVolume: key.data?.currentVolume || 50,
            minValue: key.style?.slider?.min || 0,
            maxValue: key.style?.slider?.max || 100,
            bgColor: key.style?.bgColor || '#424242',
            sliderColor: key.style?.slider?.color || '#00FF00'
        }
    };

    // Mark as active
    keyManager.activeKeys[keyId] = true;

    // Update display
    await updateVolumeSliderKeyDisplay(serialNumber, keyManager.keyData[keyUid]);
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

        // Ensure real-time updates are connected for live state updates
        if (!currentPlaybackState.realTimeConnected && ytMusicAuth.getAuthenticationStatus()) {
            logger.info('Real-time updates not connected, attempting to connect');
            await connectToRealTimeUpdates();
        }

        // Prioritize real-time state from currentPlaybackState
        let trackData = currentPlaybackState.currentTrack;

        // Only fetch directly from API if we have no real-time data and are authenticated
        // This reduces unnecessary API calls since real-time updates provide the same data
        if ((!trackData || !trackData.title) && ytMusicAuth.getAuthenticationStatus() && !currentPlaybackState.realTimeConnected) {
            try {
                logger.debug('No real-time data available, fetching current state directly from API');
                const state = await ytMusicApi.getCurrentState();
                trackData = ytMusicApi.formatTrackState(state);

                // Update global state with fetched data
                if (trackData && trackData.title) {
                    updateCurrentPlaybackStateFromTrack(trackData);
                }
            } catch (error) {
                logger.warn('Failed to fetch current state for now playing display:', error.message);
                if (error.message.includes('Not authenticated')) {
                    showAuthError(serialNumber, 'now playing');
                } else {
                    showErrorNotification(serialNumber, 'Update failed', 'warning', 'warning');
                }
            }
        }

        // Use the trackData from real-time updates or fallback
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

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
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

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error updating like key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Like Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'like control');
        } else {
            showErrorNotification(serialNumber, 'Like update failed', 'error', 'warning');
        }
    }
}

async function updateDislikeKeyDisplay(serialNumber, key) {
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
                renderType: 'dislike',
                isLiked: likeStatus,
                dislikedColor: currentKeyData.data.dislikedColor,
                unlikedColor: currentKeyData.data.unlikedColor,
                dislikeBgColor: currentKeyData.data.dislikeBgColor
            }
        );

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error updating dislike key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Like Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'dislike control');
        } else {
            showErrorNotification(serialNumber, 'Dislike update failed', 'error', 'warning');
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

        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error updating play/pause key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'P/P Error');
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'play/pause');
        } else {
            showErrorNotification(serialNumber, 'Play/pause update failed', 'error', 'warning');
        }
    }
}

async function updatePreviousKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive previous key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for previous key ${key.uid} during display update`);
            return;
        }

        keyManager.simpleTextDraw(serialNumber, currentKeyData, 'Previous', currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating previous key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Prev Error');
    }
}

async function updateNextKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive next key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for next key ${key.uid} during display update`);
            return;
        }

        keyManager.simpleTextDraw(serialNumber, currentKeyData, 'Next', currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating next key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Next Error');
    }
}

async function updateMuteToggleKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive mute toggle key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for mute toggle key ${key.uid} during display update`);
            return;
        }

        const isMuted = currentKeyData.data.currentState === 1;
        const text = isMuted ? 'Muted' : 'Unmuted';
        keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating mute toggle key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Mute Error');
    }
}

async function updateShuffleKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive shuffle key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for shuffle key ${key.uid} during display update`);
            return;
        }

        const isShuffled = currentKeyData.data.currentState === 1;
        const text = isShuffled ? 'Shuffle On' : 'Shuffle Off';
        keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating shuffle key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Shuffle Error');
    }
}

async function updateRepeatKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive repeat key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for repeat key ${key.uid} during display update`);
            return;
        }

        const repeatModes = ['No Repeat', 'Repeat All', 'Repeat One'];
        const text = repeatModes[currentKeyData.data.currentState] || 'No Repeat';
        keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating repeat key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Repeat Error');
    }
}

async function updateSeekForwardKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive seek forward key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for seek forward key ${key.uid} during display update`);
            return;
        }

        const text = `+${currentKeyData.data.seconds}s`;
        keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating seek forward key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Seek Error');
    }
}

async function updateSeekBackwardKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive seek backward key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for seek backward key ${key.uid} during display update`);
            return;
        }

        const text = `-${currentKeyData.data.seconds}s`;
        keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating seek backward key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Seek Error');
    }
}

async function updateSeekSliderKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive seek slider key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for seek slider key ${key.uid} during display update`);
            return;
        }

        // Update current position from global state
        currentKeyData.data.currentPosition = currentPlaybackState.progress || 0;
        currentKeyData.data.duration = currentPlaybackState.duration || 600;

        const progress = currentKeyData.data.duration > 0 ? 
            (currentKeyData.data.currentPosition / currentKeyData.data.duration) * 100 : 0;
        
        keyManager.simpleTextDraw(serialNumber, currentKeyData, `Seek ${progress.toFixed(0)}%`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating seek slider key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Slider Error');
    }
}

async function updatePlayByIdKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive play by ID key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for play by ID key ${key.uid} during display update`);
            return;
        }

        const videoId = currentKeyData.data.videoID ? currentKeyData.data.videoID.substring(0, 8) : 'None';
        keyManager.simpleTextDraw(serialNumber, currentKeyData, `Play: ${videoId}`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating play by ID key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Play Error');
    }
}

async function updateVolumeUpKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive volume up key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for volume up key ${key.uid} during display update`);
            return;
        }

        keyManager.simpleTextDraw(serialNumber, currentKeyData, 'Vol +', currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating volume up key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Vol+ Error');
    }
}

async function updateVolumeDownKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive volume down key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for volume down key ${key.uid} during display update`);
            return;
        }

        keyManager.simpleTextDraw(serialNumber, currentKeyData, 'Vol -', currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating volume down key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Vol- Error');
    }
}

async function updateVolumeSliderKeyDisplay(serialNumber, key) {
    const keyId = `${serialNumber}-${key.uid}`;
    try {
        if (!keyManager.activeKeys[keyId]) {
            logger.warn(`Attempted to update inactive volume slider key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for volume slider key ${key.uid} during display update`);
            return;
        }

        const volume = currentKeyData.data.currentVolume || 50;
        keyManager.simpleTextDraw(serialNumber, currentKeyData, `Vol: ${volume}%`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating volume slider key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Volume Error');
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
    logger.info(`Handling like interaction for key ${keyId}`);
    try {
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

async function handleDislikeInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling like interaction for key ${keyId}`);
    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.toggleDislike();
        logger.info('Dislike status toggled');
        showErrorNotification(serialNumber, 'Dislike toggled', 'info', 'ok');

        // Update display after short delay
        setTimeout(() => {
            updateDislikeKeyDisplay(serialNumber, key);
        }, 500);
    } catch (error) {
        logger.error(`Error handling dislike interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'dislike');
        } else {
            showErrorNotification(serialNumber, `Dislike failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handlePlayPauseInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling play/pause interaction for key ${keyId}`);
    try {
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

async function handlePreviousKeyInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling previous interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.previous();
        logger.info('Previous track requested');
        showErrorNotification(serialNumber, 'Previous track requested', 'info', 'skip-backward');

    } catch (error) {
        logger.error(`Error handling previous interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'previous track');
        } else {
            showErrorNotification(serialNumber, `Previous track failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleNextKeyInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling next interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.next();
        logger.info('Next track requested');
        showErrorNotification(serialNumber, 'Next track requested', 'info', 'skip-forward');

    } catch (error) {
        logger.error(`Error handling next interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'next track');
        } else {
            showErrorNotification(serialNumber, `Next track failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleMuteToggleInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling mute toggle interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const isMuted = currentKeyData.data.currentState === 1;

        if (isMuted) {
            await ytMusicApi.unmute();
            currentKeyData.data.currentState = 0;
            logger.info('Audio unmuted');
            showErrorNotification(serialNumber, 'Audio unmuted', 'info', 'volume-high');
        } else {
            await ytMusicApi.mute();
            currentKeyData.data.currentState = 1;
            logger.info('Audio muted');
            showErrorNotification(serialNumber, 'Audio muted', 'info', 'volume-off');
        }

        // Update multi-state key display
        plugin.setMultiState(serialNumber, key, currentKeyData.data.currentState);

        // Update display after short delay
        setTimeout(() => {
            updateMuteToggleKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling mute toggle interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'mute toggle');
        } else {
            showErrorNotification(serialNumber, `Mute toggle failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleShuffleInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling shuffle interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const isShuffled = currentKeyData.data.currentState === 1;

        await ytMusicApi.shuffle();
        currentKeyData.data.currentState = isShuffled ? 0 : 1;
        
        const newStatus = !isShuffled ? 'enabled' : 'disabled';
        logger.info(`Shuffle ${newStatus}`);
        showErrorNotification(serialNumber, `Shuffle ${newStatus}`, 'info', 'shuffle');

        // Update multi-state key display
        plugin.setMultiState(serialNumber, key, currentKeyData.data.currentState);

        // Update display after short delay
        setTimeout(() => {
            updateShuffleKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling shuffle interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'shuffle');
        } else {
            showErrorNotification(serialNumber, `Shuffle failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleRepeatInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling repeat interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        // Cycle through repeat modes: 0 = no repeat, 1 = repeat all, 2 = repeat one
        currentKeyData.data.currentState = (currentKeyData.data.currentState + 1) % 3;
        
        const repeatModeNames = ['NONE', 'ALL', 'ONE'];
        const currentModeName = repeatModeNames[currentKeyData.data.currentState];
        
        // Use setRepeatMode with numeric value (0 = None, 1 = All, 2 = One)
        await ytMusicApi.setRepeatMode(currentKeyData.data.currentState);
        logger.info(`Repeat mode set to: ${currentModeName} (${currentKeyData.data.currentState})`);
        showErrorNotification(serialNumber, `Repeat: ${currentModeName}`, 'info', 'repeat');

        // Update multi-state key display
        plugin.setMultiState(serialNumber, key, currentKeyData.data.currentState);

        // Update display after short delay
        setTimeout(() => {
            updateRepeatKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling repeat interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'repeat');
        } else {
            showErrorNotification(serialNumber, `Repeat failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleSeekForwardInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling seek forward interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const seconds = currentKeyData.data.seconds || 10;
        
        const currentPosition = currentPlaybackState.progress || 0;
        const newPosition = currentPosition + seconds;
        
        await ytMusicApi.seekTo(newPosition);
        logger.info(`Seeked forward by ${seconds} seconds to ${newPosition}`);
        showErrorNotification(serialNumber, `+${seconds}s`, 'info', 'fast-forward');

    } catch (error) {
        logger.error(`Error handling seek forward interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'seek');
        } else {
            showErrorNotification(serialNumber, `Seek failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleSeekBackwardInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling seek backward interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const seconds = currentKeyData.data.seconds || 10;
        
        const currentPosition = currentPlaybackState.progress || 0;
        const newPosition = Math.max(0, currentPosition - seconds);
        
        await ytMusicApi.seekTo(newPosition);
        logger.info(`Seeked backward by ${seconds} seconds to ${newPosition}`);
        showErrorNotification(serialNumber, `-${seconds}s`, 'info', 'rewind');

    } catch (error) {
        logger.error(`Error handling seek backward interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'seek');
        } else {
            showErrorNotification(serialNumber, `Seek failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleSeekSliderInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling seek slider interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const sliderValue = data?.value || 0; // Assuming slider sends value 0-100
        
        const duration = currentPlaybackState.duration || currentKeyData.data.duration;
        const newPosition = (sliderValue / 100) * duration;
        
        await ytMusicApi.seekTo(newPosition);
        logger.info(`Seeked to position ${newPosition} (${sliderValue}%)`);
        showErrorNotification(serialNumber, `Seek: ${sliderValue}%`, 'info', 'clock');

        // Update display after short delay
        setTimeout(() => {
            updateSeekSliderKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling seek slider interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'seek slider');
        } else {
            showErrorNotification(serialNumber, `Seek slider failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handlePlayByIdInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling play by ID interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const videoId = currentKeyData.data.videoID;
        const playlistId = currentKeyData.data.playlistID;

        if (!videoId && !playlistId) {
            throw new Error('No video ID or playlist ID configured');
        }

        if (videoId) {
            await ytMusicApi.changeVideo(videoId);
            logger.info(`Playing video: ${videoId}`);
            showErrorNotification(serialNumber, `Playing video: ${videoId.substring(0, 8)}`, 'info', 'play');
        } else if (playlistId) {
            await ytMusicApi.changeVideo(null, playlistId);
            logger.info(`Playing playlist: ${playlistId}`);
            showErrorNotification(serialNumber, `Playing playlist: ${playlistId.substring(0, 8)}`, 'info', 'playlist-play');
        }

    } catch (error) {
        logger.error(`Error handling play by ID interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'play by ID');
        } else {
            showErrorNotification(serialNumber, `Play by ID failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleVolumeUpInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling volume up interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.volumeUp();
        logger.info('Volume increased');
        showErrorNotification(serialNumber, 'Volume increased', 'info', 'volume-high');

        // Update display after short delay
        setTimeout(() => {
            updateVolumeUpKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling volume up interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'volume control');
        } else {
            showErrorNotification(serialNumber, `Volume up failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleVolumeDownInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling volume down interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        await ytMusicApi.volumeDown();
        logger.info('Volume decreased');
        showErrorNotification(serialNumber, 'Volume decreased', 'info', 'volume-low');

        // Update display after short delay
        setTimeout(() => {
            updateVolumeDownKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling volume down interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'volume control');
        } else {
            showErrorNotification(serialNumber, `Volume down failed: ${error.message}`, 'error', 'warning');
        }
    }
}

async function handleVolumeSliderInteraction(serialNumber, key, data) {
    const keyId = `${serialNumber}-${key.uid}`;
    logger.info(`Handling volume slider interaction for key ${keyId}`);

    try {
        if (!ytMusicAuth.getAuthenticationStatus()) {
            throw new Error('Not authenticated');
        }

        const currentKeyData = keyManager.keyData[key.uid];
        const sliderValue = data?.value || 0; // Slider sends value 0-100
        
        // Update the key data with new volume
        currentKeyData.data.currentVolume = Math.round(sliderValue);
        
        await ytMusicApi.setVolume(Math.round(sliderValue));
        logger.info(`Volume set to ${Math.round(sliderValue)}`);
        showErrorNotification(serialNumber, `Volume: ${Math.round(sliderValue)}%`, 'info', 'volume');

        // Update display after short delay
        setTimeout(() => {
            updateVolumeSliderKeyDisplay(serialNumber, key);
        }, 500);

    } catch (error) {
        logger.error(`Error handling volume slider interaction: ${error.message}`);
        if (error.message.includes('Not authenticated')) {
            showAuthError(serialNumber, 'volume control');
        } else {
            showErrorNotification(serialNumber, `Volume slider failed: ${error.message}`, 'error', 'warning');
        }
    }
}

// Plugin event listeners
plugin.on('ui.message', async (payload) => {
    logger.info('Received message from UI:', payload);

    try {
        switch (payload.data) {
            case 'ytmusic-auth':
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
                return { success: true, message: 'Disconnected from YouTube Music' };

            case 'ytmusic-test':
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
                }

            case 'update-log-level':
                logger.updateLogLevelFromConfig();
                await updateNotificationLevelFromConfig();
                return { success: true };

            case 'update-notification-level':
                await updateNotificationLevelFromConfig();
                return { success: true };

            case 'ytmusic-test-realtime':
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
                    };
                } catch (error) {
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
                }

            case 'ytmusic-connect-realtime':
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
                }

            case 'get-state':
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
        showNotification(null, `Error handling message: ${error.message}`, 'error', 'warning');
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