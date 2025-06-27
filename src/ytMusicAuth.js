// YouTube Music Authentication Handler
const logger = require('./loggerWrapper');
const { plugin } = require('@eniac/flexdesigner');

/**
 * YouTube Music Authentication Manager
 * Handles the companion server authentication flow
 */
class YouTubeMusicAuth {
    constructor(ytMusicApi) {
        this.ytMusicApi = ytMusicApi;
        this.isAuthenticated = false;
        this.authenticationInProgress = false;
    }

    /**
     * Initialize authentication from saved config
     */
    async initializeAuthentication() {
        try {
            logger.info('Initializing YouTube Music authentication from config...');
            
            const config = await plugin.getConfig();
            
            if (!config) {
                logger.info('No config found, authentication required');
                return false;
            }

            // Check if we have saved authentication data
            if (config.isAuthenticated && config.token && config.appId) {
                logger.info('Found saved authentication data, validating...');
                
                // Set the token and try to make a test request
                this.ytMusicApi.setToken(config.token, config.appId);
                
                let lastError = null;
                const maxRetries = 10;
                
                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        // Test the token by getting current state
                        await this.ytMusicApi.getCurrentState();
                        this.isAuthenticated = true;
                        logger.info(`Saved authentication is valid${attempt > 0 ? ` (after ${attempt} retries)` : ''}`);
                        return true;
                    } catch (error) {
                        lastError = error;
                        
                        // Handle rate limiting
                        if (error.message.includes('429') && error.message.includes('Rate limit exceeded')) {
                            if (attempt === 0) {
                                // For first retry, wait the specified retry time
                                const retryMatch = error.message.match(/retry in (\d+) seconds/);
                                const retrySeconds = retryMatch ? parseInt(retryMatch[1]) : 3;
                                const waitTime = (retrySeconds + 1) * 1000; // Add 1 second for safety
                                
                                logger.warn(`Rate limit exceeded during authentication test (attempt ${attempt + 1}/${maxRetries}), waiting ${retrySeconds + 1} seconds...`);
                                await new Promise(resolve => setTimeout(resolve, waitTime));
                            } else if (attempt < maxRetries - 1) {
                                // For subsequent retries, wait 1 second
                                logger.warn(`Rate limit exceeded during authentication test (attempt ${attempt + 1}/${maxRetries}), waiting 1 second...`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } else {
                                // Last attempt failed
                                logger.error(`Rate limit exceeded, all ${maxRetries} attempts failed`);
                                break;
                            }
                        } else {
                            // Non-rate limit error, don't retry
                            logger.warn('Saved authentication token is invalid:', error.message);
                            break;
                        }
                    }
                }
                
                // All retries failed, clear authentication
                logger.warn('Authentication validation failed after all retries:', lastError.message);
                await this.clearAuthentication();
                return false;
            } else {
                logger.info('No valid authentication data found in config');
                return false;
            }
        } catch (error) {
            logger.error('Error initializing authentication:', error.message);
            return false;
        }
    }

    /**
     * Start the authentication flow
     */
    async startAuthenticationFlow() {
        if (this.authenticationInProgress) {
            throw new Error('Authentication already in progress');
        }

        if (this.isAuthenticated) {
            logger.info('Already authenticated with YouTube Music');
            return { success: true, message: 'Already authenticated' };
        }

        this.authenticationInProgress = true;

        try {
            // First check if the companion server is running
            const serverRunning = await this.ytMusicApi.checkServerStatus();
            if (!serverRunning) {
                throw new Error('YouTube Music Desktop App is not running or Companion Server is disabled');
            }

            // Get config for app details
            const config = await plugin.getConfig() || {};
            const appName = config.appName || 'FlexBar YouTube Music Plugin';
            const appVersion = config.appVersion || '1.0.0';

            logger.info(`Starting authentication flow for app: ${appName} v${appVersion}`);

            // Step 1: Request authentication code
            const code = await this.ytMusicApi.requestAuthCode(appName, appVersion);
            logger.info('Authentication code received, waiting for user approval...');

            // Step 2: Exchange code for token (this will wait for user interaction)
            const token = await this.ytMusicApi.exchangeCodeForToken(code);

            // Step 3: Save authentication data to config
            const updatedConfig = {
                ...config,
                token: token,
                appId: this.ytMusicApi.getAppId(),
                isAuthenticated: true,
                lastAuthTime: Date.now()
            };

            await plugin.setConfig(updatedConfig);
            this.isAuthenticated = true;

            logger.info('Authentication completed successfully');
            return { 
                success: true, 
                message: 'Successfully authenticated with YouTube Music!' 
            };

        } catch (error) {
            logger.error('Authentication flow failed:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        } finally {
            this.authenticationInProgress = false;
        }
    }

    /**
     * Clear authentication data
     */
    async clearAuthentication() {
        try {
            logger.info('Clearing YouTube Music authentication...');
            
            // Clear API authentication
            this.ytMusicApi.clearAuth();
            this.isAuthenticated = false;

            // Clear config
            const config = await plugin.getConfig() || {};
            const updatedConfig = {
                ...config,
                token: null,
                appId: null,
                isAuthenticated: false,
                lastAuthTime: null
            };

            await plugin.setConfig(updatedConfig);
            logger.info('Authentication cleared successfully');
            
            return true;
        } catch (error) {
            logger.error('Error clearing authentication:', error.message);
            return false;
        }
    }

    /**
     * Get current authentication status
     */
    getAuthenticationStatus() {
        return this.isAuthenticated;
    }

    /**
     * Get authentication info for UI
     */
    getAuthInfo() {
        return {
            isAuthenticated: this.getAuthenticationStatus(),
            appId: this.ytMusicApi.getAppId(),
            hasToken: !!this.ytMusicApi.getToken(),
            authInProgress: this.authenticationInProgress
        };
    }

    /**
     * Test current authentication
     */
    async testAuthentication() {
        if (!this.getAuthenticationStatus()) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const state = await this.ytMusicApi.getCurrentState();
            return { 
                success: true, 
                message: 'Authentication is working',
                hasVideo: !!state.video,
                currentTrack: state.video ? state.video.title : null
            };
        } catch (error) {
            logger.error('Authentication test failed:', error.message);
            
            return { 
                success: false, 
                error: 'Authentication test failed: ' + error.message 
            };
        }
    }

    /**
     * Ensure authentication is valid before making API calls
     */
    async ensureAuthenticated() {
        if (!this.getAuthenticationStatus()) {
            // Try to initialize from config first
            const initialized = await this.initializeAuthentication();
            if (!initialized) {
                throw new Error('YouTube Music authentication required. Please authenticate first.');
            }
        }

        // Double-check with a test call
        const testResult = await this.testAuthentication();
        if (!testResult.success) {
            throw new Error('YouTube Music authentication is invalid: ' + testResult.error);
        }

        return true;
    }
}

module.exports = YouTubeMusicAuth;