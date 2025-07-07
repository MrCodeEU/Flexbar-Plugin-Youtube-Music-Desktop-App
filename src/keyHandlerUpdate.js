// Key update/display functions for FlexBar plugin
const canvasRenderer = require('./canvasRenderer.js');
const keyManager = require('./keyManager.js');
const logger = require('./loggerwrapper.js');
const { plugin } = require('@eniac/flexdesigner');

// Module-level references to instances passed from plugin.js
let currentPlaybackState = null;

// Initialize the module with instances from plugin.js
function initializeModule(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn) {
    currentPlaybackState = stateInstance;
    // Note: This module doesn't need auth/api instances, only state
}

// Helper functions for error notifications
function showErrorNotification(serialNumber, message, level = 'error', icon = 'warning') {
    // Implementation would be here - for now just log
    logger.info(`Notification: ${message}`);
}

function showAuthError(serialNumber, action = 'action') {
    showErrorNotification(serialNumber, `Authentication required for ${action}`, 'warning', 'warning');
}

// Always use real-time state for playback info
function getCurrentPlaybackState() {
    return currentPlaybackState;
}

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

        // Get the current playback state
        const playbackState = getCurrentPlaybackState();
        let trackData = null;

        // Extract track data from the playback state
        if (playbackState && playbackState.currentTrack) {
            trackData = playbackState.currentTrack;
        }

        // If no track data available, show default state
        const title = trackData?.title || 'Nothing Playing';
        const artist = trackData?.artist || '';
        const isPlaying = playbackState?.isPlaying || false;
        const progress = playbackState?.progress || 0;
        const duration = playbackState?.duration || trackData?.duration || 0;
        const albumArt = trackData?.thumbnails?.length > 0 ? trackData.thumbnails[0].url : null;

        logger.debug(`Updating now playing display: "${title}" by "${artist}", playing: ${isPlaying}, progress: ${progress}/${duration}`);

        const buttonDataUrl = await canvasRenderer.createYouTubeMusicButtonDataUrl(
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

        const buttonDataUrl = await canvasRenderer.createYouTubeMusicButtonDataUrl(
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
            logger.warn(`Attempted to update inactive dislike key ${keyId}`);
            return;
        }

        const currentKeyData = keyManager.keyData[key.uid];
        if (!currentKeyData || !currentKeyData.data) {
            logger.error(`Key data missing for dislike key ${key.uid} during display update`);
            return;
        }

        // Update with current track's like status
        const likeStatus = currentPlaybackState.likeStatus;
        currentKeyData.data.isLiked = likeStatus;
        currentKeyData.data.currentTrackId = currentPlaybackState.currentTrack?.videoId;

        const buttonDataUrl = await canvasRenderer.createYouTubeMusicButtonDataUrl(
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
        keyManager.textOnlyDraw(serialNumber, key, 'Dislike Error');
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

        const buttonDataUrl = await canvasRenderer.createYouTubeMusicButtonDataUrl(
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

        // Use real-time repeat mode from currentPlaybackState
        // repeatMode: -1 Unknown, 0 None, 1 All, 2 One
        const repeatMode = currentPlaybackState.repeatMode || -1;
        
        // Map repeat mode to multi-state value (0-based for FlexBar)
        let multiStateValue = 0; // Default to "None"
        if (repeatMode === 1) {
            multiStateValue = 1; // "All"
        } else if (repeatMode === 2) {
            multiStateValue = 2; // "One"
        }
        
        // Update the key's internal state to match real-time state
        currentKeyData.data.currentState = multiStateValue;
        
        plugin.setMultiState(serialNumber, key, multiStateValue);
        logger.debug(`Updated repeat mode to: ${repeatMode} (multi-state: ${multiStateValue})`);
        //keyManager.simpleTextDraw(serialNumber, currentKeyData, text, currentKeyData.data.bgColor);
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

        const seconds = currentKeyData.data.seconds || 10;
        keyManager.simpleTextDraw(serialNumber, currentKeyData, `+${seconds}s`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating seek forward key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Seek+ Error');
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

        const seconds = currentKeyData.data.seconds || 10;
        keyManager.simpleTextDraw(serialNumber, currentKeyData, `-${seconds}s`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating seek backward key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Seek- Error');
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

        // Use real-time volume from currentPlaybackState
        const volume = currentPlaybackState.volume || 50;
        
        // Update the key's internal state to match real-time state
        currentKeyData.data.currentVolume = volume;
        
        plugin.setSlider(serialNumber, key, volume);
        logger.debug(`Updated volume slider to: ${volume}%`);
        //keyManager.simpleTextDraw(serialNumber, currentKeyData, `Vol: ${volume}%`, currentKeyData.data.bgColor);
    } catch (error) {
        logger.error(`Error updating volume slider key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Volume Error');
    }
}

// Export all update functions
module.exports = {
    initializeModule,
    updateNowPlayingKeyDisplay,
    updateLikeKeyDisplay,
    updateDislikeKeyDisplay,
    updatePlayPauseKeyDisplay,
    updatePreviousKeyDisplay,
    updateNextKeyDisplay,
    updateMuteToggleKeyDisplay,
    updateShuffleKeyDisplay,
    updateRepeatKeyDisplay,
    updateSeekForwardKeyDisplay,
    updateSeekBackwardKeyDisplay,
    updateSeekSliderKeyDisplay,
    updatePlayByIdKeyDisplay,
    updateVolumeUpKeyDisplay,
    updateVolumeDownKeyDisplay,
    updateVolumeSliderKeyDisplay
};

