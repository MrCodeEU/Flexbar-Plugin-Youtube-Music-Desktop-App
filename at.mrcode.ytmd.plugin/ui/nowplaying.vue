<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Now Playing Settings</v-card-title>
            <v-card-subtitle>Configure appearance and behavior</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <v-row dense>
              <!-- Update Intervals -->
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="modelValue.data.updateInterval"
                  label="Update Interval (ms)"
                  type="number"
                  min="1000"
                  hint="How often to check for updates (min 1000)"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateInterval"
                ></v-text-field>
              </v-col>

              <!-- Font Sizes -->
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.titleFontSize"
                  label="Title Font (px)"
                  type="number"
                  min="8"
                  max="36"
                  hint="8-36px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateTitleFontSize"
                ></v-text-field>
              </v-col>
              
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.artistFontSize"
                  label="Artist Font (px)"
                  type="number"
                  min="8"
                  max="32"
                  hint="8-32px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateArtistFontSize"
                ></v-text-field>
              </v-col>
              
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.timeFontSize"
                  label="Time Info Font (px)"
                  type="number"
                  min="8"
                  max="24"
                  hint="8-24px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateTimeFontSize"
                ></v-text-field>
              </v-col>

              <!-- Progress Bar Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.progressBarColor"
                      label="Progress Bar Color"
                      hint="Color of the progress bar"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                      @update:model-value="updateProgressBarColor"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.progressBarColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.progressBarColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                    @update:model-value="updateProgressBarColor"
                  ></v-color-picker>
                </v-menu>
              </v-col>
            </v-row>
          </v-card-text>
          
          <v-divider></v-divider>
          
          <v-list lines="one" density="compact">
            <v-list-subheader>DISPLAY OPTIONS</v-list-subheader>
            
            <v-list-item title="Show Title">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showTitle" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            
            <v-list-item title="Show Artist Name">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showArtist" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            
            <v-list-item title="Show Progress Bar">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showProgress" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            
            <v-list-item title="Show Time Information">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showTimeInfo" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            
            <v-list-item title="Show Play/Pause Button">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showPlayPause" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
const DEFAULT_MODEL_VALUE = {
  data: {
    updateInterval: 5000, // Default API interval
    showArtist: true,
    showProgress: true,
    showTimeInfo: true,
    showTitle: true,
    showPlayPause: true,
    titleFontSize: 18,
    artistFontSize: 14,
    timeFontSize: 10,
    progressBarColor: '#FF0000' // YouTube Music red
  },
  title: 'No track playing'
};

export default {
  name: 'YouTubeMusicNowPlaying',
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
      
      // Ensure progressBarColor is properly synced between data and style
      if (!this.modelValue.data.progressBarColor) {
        this.modelValue.data.progressBarColor = '#FF0000';
      }
      this.modelValue.style.progressBarColor = this.modelValue.data.progressBarColor;
      
      this.isInitialized = true;
    },

    updateInterval(value) {
      const parsedVal = parseInt(value);
      const minInterval = 1000;
      if (isNaN(parsedVal) || parsedVal < minInterval) {
        this.modelValue.data.updateInterval = minInterval;
      }
    },

    updateTitleFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 36;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.titleFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.titleFontSize = maxSize;
      }
    },

    updateArtistFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 32;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.artistFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.artistFontSize = maxSize;
      }
    },

    updateTimeFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 24;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.timeFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.timeFontSize = maxSize;
      }
    },

    updateProgressBarColor(value) {
      const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(value);
      if (!isValidHex) {
        this.modelValue.data.progressBarColor = '#FF0000';
      }
      if (!this.modelValue.style) this.modelValue.style = {};
      this.modelValue.style.progressBarColor = this.modelValue.data.progressBarColor;
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