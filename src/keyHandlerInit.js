// Key initialization functions for FlexBar plugin
const { updateNowPlayingKeyDisplay, updateLikeKeyDisplay, updateDislikeKeyDisplay, updatePlayPauseKeyDisplay, updatePreviousKeyDisplay, updateNextKeyDisplay, updateMuteToggleKeyDisplay, updateShuffleKeyDisplay, updateRepeatKeyDisplay, updateSeekForwardKeyDisplay, updateSeekBackwardKeyDisplay, updateSeekSliderKeyDisplay, updatePlayByIdKeyDisplay, updateVolumeUpKeyDisplay, updateVolumeDownKeyDisplay, updateVolumeSliderKeyDisplay } = require('./keyHandlerUpdate.js');
const keyManager = require('./keyManager.js');
const logger = require('./loggerwrapper.js');
const renderer = require('./canvasRenderer.js');

// Module-level references to instances passed from plugin.js
let ytMusicAuth = null;
let ytMusicApi = null;
let currentPlaybackState = null;
let showErrorNotification = null;
let showAuthError = null;

// Initialize the module with instances from plugin.js
function initializeModule(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn) {
    ytMusicAuth = authInstance;
    ytMusicApi = apiInstance;
    currentPlaybackState = stateInstance;
    showErrorNotification = errorNotificationFn;
    showAuthError = authErrorFn;
}

// Helper function to update currentPlaybackState from trackData
function updateCurrentPlaybackStateFromTrack(trackData) {
    if (!trackData || !currentPlaybackState) return;
    
    currentPlaybackState.currentTrack = trackData;
    currentPlaybackState.isPlaying = trackData.isPlaying || false;
    currentPlaybackState.progress = trackData.progress || 0;
    currentPlaybackState.duration = trackData.duration || 0;
    currentPlaybackState.volume = trackData.volume || currentPlaybackState.volume;
    currentPlaybackState.likeStatus = trackData.isLiked;
    currentPlaybackState.lastUpdate = Date.now();
}

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
        keyManager.simpleDraw(serialNumber, key, loadingImage);
    } catch (error) {
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
            }
        } catch (error) {
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

    logger.info('Initializing dislike key:', keyId);

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

// Export all initialization functions
module.exports = {
    initializeModule,
    initializeNowPlayingKey,
    initializeLikeKey,
    initializeDislikeKey,
    initializePlayPauseKey,
    initializePreviousKey,
    initializeNextKey,
    initializeMuteToggleKey,
    initializeShuffleKey,
    initializeRepeatKey,
    initializeSeekForwardKey,
    initializeSeekBackwardKey,
    initializeSeekSliderKey,
    initializePlayByIdKey,
    initializeVolumeUpKey,
    initializeVolumeDownKey,
    initializeVolumeSliderKey
};

