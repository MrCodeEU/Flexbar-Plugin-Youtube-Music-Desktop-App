// YouTube Music Real-time Socket.IO Handler
const io = require('socket.io-client');
const logger = require('./loggerWrapper');

/**
 * Real-time state manager for YouTube Music using Socket.IO
 */
class YouTubeMusicRealtime {
    constructor(ytMusicApi) {
        this.ytMusicApi = ytMusicApi;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.stateUpdateCallbacks = [];
        this.playlistUpdateCallbacks = [];
        this.lastState = null;
        this.connectionAttemptTimer = null;
    }

    /**
     * Connect to the Socket.IO server
     */
    async connect() {
        if (this.socket && this.isConnected) {
            logger.debug('Socket.IO already connected');
            return true;
        }

        if (!this.ytMusicApi.getAuthenticationStatus()) {
            throw new Error('Must be authenticated before connecting to real-time updates');
        }

        const token = this.ytMusicApi.getToken();
        if (!token) {
            throw new Error('No authentication token available');
        }

        try {
            logger.info('Connecting to YouTube Music real-time updates...');

            // Important: Use IPv4 address as per documentation
            const socketUrl = 'http://127.0.0.1:9863/api/v1/realtime';
            
            this.socket = io(socketUrl, {
                transports: ['websocket'], // Required: websocket only
                auth: {
                    token: token
                },
                timeout: 10000,
                forceNew: true
            });

            return new Promise((resolve, reject) => {
                // Connection timeout
                const connectTimeout = setTimeout(() => {
                    logger.error('Socket.IO connection timeout');
                    this.disconnect();
                    reject(new Error('Connection timeout'));
                }, 15000);

                this.socket.on('connect', () => {
                    clearTimeout(connectTimeout);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 500;
                    logger.info('Successfully connected to YouTube Music real-time updates');
                    this.setupEventHandlers();
                    resolve(true);
                });

                this.socket.on('connect_error', (error) => {
                    clearTimeout(connectTimeout);
                    logger.error('Socket.IO connection error:', error.message);
                    this.handleConnectionError(error);
                    reject(error);
                });

                this.socket.on('disconnect', (reason) => {
                    logger.warn('Socket.IO disconnected:', reason);
                    this.isConnected = false;
                    this.handleDisconnection(reason);
                });

                this.socket.on('error', (error) => {
                    logger.error('Socket.IO error:', error);
                });
            });

        } catch (error) {
            logger.error('Failed to create Socket.IO connection:', error.message);
            throw error;
        }
    }

    /**
     * Setup event handlers for Socket.IO events
     */
    setupEventHandlers() {
        if (!this.socket) return;

        // State update events
        this.socket.on('state-update', (state) => {
            logger.debug('Received state update from YouTube Music');
            this.handleStateUpdate(state);
        });

        // Playlist events
        this.socket.on('playlist-created', (playlist) => {
            logger.info('Playlist created:', playlist.title);
            this.handlePlaylistCreated(playlist);
        });

        this.socket.on('playlist-delete', (playlistId) => {
            logger.info('Playlist deleted:', playlistId);
            this.handlePlaylistDeleted(playlistId);
        });
    }

    /**
     * Handle state updates
     */
    handleStateUpdate(state) {
        try {
            // Format the state using the API's formatter
            const formattedState = this.ytMusicApi.formatTrackState(state);
            
            // Check if this is a meaningful change
            if (this.shouldNotifyStateChange(formattedState)) {
                this.lastState = formattedState;
                
                // Notify all registered callbacks
                this.stateUpdateCallbacks.forEach(callback => {
                    try {
                        callback(formattedState, state);
                    } catch (error) {
                        logger.error('Error in state update callback:', error.message);
                    }
                });
            }
        } catch (error) {
            logger.error('Error handling state update:', error.message);
        }
    }

