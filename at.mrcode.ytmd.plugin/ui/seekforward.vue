<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Seek Forward Settings</v-card-title>
            <v-card-subtitle>Configure seek forward amount and appearance</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <v-row dense>
              <!-- Seconds Slider -->
              <v-col cols="12">
                <v-slider
                  v-model="modelValue.data.seconds"
                  label="Seek Forward Seconds"
                  :min="1"
                  :max="100"
                  :step="1"
                  thumb-label="always"
                  color="primary"
                  track-color="grey"
                  @update:model-value="updateSeconds"
                >
                  <template v-slot:prepend>
                    <v-icon color="green">mdi-fast-forward</v-icon>
                  </template>
                  <template v-slot:append>
                    <v-text-field
                      v-model.number="modelValue.data.seconds"
                      type="number"
                      :min="1"
                      :max="100"
                      density="compact"
                      variant="outlined"
                      style="width: 80px;"
                      @update:model-value="updateSeconds"
                    ></v-text-field>
                  </template>
                </v-slider>
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
                • Click the button to skip forward by the configured amount<br>
                • Range: 1-100 seconds (1 second to 10 minutes)<br>
                • Default: 10 seconds
              </div>
            </v-alert>

            <!-- Preview Section -->
            <v-card
              variant="outlined" 
              class="pa-3"
            >
              <div class="text-subtitle-2 mb-2">Current Configuration:</div>
              <div class="text-body-2">
                <v-icon color="green" size="small">mdi-fast-forward</v-icon>
                Skip forward {{ modelValue.data.seconds }} second{{ modelValue.data.seconds !== 1 ? 's' : '' }}
              </div>
              <div class="text-caption mt-1 text-grey">
                {{ formatDuration(modelValue.data.seconds) }}
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
    seconds: 10,
    bgColor: '#424242'    // Dark gray background
  },
  title: 'Seek Forward'
};

export default {
  name: 'YouTubeMusicSeekForward',
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

    updateSeconds(value) {
      const parsedVal = parseInt(value);
      if (isNaN(parsedVal) || parsedVal < 1) {
        this.modelValue.data.seconds = 1;
      } else if (parsedVal > 100) {
        this.modelValue.data.seconds = 100;
      } else {
        this.modelValue.data.seconds = parsedVal;
      }
    },

    formatDuration(seconds) {
      if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
      } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
          return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
          return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
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
