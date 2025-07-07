// YouTube Music Real-time Socket.IO Handler
const io = require('socket.io-client');
const logger = require('./loggerwrapper.js');

/**
 * Real-time state manager for YouTube Music using Socket.IO
 */
class YouTubeMusicRealtime {
    constructor(ytMusicApi) {
        this.ytMusicApi = ytMusicApi;
        this.socket = null;
        this.isConnected = false;
        this.connecting = false; // Prevent concurrent connections
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
        logger.info('ytMusicRealtime.connect() called');
        
        if (this.connecting) {
            logger.debug('Socket.IO connection already in progress');
            return false;
        }
        if (this.socket && this.isConnected) {
            logger.debug('Socket.IO already connected');
            return true;
        }
        if (this.socket && !this.isConnected) {
            logger.debug('Socket.IO socket exists but not connected, disconnecting first');
            this.disconnect();
        }
        if (!this.ytMusicApi.getAuthenticationStatus()) {
            logger.error('Must be authenticated before connecting to real-time updates');
            throw new Error('Must be authenticated before connecting to real-time updates');
        }
        const token = this.ytMusicApi.getToken();
        if (!token) {
            logger.error('No authentication token available');
            throw new Error('No authentication token available');
        }
        
        logger.info('Token available, proceeding with connection. Token starts with:', token.substring(0, 20) + '...');
        
        try {
            this.connecting = true;
            logger.info('Connecting to YouTube Music real-time updates...');
            // Important: Use IPv4 address as per documentation
            const socketUrl = 'http://127.0.0.1:9863/api/v1/realtime';
            logger.info('Socket.IO URL:', socketUrl);
            
            this.socket = io(socketUrl, {
                transports: ['websocket'], // Required: websocket only
                auth: {
                    token: token
                },
                timeout: 10000,
                forceNew: true
            });
            
            logger.info('Socket.IO client created, setting up event handlers...');
            
            // Register event handlers immediately after socket creation
            this.setupEventHandlers();
            
            return new Promise((resolve, reject) => {
                // Connection timeout
                const connectTimeout = setTimeout(() => {
                    logger.error('Socket.IO connection timeout');
                    this.connecting = false;
                    this.disconnect();
                    reject(new Error('Connection timeout'));
                }, 15000);
                
                this.socket.on('connect', () => {
                    logger.info('Socket.IO connect event received');
                    clearTimeout(connectTimeout);
                    this.isConnected = true;
                    this.connecting = false;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 500;
                    logger.info('Successfully connected to YouTube Music real-time updates');
                    resolve(true);
                });
                
                this.socket.on('connect_error', (error) => {
                    logger.error('Socket.IO connect_error event received:', error.message);
                    clearTimeout(connectTimeout);
                    this.isConnected = false;
                    this.connecting = false;
                    logger.error('Socket.IO connection error:', error.message);
                    this.handleConnectionError(error);
                    reject(error);
                });
                
                this.socket.on('disconnect', (reason) => {
                    logger.warn('Socket.IO disconnect event received:', reason);
                    this.isConnected = false;
                    this.connecting = false;
                    this.handleDisconnection(reason);
                });
                
                this.socket.on('error', (error) => {
                    logger.error('Socket.IO error event received:', error);
                });
            });
        } catch (error) {
            this.connecting = false;
            logger.error('Failed to create Socket.IO connection:', error.message);
            logger.error('Socket.IO connection error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Setup event handlers for Socket.IO events
     */
    setupEventHandlers() {
        logger.info('setupEventHandlers() called');
        if (!this.socket) {
            logger.error('setupEventHandlers: no socket, returning');
            return;
        }
        // Prevent multiple registrations for the same socket instance
        if (this._handlersRegistered) {
            logger.info('setupEventHandlers: handlers already registered, skipping');
            return;
        }
        this._handlersRegistered = true;
        logger.info('Registering Socket.IO event handlers');
        
        // State update events - this is the primary way we get updates
        this.socket.on('state-update', (state) => {
            logger.debug('Received state update event from Socket.IO', {
                title: state?.video?.title,
                artist: state?.video?.author,
                isPlaying: state?.player?.trackState === 1,
                volume: state?.player?.volume,
                progress: state?.player?.progress,
                videoId: state?.video?.id
            });
            // Actually handle the state update
            this.handleStateUpdate(state);
        });
        
        // Test event handler to verify Socket.IO is working
        this.socket.on('connect', () => {
            logger.info('Socket.IO connect event received in setupEventHandlers');
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
        // Connection status events
        this.socket.on('connect', () => {
            logger.info('Real-time connection established successfully');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            // Request initial state via REST API since Socket.IO only sends updates
            setTimeout(() => {
                this.requestInitialState().catch(error => {
                    logger.debug('Could not get initial state via REST API:', error.message);
                    // This is not a critical error since we'll get updates via Socket.IO
                });
            }, 500);
        });
        this.socket.on('disconnect', (reason) => {
            logger.warn('Real-time connection disconnected:', reason);
            this.isConnected = false;
            this.connecting = false;
            this.handleDisconnection(reason);
        });
        this.socket.on('error', (error) => {
            logger.error('Real-time connection error:', error);
            this.handleConnectionError(error);
        });
    }

    /**
     * Handle state updates
     */
    handleStateUpdate(state) {
        logger.info('*** handleStateUpdate() called ***', {
            hasState: !!state,
            hasVideo: !!state?.video,
            hasPlayer: !!state?.player,
            title: state?.video?.title,
            isPlaying: state?.player?.trackState === 1,
            volume: state?.player?.volume
        });
        
        try {
            // Format the state using the API's formatter
            const formattedState = this.ytMusicApi.formatTrackState(state);
            
            logger.info('State formatted successfully', {
                hasFormattedState: !!formattedState,
                title: formattedState?.title,
                isPlaying: formattedState?.isPlaying,
                volume: formattedState?.volume
            });
            
            if (formattedState) {
                // Add timestamp for tracking freshness
                formattedState.lastUpdate = Date.now();
                
                // Check if this is a meaningful change
                if (this.shouldNotifyStateChange(formattedState)) {
                    logger.info('State change detected, notifying callbacks');
                    this.lastState = formattedState;
                    
                    // Notify all registered callbacks
                    this.stateUpdateCallbacks.forEach(callback => {
                        try {
                            logger.debug('Calling state update callback');
                            callback(formattedState, state);
                        } catch (error) {
                            logger.error('Error in state update callback:', error.message);
                        }
                    });
                } else {
                    logger.debug('No meaningful state change, not notifying callbacks');
                    // Even if we don't notify, update lastState for progress tracking
                    this.lastState = formattedState;
                }
            } else {
                logger.warn('Failed to format state - formatTrackState returned null');
            }
        } catch (error) {
            logger.error('Error handling state update:', error.message);
            logger.error('State update error stack:', error.stack);
        }
    }

    /**
     * Determine if state change should trigger notifications
     */
    shouldNotifyStateChange(newState) {
        if (!this.lastState) {
            logger.debug('First state update, triggering notification');
            return true;
        }

        if (!newState) {
            logger.debug('No new state data, skipping notification');
            return false;
        }

        // Check for meaningful changes
        const meaningfulChanges = [
            'title',
            'artist', 
            'videoId',
            'isPlaying',
            'isPaused',
            'likeStatus',
            'volume',
            'repeatMode'
        ];

        for (const key of meaningfulChanges) {
            if (this.lastState[key] !== newState[key]) {
                logger.debug(`State change detected: ${key} changed from ${this.lastState[key]} to ${newState[key]}`);
                return true;
            }
        }

        // Check for significant progress changes (more than 2 seconds difference for seek detection)
        const progressDiff = Math.abs((newState.progress || 0) - (this.lastState.progress || 0));
        if (progressDiff > 2) {
            logger.debug(`Significant progress change detected: ${progressDiff} seconds`);
            return true;
        }

        // Always update for smooth progress (but log less frequently)
        if (newState.progress !== this.lastState.progress) {
            // Only log every 10 seconds to avoid spam
            if (Math.floor(newState.progress / 10) !== Math.floor(this.lastState.progress / 10)) {
                logger.debug(`Progress update: ${this.lastState.progress} to ${newState.progress}`);
            }
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
        logger.info('ytMusicRealtime.disconnect() called');
        
        // Clear debug timer
        if (this._debugTimer) {
            clearInterval(this._debugTimer);
            this._debugTimer = null;
        }
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.connecting = false;
        this._handlersRegistered = false;
        this.reconnectAttempts = 0;
        
        logger.info('Socket.IO disconnected and cleaned up');
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

    /**
     * Get the last received state from real-time connection
     * Note: Socket.IO API only sends state updates, doesn't respond to requests
     */
    getLastState() {
        return this.lastState;
    }

    /**
     * Request initial state via REST API (since Socket.IO only sends updates)
     */
    async requestInitialState() {
        if (!this.ytMusicApi.getAuthenticationStatus()) {
            logger.debug('Not authenticated, cannot request initial state');
            return null;
        }

        try {
            logger.debug('Requesting initial state via REST API');
            const state = await this.ytMusicApi.getCurrentState();
            if (state) {
                const formattedState = this.ytMusicApi.formatTrackState(state);
                if (formattedState) {
                    formattedState.lastUpdate = Date.now();
                    this.lastState = formattedState;
                    
                    // Notify callbacks of initial state
                    this.stateUpdateCallbacks.forEach(callback => {
                        try {
                            callback(formattedState, state);
                        } catch (error) {
                            logger.error('Error in initial state callback:', error.message);
                        }
                    });
                    
                    logger.debug('Initial state loaded successfully');
                    return formattedState;
                }
            }
        } catch (error) {
            logger.warn('Failed to request initial state via REST API:', error.message);
        }
        
        return null;
    }

    /**
     * Check if we have recent state data
     */
    hasRecentState(maxAgeMs = 30000) {
        if (!this.lastState || !this.lastState.lastUpdate) {
            return false;
        }
        return (Date.now() - this.lastState.lastUpdate) < maxAgeMs;
    }
}

module.exports = YouTubeMusicRealtime;