    /**
     * Determine if state change should trigger notifications
     */
    shouldNotifyStateChange(newState) {
        if (!this.lastState) return true;

        // Check for meaningful changes
        const meaningfulChanges = [
            'title',
            'artist',
            'isPlaying',
            'videoId',
            'likeStatus'
        ];

        for (const key of meaningfulChanges) {
            if (this.lastState[key] !== newState[key]) {
                logger.debug(`State change detected: ${key} changed from ${this.lastState[key]} to ${newState[key]}`);
                return true;
            }
        }

        // Check progress changes (only notify for significant jumps, not smooth progression)
        //const progressDiff = Math.abs((newState.progress || 0) - (this.lastState.progress || 0));
        //if (progressDiff > 2) { // More than 2 seconds difference
        //    logger.debug(`Significant progress change detected: ${progressDiff} seconds`);
        //    return true;
        //}
        // smooth progression:
        if (newState.progress !== this.lastState.progress) {
            logger.debug(`Progress change detected: ${this.lastState.progress} to ${newState.progress}`);
            return true;
        }

        return false;
    }

    /**
     * Handle playlist created
     */
    handlePlaylistCreated(playlist) {
        this.playlistUpdateCallbacks.forEach(callback => {
            try {
                callback('created', playlist);
            } catch (error) {
                logger.error('Error in playlist created callback:', error.message);
            }
        });
    }

    /**
     * Handle playlist deleted
     */
    handlePlaylistDeleted(playlistId) {
        this.playlistUpdateCallbacks.forEach(callback => {
            try {
                callback('deleted', { id: playlistId });
            } catch (error) {
                logger.error('Error in playlist deleted callback:', error.message);
            }
        });
    }

    /**
     * Handle connection errors
     */
    handleConnectionError(error) {
        this.isConnected = false;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        } else {
            logger.error('Max reconnection attempts reached, giving up');
        }
    }

    /**
     * Handle disconnection
     */
    handleDisconnection(reason) {
        this.isConnected = false;
        
        // Don't auto-reconnect if disconnection was intentional
        if (reason === 'io client disconnect') {
            logger.info('Intentional disconnection, not attempting to reconnect');
            return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule automatic reconnection
     */
    scheduleReconnect() {
        if (this.connectionAttemptTimer) {
            clearTimeout(this.connectionAttemptTimer);
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds

        logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        this.connectionAttemptTimer = setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                logger.error('Reconnection attempt failed:', error.message);
            }
        }, delay);
    }

    /**
     * Disconnect from Socket.IO
     */
    disconnect() {
        if (this.connectionAttemptTimer) {
            clearTimeout(this.connectionAttemptTimer);
            this.connectionAttemptTimer = null;
        }

        if (this.socket) {
            logger.info('Disconnecting from YouTube Music real-time updates');
            this.socket.disconnect();
            this.socket = null;
        }

        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.lastState = null;
    }

    /**
     * Register callback for state updates
     */
    onStateUpdate(callback) {
        if (typeof callback === 'function') {
            this.stateUpdateCallbacks.push(callback);
        }
    }

    /**
     * Register callback for playlist updates
     */
    onPlaylistUpdate(callback) {
        if (typeof callback === 'function') {
            this.playlistUpdateCallbacks.push(callback);
        }
    }

    /**
     * Remove callback
     */
    removeStateUpdateCallback(callback) {
        const index = this.stateUpdateCallbacks.indexOf(callback);
        if (index > -1) {
            this.stateUpdateCallbacks.splice(index, 1);
        }
    }

    /**
     * Remove playlist callback
     */
    removePlaylistUpdateCallback(callback) {
        const index = this.playlistUpdateCallbacks.indexOf(callback);
        if (index > -1) {
            this.playlistUpdateCallbacks.splice(index, 1);
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            hasSocket: !!this.socket,
            lastState: this.lastState
        };
    }

    /**
     * Force a reconnection
     */
    async forceReconnect() {
        logger.info('Forcing Socket.IO reconnection...');
        this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
        return await this.connect();
    }
}

module.exports = YouTubeMusicRealtime;