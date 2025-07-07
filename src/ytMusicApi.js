// YouTube Music Companion Server API wrapper
const logger = require('./loggerwrapper.js');

/**
 * YouTube Music API wrapper for Companion Server
 * Handles authentication, state management, and player controls
 */
class YouTubeMusicApi {
    constructor() {
        this.baseUrl = 'http://localhost:9863/api/v1';
        this.token = null;
        this.isAuthenticated = false;
        this.appId = null;
        this.currentState = null;
        this.lastStateUpdate = null;
    }

    /**
     * Check if the companion server is running
     */
    async checkServerStatus() {
        try {
            const response = await fetch('http://localhost:9863/metadata');
            const data = await response.json();
            logger.info('YouTube Music Companion Server is running, API versions:', data.apiVersions);
            return true;
        } catch (error) {
            logger.error('YouTube Music Companion Server is not running:', error.message);
            return false;
        }
    }

    /**
     * Makes an authenticated request to the API
     */
    async makeRequest(endpoint, method = 'GET', body = null) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with YouTube Music Companion Server');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.token
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            
            // Check rate limit headers
            const remaining = response.headers.get('x-ratelimit-remaining');
            const resetTime = response.headers.get('x-ratelimit-reset');
            
            if (remaining && parseInt(remaining) < 5) {
                logger.warn(`Rate limit warning: ${remaining} requests remaining until ${resetTime}`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            logger.error(`Error making request to ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * Request authentication code from companion server
     */
    async requestAuthCode(appName, appVersion) {
        // Generate a unique app ID based on the app name
        this.appId = appName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 32);
        
        if (this.appId.length < 2) {
            this.appId = 'flexbarytmusic'; // Fallback
        }

        const requestBody = {
            appId: this.appId,
            appName: appName,
            appVersion: appVersion
        };

        try {
            const response = await fetch(`${this.baseUrl}/auth/requestcode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to request auth code: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            logger.info('Authentication code requested successfully');
            return data.code;
        } catch (error) {
            logger.error('Failed to request authentication code:', error.message);
            throw error;
        }
    }

    /**
     * Exchange code for authentication token
     * Note: This may take up to 30 seconds as user interaction is required
     */
    async exchangeCodeForToken(code) {
        if (!this.appId) {
            throw new Error('App ID not set. Call requestAuthCode first.');
        }

        const requestBody = {
            appId: this.appId,
            code: code
        };

        try {
            logger.info('Exchanging code for token (this may take up to 30 seconds)...');
            
            const response = await fetch(`${this.baseUrl}/auth/request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to exchange code for token: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            this.token = data.token;
            this.isAuthenticated = true;
            
            logger.info('Successfully authenticated with YouTube Music Companion Server');
            return data.token;
        } catch (error) {
            logger.error('Failed to exchange code for token:', error.message);
            throw error;
        }
    }

    /**
     * Set existing token (for saved authentication)
     */
    setToken(token, appId) {
        this.token = token;
        this.appId = appId;
        this.isAuthenticated = true;
        logger.info('Token set for YouTube Music API');
    }

    /**
     * Get current authentication status
     */
    getAuthenticationStatus() {
        return this.isAuthenticated;
    }

    /**
     * Get current token
     */
    getToken() {
        return this.token;
    }

    /**
     * Get current app ID
     */
    getAppId() {
        return this.appId;
    }

    /**
     * Get current player state
     */
    async getCurrentState() {
        try {
            const state = await this.makeRequest('/state');
            this.currentState = state;
            this.lastStateUpdate = Date.now();
            return state;
        } catch (error) {
            logger.error('Failed to get current state:', error.message);
            throw error;
        }
    }

    /**
     * Get user playlists (can take up to 30 seconds)
     */
    async getPlaylists() {
        try {
            return await this.makeRequest('/playlists');
        } catch (error) {
            logger.error('Failed to get playlists:', error.message);
            throw error;
        }
    }

    /**
     * Send player command
     */
    async sendCommand(command, data = null) {
        const body = { command };
        if (data !== null) {
            body.data = data;
        }

        try {
            return await this.makeRequest('/command', 'POST', body);
        } catch (error) {
            logger.error(`Failed to send command ${command}:`, error.message);
            throw error;
        }
    }

    // Player control methods
    async playPause() {
        return await this.sendCommand('playPause');
    }

    async play() {
        return await this.sendCommand('play');
    }

    async pause() {
        return await this.sendCommand('pause');
    }

    async next() {
        return await this.sendCommand('next');
    }

    async previous() {
        return await this.sendCommand('previous');
    }

    async setVolume(volume) {
        if (volume < 0 || volume > 100) {
            throw new Error('Volume must be between 0 and 100');
        }
        return await this.sendCommand('setVolume', volume);
    }

    async volumeUp() {
        return await this.sendCommand('volumeUp');
    }

    async volumeDown() {
        return await this.sendCommand('volumeDown');
    }

    async mute() {
        return await this.sendCommand('mute');
    }

    async unmute() {
        return await this.sendCommand('unmute');
    }

    async seekTo(seconds) {
        if (seconds < 0) {
            throw new Error('Seek position must be non-negative');
        }
        return await this.sendCommand('seekTo', seconds);
    }

    async setRepeatMode(mode) {
        // 0 = None, 1 = All, 2 = One
        if (![0, 1, 2].includes(mode)) {
            throw new Error('Repeat mode must be 0 (None), 1 (All), or 2 (One)');
        }
        return await this.sendCommand('repeatMode', mode);
    }

    async shuffle() {
        return await this.sendCommand('shuffle');
    }

    async playQueueIndex(index) {
        if (index < 0) {
            throw new Error('Queue index must be non-negative');
        }
        return await this.sendCommand('playQueueIndex', index);
    }

    async toggleLike() {
        return await this.sendCommand('toggleLike');
    }

    async toggleDislike() {
        return await this.sendCommand('toggleDislike');
    }

    async changeVideo(videoId = null, playlistId = null) {
        if (!videoId && !playlistId) {
            throw new Error('Either videoId or playlistId must be provided');
        }
        return await this.sendCommand('changeVideo', { videoId, playlistId });
    }

    /**
     * Clear authentication
     */
    clearAuth() {
        this.token = null;
        this.appId = null;
        this.isAuthenticated = false;
        this.currentState = null;
        this.lastStateUpdate = null;
        logger.info('YouTube Music authentication cleared');
    }

    /**
     * Helper method to format track state for display
     */
    formatTrackState(state) {
        if (!state || !state.video) {
            return null;
        }

        const video = state.video;
        const player = state.player;

        return {
            title: video.title || 'Unknown Title',
            artist: video.author || 'Unknown Artist',
            album: video.album || null,
            albumId: video.albumId || null,
            duration: video.durationSeconds || 0,
            progress: player.videoProgress || 0,
            isPlaying: player.trackState === 1, // 1 = Playing
            isPaused: player.trackState === 0,  // 0 = Paused
            isBuffering: player.trackState === 2, // 2 = Buffering
            volume: player.volume || 0,
            likeStatus: video.likeStatus, // -1 Unknown, 0 Dislike, 1 Indifferent, 2 Like
            thumbnails: video.thumbnails || [],
            videoId: video.id,
            playlistId: state.playlistId,
            isLive: video.isLive || false,
            videoType: video.videoType || -1,
            adPlaying: player.adPlaying || false,
            queue: player.queue || null,
            repeatMode: player.queue?.repeatMode || -1, // -1 Unknown, 0 None, 1 All, 2 One
        };
    }
}

module.exports = YouTubeMusicApi;