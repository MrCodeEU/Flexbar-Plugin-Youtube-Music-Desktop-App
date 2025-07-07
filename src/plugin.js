// YouTube Music FlexBar Plugin - Main Entry Point
const { plugin } = require('@eniac/flexdesigner');
const logger = require('./loggerwrapper.js');
const keyManager = require('./keyManager.js');
const YouTubeMusicApi = require('./ytMusicApi.js');
const YouTubeMusicAuth = require('./ytMusicAuth.js');
const YouTubeMusicRealtime = require('./ytMusicRealtime.js');
const keyHandler = require('./keyHandler.js');

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

// Initialize handler modules with the instances
keyHandler.initializeAllModules(ytMusicAuth, ytMusicApi, currentPlaybackState, showNotification, showAuthError);

// Helper to update currentPlaybackState from trackData
function updateCurrentPlaybackStateFromTrack(trackData) {
    if (!trackData) return;
    
    const oldVolume = currentPlaybackState.volume;
    const oldIsPlaying = currentPlaybackState.isPlaying;
    
    currentPlaybackState.currentTrack = trackData;
    currentPlaybackState.isPlaying = trackData.isPlaying || false;
    currentPlaybackState.progress = trackData.progress || 0;
    currentPlaybackState.duration = trackData.duration || 0;
    currentPlaybackState.likeStatus = trackData.likeStatus;
    currentPlaybackState.lastUpdate = Date.now();
    currentPlaybackState.repeatMode = trackData.repeatMode || -1;
    currentPlaybackState.volume = trackData.volume || 50;
    
    // Log significant changes
    if (oldVolume !== currentPlaybackState.volume) {
        logger.debug(`Volume changed: ${oldVolume} -> ${currentPlaybackState.volume}`);
    }
    if (oldIsPlaying !== currentPlaybackState.isPlaying) {
        logger.debug(`Play state changed: ${oldIsPlaying} -> ${currentPlaybackState.isPlaying}`);
    }
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

    // initialize or update authentication first
    logger.info('Initializing YouTube Music authentication from config...');
    plugin.getConfig().then(async config => {
        if (config && config.isAuthenticated && config.token && config.appId) {
            logger.info('Found saved authentication data, setting token...');
            ytMusicApi.setToken(config.token, config.appId);
            ytMusicApi.isAuthenticated = true;
            ytMusicAuth.isAuthenticated = true;
            logger.info('Authentication initialized from saved config');
            
            // Try to establish real-time connection early if we have authentication
            try {
                if (!currentPlaybackState.realTimeConnected) {
                    logger.info('Authentication detected, establishing real-time connection...');
                    await connectToRealTimeUpdates();
                    logger.info('Real-time connection established during initialization');
                } else {
                    logger.info('Real-time connection already established');
                }
            } catch (error) {
                logger.error('Failed to establish real-time connection during initialization:', error.message);
                logger.error('Real-time connection error details:', error);
            }
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
                    initPromises.push(keyHandler.initializeNowPlayingKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.like':
                    initPromises.push(keyHandler.initializeLikeKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.playpause':
                    initPromises.push(keyHandler.initializePlayPauseKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.dislike':
                    initPromises.push(keyHandler.initializeDislikeKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.previous':
                    initPromises.push(keyHandler.initializePreviousKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.next':
                    initPromises.push(keyHandler.initializeNextKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.mutetoggle':
                    initPromises.push(keyHandler.initializeMuteToggleKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.shuffle':
                    initPromises.push(keyHandler.initializeShuffleKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.repeat':
                    initPromises.push(keyHandler.initializeRepeatKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekforward':
                    initPromises.push(keyHandler.initializeSeekForwardKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekbackward':
                    initPromises.push(keyHandler.initializeSeekBackwardKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.seekslider':
                    initPromises.push(keyHandler.initializeSeekSliderKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.playbyid':
                    initPromises.push(keyHandler.initializePlayByIdKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumeup':
                    initPromises.push(keyHandler.initializeVolumeUpKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumedown':
                    initPromises.push(keyHandler.initializeVolumeDownKey(serialNumber, key));
                    break;
                case 'at.mrcode.ytmd.volumeslider':
                    initPromises.push(keyHandler.initializeVolumeSliderKey(serialNumber, key));
                    break;
            }
        } else {
            logger.debug(`Key ${keyId} confirmed active.`);
        }
    }

        // Connect to real-time updates if we have any YouTube Music keys and authentication
        // This ensures we get real-time state for all keys
        const hasYouTubeMusicKeys = incomingKeys.some(key => 
            key.cid.includes('at.mrcode.ytmd.')
        );
        
        if (hasYouTubeMusicKeys && ytMusicAuth.getAuthenticationStatus() && !currentPlaybackState.realTimeConnected) {
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
            updateAllActiveKeys();
        }).catch(error => {
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
            keyHandler.handleNowPlayingInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.like':
            keyHandler.handleLikeInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.dislike':
            keyHandler.handleDislikeInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.playpause':
            keyHandler.handlePlayPauseInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.previous':
            keyHandler.handlePreviousKeyInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.next':
            keyHandler.handleNextKeyInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.mutetoggle':
            keyHandler.handleMuteToggleInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.shuffle':
            keyHandler.handleShuffleInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.repeat':
            keyHandler.handleRepeatInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekforward':
            keyHandler.handleSeekForwardInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekbackward':
            keyHandler.handleSeekBackwardInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.seekslider':
            keyHandler.handleSeekSliderInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.playbyid':
            keyHandler.handlePlayByIdInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumeup':
            keyHandler.handleVolumeUpInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumedown':
            keyHandler.handleVolumeDownInteraction(serialNumber, key, data);
            break;
        case 'at.mrcode.ytmd.volumeslider':
            keyHandler.handleVolumeSliderInteraction(serialNumber, key, data);
            break;
    }
}

// Real-time connection management
async function connectToRealTimeUpdates() {
    logger.info('connectToRealTimeUpdates() called');
    
    if (!ytMusicAuth.getAuthenticationStatus()) {
        logger.error('Not authenticated, cannot connect to real-time updates');
        throw new Error('Not authenticated');
    }
    
    if (!ytMusicApi.getToken()) {
        logger.error('No token available, cannot connect to real-time updates');
        throw new Error('No token available');
    }
    
    logger.info('Checking current real-time connection status...');
    
    try {
        if (currentPlaybackState.realTimeConnected) {
            // Verify the connection is actually working
            const connectionStatus = ytMusicRealtime.getConnectionStatus();
            logger.info('Current connection status:', connectionStatus);
            if (connectionStatus.isConnected) {
                logger.debug('Real-time updates already connected and verified');
                return;
            } else {
                logger.warn('Real-time connection marked as connected but socket is not active, reconnecting...');
                currentPlaybackState.realTimeConnected = false;
            }
        }

        logger.info('Establishing YouTube Music real-time connection...');
        await ytMusicRealtime.connect();
        currentPlaybackState.realTimeConnected = true;
        logger.info('Real-time connection established successfully');

        // Register for state updates - this is our primary data source
        ytMusicRealtime.onStateUpdate((formattedState, rawState) => {
            logger.debug('Real-time state update callback triggered');
            handleRealTimeStateUpdate(formattedState, rawState);
        });
        
        logger.info('Real-time state update callback registered');
        
        // Initial state will be requested via REST API by the connection handler
        // Socket.IO will then provide real-time updates via events (state-update, etc.)
        
    } catch (error) {
        logger.error('Failed to establish real-time connection:', error.message);
        logger.error('Real-time connection error stack:', error.stack);
        currentPlaybackState.realTimeConnected = false;
        showNotification(null, `Real-time connection failed: ${error.message}`, 'error', 'warning');
        throw error;
    }
}

// Helper function to ensure real-time connection is active
async function ensureRealTimeConnection() {
    if (!ytMusicAuth.getAuthenticationStatus()) {
        logger.debug('Not authenticated, cannot establish real-time connection');
        return false;
    }

    // Check if connection is marked as active
    if (currentPlaybackState.realTimeConnected) {
        // Verify the connection is actually working
        const connectionStatus = ytMusicRealtime.getConnectionStatus();
        if (connectionStatus.isConnected) {
            // Connection is good, don't try to refresh state here to avoid timeout loops
            return true;
        } else {
            logger.warn('Real-time connection marked as connected but socket is not active');
            currentPlaybackState.realTimeConnected = false;
        }
    }

    // Connection is not active or broken, establish new connection
    try {
        await connectToRealTimeUpdates();
        return currentPlaybackState.realTimeConnected;
    } catch (error) {
        logger.error('Failed to ensure real-time connection:', error.message);
        return false;
    }
}

// Always use real-time state for playback info
function getCurrentPlaybackState() {
    // Use the last state from the real-time connection if available and recent
    const lastState = ytMusicRealtime.getLastState();
    if (lastState && ytMusicRealtime.hasRecentState(30000)) {
        return lastState;
    }
    
    // Fallback to the old state if real-time is not available or stale
    return currentPlaybackState;
}

// Enhanced state fetcher that prioritizes real-time data
async function getCurrentTrackState() {
    // Always prefer real-time data if connected
    if (currentPlaybackState.realTimeConnected) {
        // Use cached real-time data first (Socket.IO API only sends updates, no requests)
        const lastState = ytMusicRealtime.getLastState();
        if (lastState && ytMusicRealtime.hasRecentState(30000)) {
            logger.debug('Using recent real-time track state');
            return lastState;
        }
        
        logger.debug('Real-time connected but no recent state, falling back to API');
    }

    // Fallback: direct API call (has rate limits)
    if (ytMusicAuth.getAuthenticationStatus()) {
        try {
            logger.debug('Fetching track state from direct API (rate limited)');
            const state = await ytMusicApi.getCurrentState();
            const trackData = ytMusicApi.formatTrackState(state);
            
            if (trackData) {
                updateCurrentPlaybackStateFromTrack(trackData);
                return trackData;
            }
        } catch (error) {
            logger.warn('Failed to fetch current track state from API:', error.message);
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
                keyHandler.updateNowPlayingKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.like':
                keyHandler.updateLikeKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.dislike':
                keyHandler.updateDislikeKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.playpause':
                keyHandler.updatePlayPauseKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.previous':
                keyHandler.updatePreviousKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.next':
                keyHandler.updateNextKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.mutetoggle':
                keyHandler.updateMuteToggleKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.shuffle':
                keyHandler.updateShuffleKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.repeat':
                keyHandler.updateRepeatKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekforward':
                keyHandler.updateSeekForwardKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekbackward':
                keyHandler.updateSeekBackwardKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.seekslider':
                keyHandler.updateSeekSliderKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.playbyid':
                keyHandler.updatePlayByIdKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumeup':
                keyHandler.updateVolumeUpKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumedown':
                keyHandler.updateVolumeDownKeyDisplay(serialNumber, key);
                break;
            case 'at.mrcode.ytmd.volumeslider':
                keyHandler.updateVolumeSliderKeyDisplay(serialNumber, key);
                break;
        }
    });
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
