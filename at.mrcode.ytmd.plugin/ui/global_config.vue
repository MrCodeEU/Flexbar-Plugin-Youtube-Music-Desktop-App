<template>
    <v-container class="scrollable-config-container">
        <!-- Notification snackbars -->
        <v-snackbar
            v-model="notifications.save.show"
            timeout="3000"
            color="success"
            location="top"
        >
            <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-check-circle</v-icon>
                <span>{{ notifications.save.message }}</span>
            </div>
        </v-snackbar>
        
        <v-snackbar
            v-model="notifications.auth.show"
            timeout="5000"
            :color="notifications.auth.color"
            location="top"
        >
            <div class="d-flex align-center">
                <v-icon class="mr-2">{{ notifications.auth.icon }}</v-icon>
                <span>{{ notifications.auth.message }}</span>
            </div>
        </v-snackbar>

        <!-- YouTube Music Connection Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item 
                :prepend-icon="isAuthenticated ? 'mdi-youtube-music' : 'mdi-youtube-music'" 
                :color="isAuthenticated ? 'red' : ''"
            >
                <v-card-title>YouTube Music Connection</v-card-title>
                <v-card-subtitle>{{ connectionSubtitle }}</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            
            <v-card-text>
                <!-- App Configuration -->
                <v-text-field 
                    v-model="modelValue.config.appName" 
                    label="App Name" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                    hint="Name displayed in YouTube Music Desktop App"
                    persistent-hint
                ></v-text-field>
                
                <v-text-field 
                    v-model="modelValue.config.appVersion" 
                    label="App Version" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                    hint="Version number for this app"
                    persistent-hint
                ></v-text-field>

                <!-- Connection Status -->
                <v-alert
                    v-if="isAuthenticated"
                    type="success"
                    text="Connected to YouTube Music Desktop App"
                    density="compact"
                    class="mt-3"
                >
                    <template v-slot:append>
                        <v-btn
                            size="small"
                            variant="text"
                            @click="testConnection"
                            :loading="testing"
                        >
                            Test
                        </v-btn>
                    </template>
                </v-alert>

                <v-alert
                    v-else-if="!companionServerRunning"
                    type="warning"
                    class="mt-3"
                    density="compact"
                >
                    <div class="d-flex flex-column">
                        <span class="font-weight-medium">YouTube Music Desktop App Not Detected</span>
                        <span class="text-body-2 mt-1">Please ensure:</span>
                        <ul class="text-body-2 mt-1 ml-4">
                            <li>YouTube Music Desktop App is installed and running</li>
                            <li>Companion Server is enabled in app settings</li>
                            <li>Port 9863 is not blocked by firewall</li>
                        </ul>
                        <v-btn
                            size="small"
                            variant="text"
                            class="mt-2 align-self-start"
                            @click="checkServerStatus"
                            :loading="checkingServer"
                        >
                            Check Again
                        </v-btn>
                    </div>
                </v-alert>

                <v-alert
                    v-else
                    type="info"
                    text="Ready to connect to YouTube Music Desktop App"
                    density="compact"
                    class="mt-3"
                ></v-alert>
            </v-card-text>
            
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                
                <v-btn 
                    v-if="!isAuthenticated && companionServerRunning"
                    color="red"
                    variant="flat"
                    @click="authenticateYouTubeMusic"
                    prepend-icon="mdi-youtube-music"
                    :loading="authenticating"
                    :disabled="!canAuthenticate"
                >
                    Connect
                </v-btn>
                
                <v-btn 
                    v-if="isAuthenticated"
                    color="error"
                    variant="tonal"
                    @click="disconnectYouTubeMusic"
                    prepend-icon="mdi-link-off"
                    class="ml-2"
                >
                    Disconnect
                </v-btn>
                
                <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save Settings
                </v-btn>
            </v-card-actions>
        </v-card>

        <!-- Logging Configuration Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item prepend-icon="mdi-math-log">
                <v-card-title>Logging Configuration</v-card-title>
                <v-card-subtitle>Adjust plugin log verbosity</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            
            <v-card-text>
                <v-select
                    v-model="modelValue.config.logLevel"
                    :items="logLevelOptions"
                    item-title="title"
                    item-value="value"
                    label="Log Level"
                    outlined
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                ></v-select>
                
                <v-alert
                    density="compact"
                    type="info"
                    variant="tonal"
                    icon="mdi-information-outline"
                    text="Changes to log level will apply after saving."
                ></v-alert>
            </v-card-text>
            
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save Log Settings
                </v-btn>
            </v-card-actions>        </v-card>

        <!-- Notification Settings Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item prepend-icon="mdi-bell-outline">
                <v-card-title>Notification Settings</v-card-title>
                <v-card-subtitle>Control which notifications are shown on FlexBar devices</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            
            <v-card-text>
                <v-select
                    v-model="modelValue.config.notificationLevel"
                    :items="notificationLevelOptions"
                    item-title="title"
                    item-value="value"
                    label="Notification Level"
                    outlined
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                ></v-select>
                
                <v-alert
                    density="compact"
                    type="info"
                    variant="tonal"
                    icon="mdi-information-outline"
                    text="Changes to notification level will apply after saving."
                ></v-alert>
            </v-card-text>
            
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save Notification Settings
                </v-btn>
            </v-card-actions>
        </v-card>

        <!-- Real-time Updates Card -->
        <v-card elevation="2" class="mb-4 rounded-lg" v-if="isAuthenticated">
            <v-card-item prepend-icon="mdi-sync">
                <v-card-title>Real-time Updates</v-card-title>
                <v-card-subtitle>Connection status for live updates</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            
            <v-card-text>
                <div class="d-flex align-center justify-space-between mb-3">
                    <div class="d-flex align-center">
                        <v-icon 
                            :color="realTimeStatus.connected ? 'success' : 'warning'"
                            class="mr-2"
                        >
                            {{ realTimeStatus.connected ? 'mdi-wifi' : 'mdi-wifi-off' }}
                        </v-icon>
                        <span>
                            {{ realTimeStatus.connected ? 'Connected' : 'Disconnected' }}
                        </span>
                    </div>
                    
                    <div class="d-flex gap-2">
                        <v-btn
                            variant="outlined"
                            size="small"
                            prepend-icon="mdi-wifi"
                            @click="connectRealTime"
                            :loading="connectingRealTime"
                            :disabled="!isAuthenticated || realTimeStatus.connected"
                        >
                            Connect
                        </v-btn>
                        
                        <v-btn
                            variant="outlined"
                            size="small"
                            prepend-icon="mdi-wifi-check"
                            @click="testRealTimeConnection"
                            :loading="testingRealTime"
                            :disabled="!isAuthenticated"
                        >
                            Test
                        </v-btn>
                    </div>
                </div>
                
                <v-alert
                    v-if="!realTimeStatus.connected && !realTimeTestData"
                    type="info"
                    density="compact"
                    text="Real-time updates will connect automatically when you add a Now Playing key to your FlexBar, or you can connect manually above."
                ></v-alert>

                <!-- Real-time test data display - always visible when available -->
                <v-card v-if="realTimeTestData" variant="outlined" class="mt-3">
                    <v-card-title class="text-h6 pb-2">
                        <v-icon class="mr-2" :color="realTimeTestData.error ? 'error' : 'success'">
                            {{ realTimeTestData.error ? 'mdi-alert-circle' : 'mdi-check-circle' }}
                        </v-icon>
                        Real-time Connection Status
                    </v-card-title>
                    
                    <v-card-text>
                        <div v-if="realTimeTestData.connectionStatus">
                            <h4 class="mb-2">Connection Status:</h4>
                            <div class="d-flex align-center gap-2 mb-2">
                                <v-chip 
                                    :color="realTimeTestData.connectionStatus.isConnected ? 'success' : 'warning'"
                                    size="small"
                                >
                                    {{ realTimeTestData.connectionStatus.isConnected ? 'Connected' : 'Disconnected' }}
                                </v-chip>
                                
                                <v-chip 
                                    :color="realTimeTestData.connectionStatus.hasSocket ? 'success' : 'error'"
                                    size="small"
                                    variant="outlined"
                                >
                                    Socket: {{ realTimeTestData.connectionStatus.hasSocket ? 'Active' : 'None' }}
                                </v-chip>
                            </div>
                            
                            <div class="text-body-2 mb-3">
                                <div><strong>Reconnect Attempts:</strong> {{ realTimeTestData.connectionStatus.reconnectAttempts }}</div>
                                <div v-if="realTimeTestData.timestamp">
                                    <strong>Last Tested:</strong> {{ new Date(realTimeTestData.timestamp).toLocaleTimeString() }}
                                </div>
                            </div>
                        </div>

                        <div v-if="realTimeTestData.currentState" class="mt-4">
                            <h4 class="mb-2">Current Playback State:</h4>
                            <v-card variant="tonal" class="pa-3">
                                <div class="text-body-2">
                                    <div v-if="realTimeTestData.currentState.title">
                                        <strong>Title:</strong> {{ realTimeTestData.currentState.title }}
                                    </div>
                                    <div v-if="realTimeTestData.currentState.artist">
                                        <strong>Artist:</strong> {{ realTimeTestData.currentState.artist }}
                                    </div>
                                    <div>
                                        <strong>Playing:</strong> 
                                        <v-chip 
                                            :color="realTimeTestData.currentState.isPlaying ? 'success' : 'warning'"
                                            size="x-small"
                                            class="ml-1"
                                        >
                                            {{ realTimeTestData.currentState.isPlaying ? 'Yes' : 'No' }}
                                        </v-chip>
                                    </div>
                                    <div v-if="realTimeTestData.currentState.duration">
                                        <strong>Duration:</strong> {{ formatTime(realTimeTestData.currentState.duration) }}
                                    </div>
                                    <div v-if="realTimeTestData.currentState.progress !== undefined">
                                        <strong>Progress:</strong> {{ formatTime(realTimeTestData.currentState.progress) }}
                                    </div>
                                    <div v-if="realTimeTestData.currentState.likeStatus">
                                        <strong>Like Status:</strong> 
                                        <v-chip size="x-small" class="ml-1">{{ realTimeTestData.currentState.likeStatus }}</v-chip>
                                    </div>
                                </div>
                            </v-card>
                        </div>

                        <div v-if="realTimeTestData.error" class="mt-4">
                            <h4 class="mb-2 text-error">Error:</h4>
                            <v-alert type="error" density="compact">
                                {{ realTimeTestData.error }}
                            </v-alert>
                        </div>
                    </v-card-text>
                </v-card>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Object,
            required: true,
        },
    },
    data() {
        return {
            isAuthenticated: true,
            isInitializing: false,
            authenticating: false,
            testing: false,
            checkingServer: false,
            companionServerRunning: false,
            realTimeStatus: {
                connected: false,
                lastUpdate: null
            },
            realTimeTestData: null,
            testingRealTime: false,
            connectingRealTime: false,
            notifications: {
                save: {
                    show: false,
                    message: "Settings have been saved successfully"
                },
                auth: {
                    show: false,
                    message: "",
                    color: "info",
                    icon: "mdi-information"
                }
            },            logLevelOptions: [
                { title: 'Off', value: 'OFF' },
                { title: 'Error', value: 'ERROR' },
                { title: 'Warn', value: 'WARN' },
                { title: 'Info', value: 'INFO' },
                { title: 'Debug', value: 'DEBUG' },
            ],
            notificationLevelOptions: [
                { title: 'Off', value: 'OFF' },
                { title: 'Error Only', value: 'ERROR' },
                { title: 'Warning & Error', value: 'WARNING' },
                { title: 'All (Info, Warning, Error)', value: 'INFO' },
            ],
        };
    },
    computed: {
        canAuthenticate() {
            return this.modelValue.config && 
                   this.modelValue.config.appName && 
                   this.modelValue.config.appVersion &&
                   this.companionServerRunning;
        },
        connectionSubtitle() {
            if (this.isAuthenticated) {
                return 'Connected to YouTube Music Desktop App';
            } else if (!this.companionServerRunning) {
                return 'YouTube Music Desktop App not detected';
            } else {
                return 'Ready to connect';
            }
        }
    },
    watch: {
        'modelValue.config': {
            handler: function(newConfig, oldConfig) {
                if (this.isInitializing) return;
                this.$fd.info('Config changed in watcher:', JSON.parse(JSON.stringify(newConfig)));
                
                if (!oldConfig || 
                    (newConfig.isAuthenticated !== oldConfig.isAuthenticated ||
                     newConfig.token !== oldConfig.token)) {
                    this.checkAuthStatus();
                }
            },
            deep: true,
            immediate: true
        }
    },
    methods: {
        async saveConfig() {
            this.$fd.info('Saving YouTube Music config:', JSON.parse(JSON.stringify(this.modelValue.config)));
            
            try {
                const currentFullConfig = await this.$fd.getConfig() || {};
                const updatedConfig = {
                    ...currentFullConfig,
                    ...this.modelValue.config,
                };

                this.$fd.info('Final config to save:', JSON.parse(JSON.stringify(updatedConfig)));
                await this.$fd.setConfig(updatedConfig);
                
                this.modelValue.config = { ...updatedConfig };
                this.notifications.save.message = "Settings saved successfully";
                this.notifications.save.show = true;
                
                // Update log level
                const response = await this.$fd.sendToBackend({
                    data: 'update-log-level' 
                });
            } catch (error) {
                this.$fd.error('Failed to save config:', error);
                this.notifications.auth.message = `Error saving config: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            }
        },

        async initializeConfig() {
            this.isInitializing = true;
            this.$fd.info('Initializing YouTube Music config...');
            
            try {
                const loadedConfig = await this.$fd.getConfig();
                this.$fd.info('Loaded config from backend:', JSON.parse(JSON.stringify(loadedConfig)));
                  let newConfig = {
                    appName: "FlexBar YouTube Music Plugin",
                    appVersion: "1.0.0",
                    logLevel: 'INFO',
                    notificationLevel: 'ERROR',
                    isAuthenticated: false,
                    token: null,
                    appId: null,
                    ...(loadedConfig || {}),
                };

                // Ensure required fields have values
                if (!newConfig.appName) {
                    newConfig.appName = "FlexBar YouTube Music Plugin";
                }
                if (!newConfig.appVersion) {
                    newConfig.appVersion = "1.0.0";
                }                if (!newConfig.logLevel) {
                    newConfig.logLevel = 'INFO';
                }
                if (!newConfig.notificationLevel) {
                    newConfig.notificationLevel = 'ERROR';
                }

                this.modelValue.config = newConfig;
                this.$fd.info('Final config after initialization:', JSON.parse(JSON.stringify(this.modelValue.config)));
                
                return true;
            } catch (error) {
                this.$fd.error('Failed to initialize config:', error);
                
                if (!this.modelValue.config) {
                    this.modelValue.config = {};
                }
                  // Set defaults on error
                if (typeof this.modelValue.config.logLevel === 'undefined') {
                    this.modelValue.config.logLevel = 'INFO';
                }
                if (typeof this.modelValue.config.notificationLevel === 'undefined') {
                    this.modelValue.config.notificationLevel = 'ERROR';
                }
                if (typeof this.modelValue.config.appName === 'undefined') {
                    this.modelValue.config.appName = "FlexBar YouTube Music Plugin";
                }
                if (typeof this.modelValue.config.appVersion === 'undefined') {
                    this.modelValue.config.appVersion = "1.0.0";
                }
                
                return false;
            } finally {
                this.isInitializing = false;
                this.modelValue.config = { ...this.modelValue.config };
                this.$fd.info('Config initialization finished.');
            }
        },        async checkServerStatus() {
            this.checkingServer = true;
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-check-server'
                });

                if (response && response.success) {
                    this.companionServerRunning = true;
                    this.$fd.info('YouTube Music Desktop App companion server is running');
                } else {
                    this.companionServerRunning = false;
                    this.$fd.warn('YouTube Music Desktop App companion server not accessible:', response?.error || 'Server check failed');
                }
            } catch (error) {
                this.companionServerRunning = false;
                this.$fd.warn('YouTube Music Desktop App companion server not accessible:', error.message);
            } finally {
                this.checkingServer = false;
            }
        },

        async authenticateYouTubeMusic() {
            this.authenticating = true;
            this.notifications.auth.message = "Starting YouTube Music authentication...";
            this.notifications.auth.color = "info";
            this.notifications.auth.icon = "mdi-youtube-music";
            this.notifications.auth.show = true;

            try {                
                // Start authentication flow
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-auth'
                });

                if (!response) {
                    throw new Error("No response received from backend");
                }

                if (response.success) {
                    const updatedConfig = await this.$fd.getConfig();
                    this.modelValue.config = { ...updatedConfig };
                    this.isAuthenticated = true;
                    
                    this.notifications.auth.message = response.message || "Successfully connected to YouTube Music!";
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                    
                    // Save config first
                    await this.saveConfig();

                    // Auto-connect to real-time updates after successful authentication
                    try {
                        await this.connectRealTime();
                    } catch (realtimeError) {
                        this.$fd.warn('Failed to auto-connect to real-time updates:', realtimeError.message);
                        // Don't fail the whole authentication process if realtime fails
                    }
                } else {
                    throw new Error(response.error || "Authentication failed");
                }
            } catch (error) {
                this.$fd.error('Authentication error:', error);
                
                // Special case for 403 - Authorization disabled
                if (error.message && error.message.includes('403') && error.message.includes('AUTHORIZATION_DISABLED')) {
                    this.notifications.auth.message = "Authorization is disabled in YouTube Music Desktop App. Please go to Settings > Integrations and enable 'Companion Authorization'";
                    this.notifications.auth.color = "info";
                    this.notifications.auth.icon = "mdi-information";
                } else {
                    this.notifications.auth.message = `Could not connect to YouTube Music: ${error.message}`;
                    this.notifications.auth.color = "error";
                    this.notifications.auth.icon = "mdi-alert-circle";
                }
            } finally {
                this.authenticating = false;
                this.notifications.auth.show = true;
                this.checkAuthStatus();
            }
        },

        async disconnectYouTubeMusic() {
            this.$fd.info('Disconnecting from YouTube Music...');
            
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-disconnect'
                });

                if (response && response.success) {
                    const updatedConfig = await this.$fd.getConfig();
                    this.modelValue.config = { ...updatedConfig };
                    this.isAuthenticated = false;
                    
                    this.notifications.auth.message = "Successfully disconnected from YouTube Music";
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                } else {
                    throw new Error(response?.error || "Disconnect failed");
                }
            } catch (error) {
                this.$fd.error('Failed to disconnect:', error);
                this.notifications.auth.message = `Error disconnecting: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
            } finally {
                this.notifications.auth.show = true;
                this.checkAuthStatus();
            }
        },

        async testConnection() {
            this.testing = true;
            
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-test'
                });

                if (response && response.success) {
                    this.notifications.auth.message = `Connection test successful! ${response.currentTrack ? `Currently playing: ${response.currentTrack}` : 'No track playing'}`;
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                } else {
                    throw new Error(response?.error || "Test failed");
                }
            } catch (error) {
                this.$fd.error('Connection test failed:', error);
                this.notifications.auth.message = `Connection test failed: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                
                // If test fails, update auth status
                this.checkAuthStatus();
            } finally {
                this.testing = false;
                this.notifications.auth.show = true;
            }
        },

        async testRealTimeConnection() {
            this.testingRealTime = true;
            this.realTimeTestData = null;
            
            try {
                this.$fd.info('Testing real-time connection...');
                
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-test-realtime'
                });

                if (response && response.success) {
                    this.realTimeTestData = response.data;
                    this.$fd.info('Real-time connection test successful:', response.data);
                } else {
                    this.realTimeTestData = {
                        error: response?.error || 'Real-time connection test failed'
                    };
                    this.$fd.warn('Real-time connection test failed:', response?.error);
                }
            } catch (error) {
                this.$fd.error('Real-time connection test error:', error);
                this.realTimeTestData = {
                    error: `Test failed: ${error.message}`
                };
            } finally {
                this.testingRealTime = false;
            }
        },

        async connectRealTime() {
            this.connectingRealTime = true;
            
            try {
                this.$fd.info('Connecting to real-time updates...');
                
                const response = await this.$fd.sendToBackend({
                    data: 'ytmusic-connect-realtime'
                });

                if (response && response.success) {
                    this.realTimeStatus.connected = true;
                    this.$fd.info('Successfully connected to real-time updates');
                    
                    // Auto-test after connecting
                    await this.testRealTimeConnection();
                } else {
                    this.$fd.warn('Failed to connect to real-time updates:', response?.error);
                    this.notifications.auth.message = `Real-time connection failed: ${response?.error || 'Unknown error'}`;
                    this.notifications.auth.color = "warning";
                    this.notifications.auth.icon = "mdi-wifi-off";
                    this.notifications.auth.show = true;
                }
            } catch (error) {
                this.$fd.error('Real-time connection error:', error);
                this.notifications.auth.message = `Real-time connection error: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            } finally {
                this.connectingRealTime = false;
            }
        },

        checkAuthStatus() {
            const wasAuthenticated = this.isAuthenticated;
            this.isAuthenticated = !!(
                this.modelValue.config && 
                this.modelValue.config.isAuthenticated &&
                this.modelValue.config.token
            );
            
            if (wasAuthenticated !== this.isAuthenticated) {
                this.$fd.info('Authentication status changed to:', this.isAuthenticated);
            }
        },

        showError(error) {
            this.$fd.error("Error occurred:", error.message);
            this.notifications.auth.message = `Error: ${error.message || 'An unknown error occurred.'}`;
            this.notifications.auth.color = "error";
            this.notifications.auth.icon = "mdi-alert-circle";
            this.notifications.auth.show = true;
            this.checkAuthStatus();
        },

        formatTime(seconds) {
            if (typeof seconds !== 'number' || isNaN(seconds)) {
                return '-';
            }
            
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        }
    },
    created() {
        this.$fd.info('YouTube Music config component created');
        if (!this.modelValue.config) {
            this.modelValue.config = {};
        }
    },
    async mounted() {
        this.$fd.info('YouTube Music config component mounted');
        
        await this.initializeConfig();
        await this.checkServerStatus();
        
        this.$fd.info('Component fully mounted and initialized');
    }
};
</script>

<style scoped>
.scrollable-config-container {
  max-height: 100vh; 
  overflow-y: auto;
  padding-bottom: 16px;
}

.v-card-item {
    padding-bottom: 12px;
}
</style>