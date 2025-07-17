<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Play by ID Settings</v-card-title>
            <v-card-subtitle>Configure video or playlist to play</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <v-row dense>
              <!-- Video ID Input -->
              <v-col cols="12">
                <v-text-field
                  v-model="modelValue.data.videoID"
                  label="Video ID"
                  hint="YouTube Music video ID (e.g., dQw4w9WgXcQ)"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  clearable
                  @update:model-value="updateVideoID"
                >
                  <template v-slot:prepend-inner>
                    <v-icon color="red">mdi-youtube</v-icon>
                  </template>
                </v-text-field>
              </v-col>
              
              <!-- Playlist ID Input -->
              <v-col cols="12">
                <v-text-field
                  v-model="modelValue.data.playlistID"
                  label="Playlist ID"
                  hint="YouTube Music playlist ID (optional, will override video ID)"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  clearable
                  @update:model-value="updatePlaylistID"
                >
                  <template v-slot:prepend-inner>
                    <v-icon color="blue">mdi-playlist-music</v-icon>
                  </template>
                </v-text-field>
              </v-col>

              <!-- Background Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.bgColor"
                      label="Background Color"
                      hint="Button background color"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.bgColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.bgColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
              </v-col>
            </v-row>

            <v-divider class="my-4"></v-divider>

            <!-- Information Section -->
            <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>How to use:</strong><br>
                • Enter a YouTube Music video ID to play a specific song<br>
                • Enter a playlist ID to play a specific playlist<br>
                • Playlist ID takes priority over video ID if both are provided<br>
                • Click the key to start playing the configured content
              </div>
            </v-alert>

            <v-alert
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>Finding IDs:</strong><br>
                • Video ID: From YouTube Music URL like music.youtube.com/watch?v=<strong>dQw4w9WgXcQ</strong><br>
                • Playlist ID: From YouTube Music playlist URL like music.youtube.com/playlist?list=<strong>PLrGvTg...</strong><br>
                • Youtube Music Desktop App: Click on the song, then the three dots then turn on Nerd Mode to see the ID in the top left corner. (alternativelly click share and copy the link)
              </div>
            </v-alert>

            <!-- Preview Section -->
            <v-card
              variant="outlined" 
              class="pa-3"
            >
              <div class="text-subtitle-2 mb-2">Current Configuration:</div>
              <div class="text-body-2">
                <div v-if="modelValue.data.playlistID">
                  <v-icon color="blue" size="small">mdi-playlist-music</v-icon>
                  Playlist: {{ modelValue.data.playlistID.substring(0, 20) }}{{ modelValue.data.playlistID.length > 20 ? '...' : '' }}
                </div>
                <div v-else-if="modelValue.data.videoID">
                  <v-icon color="red" size="small">mdi-youtube</v-icon>
                  Video: {{ modelValue.data.videoID }}
                </div>
                <div v-else class="text-grey">
                  No ID configured
                </div>
              </div>
            </v-card>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
const DEFAULT_MODEL_VALUE = {
  data: {
    videoID: '',
    playlistID: '',
    bgColor: '#424242'    // Dark gray background
  },
  title: 'Play by ID'
};

export default {
  name: 'YouTubeMusicPlayByID',
  props: {
    modelValue: {
      type: Object,
      required: true
    },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      isInitialized: false,
    };
  },
  methods: {
    initializeModelValue() {
      if (!this.modelValue.data) this.modelValue.data = {};
      if (!this.modelValue.style) this.modelValue.style = {};
      
      this.modelValue.data = { ...DEFAULT_MODEL_VALUE.data, ...this.modelValue.data };
      this.modelValue.title = this.modelValue.title || DEFAULT_MODEL_VALUE.title;
      
      this.isInitialized = true;
    },

    updateVideoID(value) {
      // Clean the video ID - remove any URL parts and keep just the ID
      if (value) {
        // Extract ID from various YouTube URL formats
        const videoIdMatch = value.match(/(?:v=|\/watch\?v=|youtu\.be\/|\/embed\/|\/v\/|music\.youtube\.com\/watch\?v=)([^&\n?#]+)/);
        if (videoIdMatch) {
          this.modelValue.data.videoID = videoIdMatch[1];
        } else {
          // Assume it's already just an ID
          this.modelValue.data.videoID = value.trim();
        }
      } else {
        this.modelValue.data.videoID = '';
      }
    },

    updatePlaylistID(value) {
      // Clean the playlist ID - remove any URL parts and keep just the ID
      if (value) {
        // Extract ID from YouTube playlist URL
        const playlistIdMatch = value.match(/(?:list=|\/playlist\?list=)([^&\n?#]+)/);
        if (playlistIdMatch) {
          this.modelValue.data.playlistID = playlistIdMatch[1];
        } else {
          // Assume it's already just an ID
          this.modelValue.data.playlistID = value.trim();
        }
      } else {
        this.modelValue.data.playlistID = '';
      }
    },
  },
  created() {
    this.initializeModelValue();
  }
};
</script>

<style scoped>
:deep(.v-list-item__append > .v-input) {
  margin-left: auto;
}

:deep(.v-list-subheader) {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
</style>