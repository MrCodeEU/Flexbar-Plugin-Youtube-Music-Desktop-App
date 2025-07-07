// Key interaction handler functions for FlexBar plugin
const keyManager = require('./keyManager.js');
const logger = require('./loggerwrapper.js');
const { plugin } = require('@eniac/flexdesigner');
const { 
    updateNowPlayingKeyDisplay,
    updateLikeKeyDisplay,
    updateDislikeKeyDisplay,
    updatePlayPauseKeyDisplay,
    updateMuteToggleKeyDisplay,
    updateShuffleKeyDisplay,
    updateRepeatKeyDisplay,
    updateSeekSliderKeyDisplay,
    updateVolumeUpKeyDisplay,
    updateVolumeDownKeyDisplay,
    updateVolumeSliderKeyDisplay
} = require('./keyHandlerUpdate.js');

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
    logger.info(`Handling dislike interaction for key ${keyId}`);
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

// Export all interaction handler functions
module.exports = {
    initializeModule,
    handleNowPlayingInteraction,
    handleLikeInteraction,
    handleDislikeInteraction,
    handlePlayPauseInteraction,
    handlePreviousKeyInteraction,
    handleNextKeyInteraction,
    handleMuteToggleInteraction,
    handleShuffleInteraction,
    handleRepeatInteraction,
    handleSeekForwardInteraction,
    handleSeekBackwardInteraction,
    handleSeekSliderInteraction,
    handlePlayByIdInteraction,
    handleVolumeUpInteraction,
    handleVolumeDownInteraction,
    handleVolumeSliderInteraction
};

