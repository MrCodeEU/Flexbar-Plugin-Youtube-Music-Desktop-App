<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Play/Pause Button Settings</v-card-title>
            <v-card-subtitle>Customize appearance and behavior</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <v-row dense>
              <!-- Play Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.playColor"
                      label="Play Icon Color"
                      hint="Icon color when paused (ready to play)"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.playColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.playColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
              </v-col>
              
              <!-- Pause Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.pauseColor"
                      label="Pause Icon Color"
                      hint="Icon color when playing (ready to pause)"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.pauseColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.pauseColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
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
                <strong>How it works:</strong><br>
                • Shows <span style="color: var(--v-theme-success);">Play icon</span> when music is paused<br>
                • Shows <span style="color: var(--v-theme-warning);">Pause icon</span> when music is playing<br>
                • Click to toggle playback state
              </div>
            </v-alert>

            <v-alert
              type="success"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>Pro Tip:</strong> Use contrasting colors for better visibility. Green for play (go) and orange/red for pause (stop) work well.
              </div>
            </v-alert>

            <!-- Preview Section -->
            <v-card
              variant="outlined"
              class="pa-3"
            >
              <div class="text-subtitle-2 mb-2">Preview:</div>
              <div class="d-flex align-center gap-4">
                <div class="d-flex flex-column align-center">
                  <div 
                    class="preview-icon d-flex align-center justify-center"
                    :style="{ backgroundColor: modelValue.data.bgColor }"
                  >
                    <v-icon 
                      :color="modelValue.data.playColor"
                      size="24"
                    >
                      mdi-play
                    </v-icon>
                  </div>
                  <div class="text-caption mt-1">When Paused</div>
                </div>
                
                <div class="d-flex flex-column align-center">
                  <div 
                    class="preview-icon d-flex align-center justify-center"
                    :style="{ backgroundColor: modelValue.data.bgColor }"
                  >
                    <v-icon 
                      :color="modelValue.data.pauseColor"
                      size="24"
                    >
                      mdi-pause
                    </v-icon>
                  </div>
                  <div class="text-caption mt-1">When Playing</div>
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
    playColor: '#00FF00',     // Green for play
    pauseColor: '#FF6600',    // Orange for pause
    bgColor: '#424242'        // Dark gray background
  },
  title: 'Play/Pause'
};

export default {
  name: 'YouTubeMusicPlayPauseButton',
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

.preview-icon {
  width: 60px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
</style>